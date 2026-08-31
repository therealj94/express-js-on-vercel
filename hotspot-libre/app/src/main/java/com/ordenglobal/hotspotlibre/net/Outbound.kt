package com.ordenglobal.hotspotlibre.net

import com.ordenglobal.hotspotlibre.core.LogBus
import com.ordenglobal.hotspotlibre.proxy.ProxyServer
import java.net.ConnectException
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/** Motivo por el que no se pudo abrir la conexión de salida. */
sealed class DialError(val reason: String) {
    object Loop : DialError("el destino es este mismo proxy (bucle) — descartado sin salir a la red")
    object Dns : DialError("no se pudo resolver el nombre (DNS del operador o sin señal)")
    object Refused : DialError("el destino rechazó la conexión")
    object Timeout : DialError("el destino no respondió (señal débil u operador bloqueando)")
    class Other(message: String) : DialError(message)
}

class DialResult private constructor(val socket: Socket?, val error: DialError?) {
    companion object {
        fun ok(socket: Socket) = DialResult(socket, null)
        fun fail(error: DialError) = DialResult(null, error)
    }
}

object Outbound {

    private const val CONNECT_TIMEOUT_MS = 10_000

    /** Ventaja que se le da a una familia antes de probar la siguiente. */
    private const val STAGGER_MS = 250L
    /**
     * 15 minutos, no 2. Con 2 minutos se cortaban solas las conexiones que
     * están abiertas pero calladas: notificaciones push, sesiones de juego,
     * pestañas en segundo plano. Con el cierre en cascada de abajo, un
     * temporizador largo ya no deja hilos colgados.
     */
    private const val READ_TIMEOUT_MS = 15 * 60 * 1000

    /**
     * Puertos en los que escuchamos nosotros. Se registran al arrancar.
     *
     * Solo estos cuentan como bucle. Bloquear cualquier destino que sea el
     * propio teléfono sería pasarse: un cliente tiene motivos legítimos para
     * pedirle algo a esta IP — el archivo PAC, sin ir más lejos.
     */
    @Volatile
    var selfPorts: Set<Int> = emptySet()

    /** Familia que funcionó la última vez; ordena los intentos siguientes. */
    @Volatile
    private var preferIpv4: Boolean = true

    private val racers = Executors.newCachedThreadPool { runnable ->
        Thread(runnable, "dial-race").apply { isDaemon = true }
    }

    /**
     * Abre la conexión hacia el destino real.
     *
     * Resuelve el nombre primero para poder comparar la IP con las nuestras:
     * comparar el hostname no serviría, porque cualquier dominio puede
     * apuntar a la IP local y el bucle sería idéntico.
     */
    fun dial(host: String, port: Int): DialResult {
        val addresses = try {
            InetAddress.getAllByName(host)
        } catch (_: UnknownHostException) {
            return DialResult.fail(DialError.Dns)
        }
        if (addresses.isEmpty()) return DialResult.fail(DialError.Dns)

        if (port in selfPorts && addresses.any { LocalAddresses.isSelf(it) }) {
            LogBus.warn("proxy", "Bucle evitado: $host:$port es este mismo proxy")
            return DialResult.fail(DialError.Loop)
        }

        return dialAddresses(addresses.toList(), port)
    }

    /**
     * Intenta las direcciones en carrera, no en fila.
     *
     * Probarlas una detrás de otra parecía razonable y era peor que quedarse
     * con la primera: una IPv6 que el operador anuncia pero no encamina no
     * rechaza la conexión, se queda callada, y hasta que no expiraba el
     * temporizador no se probaba la IPv4 que sí funcionaba. Eso son quince
     * segundos de espera antes de cada dominio con doble familia — la mitad
     * de la web.
     *
     * Se lanzan escalonadas cada 250 ms, alternando familias, y gana la
     * primera que conecte. Las que lleguen tarde se cierran solas.
     */
    @JvmOverloads
    internal fun dialAddresses(
        addresses: List<InetAddress>,
        port: Int,
        connector: (InetAddress, Int) -> Attempt = ::connectTo,
    ): DialResult {
        if (addresses.isEmpty()) return DialResult.fail(DialError.Dns)
        if (addresses.size == 1) {
            return when (val single = connector(addresses.first(), port)) {
                is Attempt.Ok -> DialResult.ok(single.socket)
                is Attempt.Failed -> DialResult.fail(single.error)
            }
        }

        val ordered = interleaveFamilies(addresses)
        val results = LinkedBlockingQueue<Attempt>()
        val deadline = System.nanoTime() + CONNECT_TIMEOUT_MS * 1_000_000L

        // Intentos lanzados de los que todavía no se ha recogido resultado.
        // Llevar bien esta cuenta es lo que permite rendirse en cuanto han
        // contestado todos: sin ella se esperaba el temporizador entero aunque
        // ya se supiera que ninguna dirección iba a funcionar.
        var outstanding = 0
        var lastError: DialError = DialError.Timeout
        var winner: Socket? = null

        for (address in ordered) {
            racers.execute { results.put(connector(address, port)) }
            outstanding++

            when (val attempt = results.poll(STAGGER_MS, TimeUnit.MILLISECONDS)) {
                is Attempt.Ok -> {
                    outstanding--
                    winner = attempt.socket
                }
                is Attempt.Failed -> {
                    outstanding--
                    lastError = attempt.error
                }
                null -> Unit // sigue en camino: se lanza la siguiente familia
            }
            if (winner != null) break
        }

        while (winner == null && outstanding > 0) {
            val remaining = (deadline - System.nanoTime()) / 1_000_000
            if (remaining <= 0) break
            val attempt = results.poll(remaining, TimeUnit.MILLISECONDS) ?: break
            outstanding--
            when (attempt) {
                is Attempt.Ok -> winner = attempt.socket
                is Attempt.Failed -> lastError = attempt.error
            }
        }

        discardLateArrivals(results, outstanding)
        winner?.let { preferIpv4 = it.inetAddress is Inet4Address }
        return winner?.let { DialResult.ok(it) } ?: DialResult.fail(lastError)
    }

    /**
     * Alterna IPv6 e IPv4 empezando por la familia que funcionó la última
     * vez. Sin alternar, un nombre con cinco direcciones IPv6 muertas gasta
     * cinco escalones antes de llegar a la IPv4 buena.
     */
    private fun interleaveFamilies(addresses: List<InetAddress>): List<InetAddress> {
        val (v4, v6) = addresses.partition { it is Inet4Address }
        val first = if (preferIpv4) v4 else v6
        val second = if (preferIpv4) v6 else v4
        return buildList {
            for (i in 0 until maxOf(first.size, second.size)) {
                first.getOrNull(i)?.let { add(it) }
                second.getOrNull(i)?.let { add(it) }
            }
        }
    }

    /** Cierra en segundo plano los sockets de las que llegaron tarde. */
    private fun discardLateArrivals(results: LinkedBlockingQueue<Attempt>, pending: Int) {
        if (pending <= 0) return
        racers.execute {
            repeat(pending) {
                val late = results.poll(CONNECT_TIMEOUT_MS.toLong(), TimeUnit.MILLISECONDS)
                if (late is Attempt.Ok) runCatching { late.socket.close() }
            }
        }
    }

    internal sealed class Attempt {
        class Ok(val socket: Socket) : Attempt()
        class Failed(val error: DialError) : Attempt()
    }

    private fun connectTo(address: InetAddress, port: Int): Attempt {
        val socket = Socket()
        return try {
            socket.tcpNoDelay = true
            socket.soTimeout = READ_TIMEOUT_MS
            socket.keepAlive = true
            // Antes del connect, por la misma razón que en el ServerSocket:
            // la ventana TCP se negocia en el handshake.
            runCatching {
                socket.receiveBufferSize = ProxyServer.SOCKET_BUFFER_BYTES
                socket.sendBufferSize = ProxyServer.SOCKET_BUFFER_BYTES
            }
            socket.connect(InetSocketAddress(address, port), CONNECT_TIMEOUT_MS)
            Attempt.Ok(socket)
        } catch (_: SocketTimeoutException) {
            runCatching { socket.close() }
            Attempt.Failed(DialError.Timeout)
        } catch (_: ConnectException) {
            runCatching { socket.close() }
            Attempt.Failed(DialError.Refused)
        } catch (e: Exception) {
            runCatching { socket.close() }
            Attempt.Failed(DialError.Other(e.message ?: e.javaClass.simpleName))
        }
    }
}

package com.ordenglobal.hotspotlibre.net

import com.ordenglobal.hotspotlibre.core.LogBus
import com.ordenglobal.hotspotlibre.proxy.ProxyServer
import java.net.ConnectException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.UnknownHostException

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

    private const val CONNECT_TIMEOUT_MS = 15_000
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

        // Se prueban todas las direcciones del nombre, no solo la primera.
        // Muchos dominios resuelven a IPv6 e IPv4 a la vez, y según cómo el
        // operador dé la conexión móvil una de las dos familias no sale.
        // Quedarse con la primera hacía que sitios perfectamente accesibles
        // fallaran siempre, sin patrón aparente.
        var lastError: DialError = DialError.Timeout
        for (address in addresses) {
            when (val attempt = connectTo(address, port)) {
                is Attempt.Ok -> return DialResult.ok(attempt.socket)
                is Attempt.Failed -> lastError = attempt.error
            }
        }
        return DialResult.fail(lastError)
    }

    private sealed class Attempt {
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

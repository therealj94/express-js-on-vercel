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
    private const val READ_TIMEOUT_MS = 120_000

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
        val address = try {
            InetAddress.getByName(host)
        } catch (_: UnknownHostException) {
            return DialResult.fail(DialError.Dns)
        }

        if (port in selfPorts && LocalAddresses.isSelf(address)) {
            LogBus.warn("proxy", "Bucle evitado: $host:$port es este mismo proxy")
            return DialResult.fail(DialError.Loop)
        }

        val socket = Socket()
        return try {
            socket.tcpNoDelay = true
            socket.soTimeout = READ_TIMEOUT_MS
            // Antes del connect, por la misma razón que en el ServerSocket:
            // la ventana TCP se negocia en el handshake.
            runCatching {
                socket.receiveBufferSize = ProxyServer.SOCKET_BUFFER_BYTES
                socket.sendBufferSize = ProxyServer.SOCKET_BUFFER_BYTES
            }
            socket.connect(InetSocketAddress(address, port), CONNECT_TIMEOUT_MS)
            DialResult.ok(socket)
        } catch (_: SocketTimeoutException) {
            runCatching { socket.close() }
            DialResult.fail(DialError.Timeout)
        } catch (_: ConnectException) {
            runCatching { socket.close() }
            DialResult.fail(DialError.Refused)
        } catch (e: Exception) {
            runCatching { socket.close() }
            DialResult.fail(DialError.Other(e.message ?: e.javaClass.simpleName))
        }
    }
}

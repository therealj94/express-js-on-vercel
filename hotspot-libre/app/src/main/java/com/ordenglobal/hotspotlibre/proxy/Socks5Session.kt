package com.ordenglobal.hotspotlibre.proxy

import com.ordenglobal.hotspotlibre.core.LogBus
import com.ordenglobal.hotspotlibre.net.DialError
import com.ordenglobal.hotspotlibre.net.Outbound
import java.io.DataInputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.Inet4Address
import java.net.InetAddress
import java.net.Socket

/**
 * SOCKS5 sin autenticación (RFC 1928), solo el comando CONNECT.
 *
 * Es la mejora que más se nota respecto a un proxy solo-HTTP: los juegos y
 * las apps que hablan protocolos propios no entienden un proxy HTTP, pero
 * casi todas saben usar SOCKS5. Sin esto simplemente no navegan.
 */
object Socks5Session {

    private const val VERSION = 0x05
    private const val CMD_CONNECT = 0x01
    private const val ATYP_IPV4 = 0x01
    private const val ATYP_HOST = 0x03
    private const val ATYP_IPV6 = 0x04

    private const val REP_OK = 0x00
    private const val REP_GENERAL_FAILURE = 0x01
    private const val REP_HOST_UNREACHABLE = 0x04
    private const val REP_CONNECTION_REFUSED = 0x05
    private const val REP_CMD_UNSUPPORTED = 0x07

    /** Se entra aquí con el byte de versión (0x05) ya devuelto al stream. */
    fun handle(client: Socket, input: InputStream, output: OutputStream) {
        val data = DataInputStream(input)

        // Saludo: VER | NMETHODS | METHODS...
        if (data.read() != VERSION) return
        val methodCount = data.read()
        if (methodCount <= 0) return
        data.skipBytes(methodCount)
        output.write(byteArrayOf(VERSION.toByte(), 0x00)) // sin autenticación
        output.flush()

        // Petición: VER | CMD | RSV | ATYP | ADDR | PORT
        if (data.read() != VERSION) return
        val command = data.read()
        data.read() // reservado
        val addressType = data.read()

        val host = when (addressType) {
            ATYP_IPV4 -> readIp(data, 4)
            ATYP_IPV6 -> readIp(data, 16)
            ATYP_HOST -> {
                val length = data.read()
                if (length <= 0) return
                val bytes = ByteArray(length)
                data.readFully(bytes)
                String(bytes)
            }
            else -> {
                reply(output, REP_GENERAL_FAILURE)
                return
            }
        } ?: run {
            reply(output, REP_GENERAL_FAILURE)
            return
        }

        val port = ((data.read() and 0xFF) shl 8) or (data.read() and 0xFF)

        if (command != CMD_CONNECT) {
            LogBus.warn("socks5", "Comando $command no soportado (solo CONNECT)")
            reply(output, REP_CMD_UNSUPPORTED)
            return
        }

        val result = Outbound.dial(host, port)
        val upstream = result.socket
        if (upstream == null) {
            val error = result.error
            LogBus.error("socks5", "No se pudo salir a $host:$port → ${error?.reason}")
            reply(
                output,
                when (error) {
                    is DialError.Refused -> REP_CONNECTION_REFUSED
                    is DialError.Dns, is DialError.Timeout, is DialError.Loop -> REP_HOST_UNREACHABLE
                    else -> REP_GENERAL_FAILURE
                },
            )
            return
        }

        reply(output, REP_OK)
        LogBus.ok("socks5", "túnel abierto → $host:$port")

        val upThread = Thread {
            pump(input, upstream.getOutputStream(), Direction.UPLOAD, upstream)
        }
        upThread.start()
        pump(upstream.getInputStream(), output, Direction.DOWNLOAD, client)
        upThread.join()
        runCatching { upstream.close() }
    }

    private fun readIp(data: DataInputStream, size: Int): String? {
        val bytes = ByteArray(size)
        data.readFully(bytes)
        return runCatching { InetAddress.getByAddress(bytes).hostAddress }.getOrNull()
    }

    /**
     * La respuesta lleva siempre 0.0.0.0:0 como dirección de enlace. Los
     * clientes de CONNECT la ignoran, y mandar la IP real del teléfono solo
     * serviría para filtrarla.
     */
    private fun reply(output: OutputStream, code: Int) {
        val bound = (InetAddress.getByName("0.0.0.0") as Inet4Address).address
        val response = ByteArray(10)
        response[0] = VERSION.toByte()
        response[1] = code.toByte()
        response[2] = 0
        response[3] = ATYP_IPV4.toByte()
        System.arraycopy(bound, 0, response, 4, 4)
        runCatching {
            output.write(response)
            output.flush()
        }
    }
}

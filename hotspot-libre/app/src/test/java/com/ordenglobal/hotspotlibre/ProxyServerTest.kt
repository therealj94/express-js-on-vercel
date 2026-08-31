package com.ordenglobal.hotspotlibre

import com.ordenglobal.hotspotlibre.core.Stats
import com.ordenglobal.hotspotlibre.proxy.ProxyServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/**
 * Pruebas de extremo a extremo del proxy: un servidor de origen de juguete,
 * el proxy real en medio, y un cliente que hace el mismo recorrido que hará
 * el teléfono conectado al hotspot.
 */
class ProxyServerTest {

    private lateinit var origin: ServerSocket
    private lateinit var proxy: ProxyServer
    private var proxyPort = 0
    private var originPort = 0

    private val body = "hola"
    private val originResponse =
        "HTTP/1.1 200 OK\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n$body"

    @Before
    fun setUp() {
        origin = ServerSocket(0)
        originPort = origin.localPort
        thread(isDaemon = true) {
            while (!origin.isClosed) {
                val client = runCatching { origin.accept() }.getOrNull() ?: break
                thread(isDaemon = true) {
                    runCatching {
                        client.use {
                            // Consumimos la petición hasta la línea en blanco.
                            val reader = it.getInputStream().bufferedReader()
                            while (true) {
                                val line = reader.readLine() ?: break
                                if (line.isEmpty()) break
                            }
                            it.getOutputStream().write(originResponse.toByteArray())
                            it.getOutputStream().flush()
                        }
                    }
                }
            }
        }

        proxyPort = freePort()
        proxy = ProxyServer(proxyPort)
        proxy.start()
        waitUntilListening(proxyPort)
    }

    @After
    fun tearDown() {
        proxy.stop()
        runCatching { origin.close() }
    }

    @Test
    fun `reenvia una peticion HTTP en forma absoluta`() {
        connectToProxy().use { socket ->
            socket.write(
                "GET http://127.0.0.1:$originPort/ HTTP/1.1\r\n" +
                    "Host: 127.0.0.1:$originPort\r\n" +
                    "Proxy-Connection: keep-alive\r\n\r\n",
            )
            val response = socket.readAll()
            assertTrue("respuesta inesperada: $response", response.startsWith("HTTP/1.1 200"))
            assertTrue("falta el cuerpo: $response", response.endsWith(body))
        }
    }

    @Test
    fun `abre un tunel con CONNECT y deja pasar los bytes`() {
        connectToProxy().use { socket ->
            socket.write("CONNECT 127.0.0.1:$originPort HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
            val status = socket.readLine()
            assertTrue("no se estableció el túnel: $status", status.contains("200"))
            socket.readLine() // línea en blanco del fin de cabeceras

            socket.write("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
            val tunneled = socket.readAll()
            assertTrue("el túnel no transportó datos: $tunneled", tunneled.contains(body))
        }
    }

    @Test
    fun `atiende SOCKS5 en el mismo puerto que HTTP`() {
        Socket().use { socket ->
            socket.connect(InetSocketAddress("127.0.0.1", proxyPort), 3000)
            socket.soTimeout = 5000
            val out = socket.getOutputStream()
            val input = socket.getInputStream()

            out.write(byteArrayOf(0x05, 0x01, 0x00))
            out.flush()
            val greeting = ByteArray(2)
            input.read(greeting)
            assertEquals(0x05, greeting[0].toInt())
            assertEquals(0x00, greeting[1].toInt())

            val host = "127.0.0.1".toByteArray()
            out.write(
                byteArrayOf(0x05, 0x01, 0x00, 0x03, host.size.toByte()) + host +
                    byteArrayOf((originPort shr 8).toByte(), (originPort and 0xFF).toByte()),
            )
            out.flush()
            val reply = ByteArray(10)
            input.read(reply)
            assertEquals("SOCKS5 rechazó la conexión", 0x00, reply[1].toInt())

            out.write("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n".toByteArray())
            out.flush()
            val response = BufferedReader(InputStreamReader(input)).readText()
            assertTrue("el túnel SOCKS5 no transportó datos: $response", response.contains(body))
        }
    }

    @Test
    fun `rechaza el bucle contra su propio puerto`() {
        connectToProxy().use { socket ->
            socket.write("CONNECT 127.0.0.1:$proxyPort HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
            val status = socket.readLine()
            assertTrue("debió cortar el bucle, respondió: $status", status.contains("502"))
        }
    }

    @Test
    fun `deja pasar los destinos locales que no son el proxy`() {
        // El PAC vive en otro puerto del mismo teléfono: no es un bucle.
        connectToProxy().use { socket ->
            socket.write("CONNECT 127.0.0.1:$originPort HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
            assertTrue(socket.readLine().contains("200"))
        }
    }

    @Test
    fun `cuenta los bytes que atraviesan el proxy`() {
        val before = Stats.state.value.totalDown
        connectToProxy().use { socket ->
            socket.write(
                "GET http://127.0.0.1:$originPort/ HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
            )
            socket.readAll()
        }
        assertTrue(
            "los contadores no se movieron",
            Stats.state.value.totalDown > before,
        )
    }

    // --- utilidades ---

    private class ProxyClient(val socket: Socket) : AutoCloseable {
        private val reader = BufferedReader(InputStreamReader(socket.getInputStream()))

        fun write(text: String) {
            socket.getOutputStream().write(text.toByteArray())
            socket.getOutputStream().flush()
        }

        fun readLine(): String = reader.readLine() ?: ""
        fun readAll(): String = reader.readText()
        override fun close() {
            runCatching { socket.close() }
        }
    }

    private fun connectToProxy(): ProxyClient {
        val socket = Socket()
        socket.connect(InetSocketAddress("127.0.0.1", proxyPort), 3000)
        socket.soTimeout = 5000
        return ProxyClient(socket)
    }

    private fun freePort(): Int = ServerSocket(0).use { it.localPort }

    private fun waitUntilListening(port: Int) {
        repeat(50) {
            val ok = runCatching {
                Socket().use { it.connect(InetSocketAddress("127.0.0.1", port), 200) }
                true
            }.getOrDefault(false)
            if (ok) return
            Thread.sleep(50)
        }
        throw IllegalStateException("el proxy no llegó a escuchar en $port")
    }
}

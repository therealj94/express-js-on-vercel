package com.ordenglobal.hotspotlibre

import com.ordenglobal.hotspotlibre.net.PacServer
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket

class PacServerTest {

    /**
     * Los navegadores abren conexiones de reserva y no mandan nada por ellas.
     * Con un servidor de un solo hilo y sin temporizador, la primera de esas
     * deja la página muerta para siempre: es exactamente lo que pasa al
     * intentar abrir la ayuda desde el equipo conectado.
     */
    @Test
    fun `una conexion muda no deja sin servicio a las demas`() {
        val port = ServerSocket(0).use { it.localPort }
        val pac = PacServer(port, port - 1)
        pac.start()
        Thread.sleep(300)

        // Conexión que se abre y se queda callada, como un preconnect.
        val muda = Socket()
        muda.connect(InetSocketAddress("127.0.0.1", port), 3000)

        val page = get(port, "/")
        assertTrue("la conexión muda dejó el servidor colgado: '$page'", page.contains("200"))
        assertTrue("no llegó la página de ayuda", page.contains("Manual"))

        muda.close()
        pac.stop()
    }

    @Test
    fun `sirve a varios equipos a la vez`() {
        val port = ServerSocket(0).use { it.localPort }
        val pac = PacServer(port, port - 1)
        pac.start()
        Thread.sleep(300)

        val results = (1..5).map { get(port, "/proxy.pac") }
        assertTrue("alguna petición se quedó sin respuesta", results.all { it.contains("SOCKS5") })

        pac.stop()
    }

    private fun get(port: Int, path: String): String = Socket().use { socket ->
        socket.connect(InetSocketAddress("127.0.0.1", port), 3000)
        socket.soTimeout = 4000
        socket.getOutputStream().write("GET $path HTTP/1.1\r\nHost: local\r\n\r\n".toByteArray())
        socket.getOutputStream().flush()
        runCatching {
            BufferedReader(InputStreamReader(socket.getInputStream())).readText()
        }.getOrElse { "sin respuesta: ${it.message}" }
    }
}

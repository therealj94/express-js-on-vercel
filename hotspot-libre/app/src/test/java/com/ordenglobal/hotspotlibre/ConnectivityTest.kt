package com.ordenglobal.hotspotlibre

import com.ordenglobal.hotspotlibre.net.Outbound
import com.ordenglobal.hotspotlibre.net.PacServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

class ConnectivityTest {

    /**
     * `localhost` resuelve a ::1 y a 127.0.0.1. Este servidor solo escucha en
     * IPv4, así que si el proxy se quedara con la primera dirección que le
     * devuelve el DNS fallaría la mitad de las veces. Es exactamente lo que
     * pasa en móvil cuando el operador da IPv6 y el destino solo tiene IPv4.
     */
    @Test
    fun `prueba todas las direcciones del nombre, no solo la primera`() {
        val families = InetAddress.getAllByName("localhost").size
        val server = ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))
        thread(isDaemon = true) {
            while (!server.isClosed) {
                runCatching { server.accept().close() }.getOrNull() ?: break
            }
        }

        val result = Outbound.dial("localhost", server.localPort)
        assertNotNull(
            "no conectó pese a haber una dirección buena entre $families",
            result.socket,
        )
        result.socket?.close()
        server.close()
    }

    @Test
    fun `informa de un nombre que no resuelve en vez de colgarse`() {
        val result = Outbound.dial("no-existe.invalido-hotspot-libre", 80)
        assertNull(result.socket)
        assertTrue(result.error?.reason?.contains("resolver") == true)
    }

    /** La página de ayuda tiene que verse ANTES de configurar el proxy. */
    @Test
    fun `sirve la pagina de ayuda y el archivo PAC`() {
        val port = ServerSocket(0).use { it.localPort }
        val pac = PacServer(port, port - 1)
        pac.start()
        Thread.sleep(300)

        val help = get(port, "/")
        assertTrue("la ayuda no trae los pasos: $help", help.contains("Manual"))
        assertTrue("la ayuda no dice el puerto del proxy", help.contains("${port - 1}"))

        val script = get(port, "/proxy.pac")
        assertTrue("el PAC no ofrece SOCKS5: $script", script.contains("SOCKS5"))
        assertTrue("el PAC no deja la red local en directo", script.contains("DIRECT"))

        pac.stop()
    }

    /** Un equipo de fuera de la red local no puede usar los datos móviles. */
    @Test
    fun `el PAC manda la red local en directo para no dar la vuelta`() {
        val port = ServerSocket(0).use { it.localPort }
        val pac = PacServer(port, port - 1)
        pac.start()
        Thread.sleep(300)

        val script = get(port, "/proxy.pac")
        val localRule = script.lines().first { it.contains("192.168.0.0") }
        assertTrue("la regla de red privada no está", localRule.contains("isInNet"))
        assertEquals(1, script.split("return \"DIRECT\";").size - 1)

        pac.stop()
    }

    private fun get(port: Int, path: String): String = Socket().use { socket ->
        socket.connect(InetSocketAddress("127.0.0.1", port), 3000)
        socket.soTimeout = 5000
        socket.getOutputStream().write("GET $path HTTP/1.1\r\nHost: local\r\n\r\n".toByteArray())
        socket.getOutputStream().flush()
        BufferedReader(InputStreamReader(socket.getInputStream())).readText()
    }
}

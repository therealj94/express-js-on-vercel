package com.ordenglobal.hotspotlibre

import com.ordenglobal.hotspotlibre.net.SpeedProbe
import com.ordenglobal.hotspotlibre.proxy.ProxyServer
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.ServerSocket
import kotlin.concurrent.thread

/**
 * La medida tiene que funcionar por los dos caminos contra el mismo origen.
 * No se comprueba la velocidad —en bucle local no significa nada— sino que
 * ambos caminos bajan el contenido entero y que el veredicto acusa a quien
 * corresponde.
 */
class SpeedProbeTest {

    private val payload = 2 * 1024 * 1024

    @Test
    fun `mide por los dos caminos y no acusa al proxy sin motivo`() {
        val origin = ServerSocket(0)
        thread(isDaemon = true) {
            while (!origin.isClosed) {
                val client = runCatching { origin.accept() }.getOrNull() ?: break
                thread(isDaemon = true) {
                    runCatching {
                        client.use {
                            val reader = it.getInputStream().bufferedReader()
                            while (true) {
                                val line = reader.readLine() ?: break
                                if (line.isEmpty()) break
                            }
                            val out = it.getOutputStream()
                            out.write(
                                ("HTTP/1.1 200 OK\r\nContent-Length: $payload\r\n" +
                                    "Connection: close\r\n\r\n").toByteArray(),
                            )
                            val chunk = ByteArray(64 * 1024)
                            repeat(payload / chunk.size) { _ -> out.write(chunk) }
                            out.flush()
                        }
                    }
                }
            }
        }

        val proxyPort = ServerSocket(0).use { it.localPort }
        val proxy = ProxyServer(proxyPort)
        proxy.start()
        Thread.sleep(300)

        val url = "http://127.0.0.1:${origin.localPort}/carga"
        val direct = SpeedProbe.measureDirect(url)
        val proxied = SpeedProbe.measureThroughProxy(proxyPort, url)

        assertTrue("la medida directa falló: ${direct.error}", direct.ok)
        assertTrue("la medida por el proxy falló: ${proxied.error}", proxied.ok)
        assertTrue("bajó de menos por el proxy", proxied.bytes.toInt() == payload)
        assertTrue("bajó de menos directo", direct.bytes.toInt() == payload)

        val text = SpeedProbe.verdict(direct, proxied)
        assertTrue("el veredicto no da números: $text", text.contains("Mbps"))

        proxy.stop()
        origin.close()
    }

    @Test
    fun `si el telefono no tiene salida lo dice, en vez de culpar al proxy`() {
        val sinSalida = SpeedProbe.measureDirect("http://no-existe.invalido-hotspot/x")
        val tampoco = SpeedProbe.measureThroughProxy(1, "http://no-existe.invalido-hotspot/x")
        val text = SpeedProbe.verdict(sinSalida, tampoco)
        assertTrue("debería señalar la falta de señal: $text", text.contains("Sin señal"))
    }
}

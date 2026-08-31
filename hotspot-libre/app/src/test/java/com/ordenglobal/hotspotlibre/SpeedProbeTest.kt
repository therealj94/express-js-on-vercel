package com.ordenglobal.hotspotlibre

import com.ordenglobal.hotspotlibre.net.DownloadUrl
import com.ordenglobal.hotspotlibre.net.SpeedProbe
import com.ordenglobal.hotspotlibre.net.SpeedResult
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

    // Cada conexión baja esto; con 4 en paralelo y 2 rondas, el total medido
    // tiene que superarlo con holgura.
    private val payload = 256 * 1024

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

        val url = DownloadUrl { "http://127.0.0.1:${origin.localPort}/carga?bytes=$it" }
        val direct = SpeedProbe.measureDirect(url)
        val proxied = SpeedProbe.measureThroughProxy(proxyPort, url)

        assertTrue("la medida directa falló: ${direct.error}", direct.ok)
        assertTrue("la medida por el proxy falló: ${proxied.error}", proxied.ok)
        assertTrue("bajó de menos por el proxy: ${proxied.bytes}", proxied.bytes > payload)
        assertTrue("bajó de menos directo: ${direct.bytes}", direct.bytes > payload)

        val text = SpeedProbe.verdict(direct, proxied)
        assertTrue("el veredicto no da números: $text", text.contains("Mbps"))
        assertTrue("sigue mostrando una espera negativa: $text", !text.contains("añade -"))

        proxy.stop()
        origin.close()
    }

    /** Una medida más lenta por el proxy que la directa no puede leerse como
     *  «el proxy va más rápido que la red»: es ruido, y decir «añade -454 ms»
     *  era absurdo delante del usuario. */
    @Test
    fun `nunca informa de una espera negativa`() {
        val rapido = SpeedResult("directo", 10.0, 900, 1_000_000)
        val lento = SpeedResult("proxy", 9.5, 400, 1_000_000)
        val text = SpeedProbe.verdict(rapido, lento)
        assertTrue("muestra una espera negativa: $text", !text.contains("-"))
        assertTrue("no explica que no hay espera añadida: $text", text.contains("sin espera"))
    }

    @Test
    fun `no acusa al proxy por una diferencia dentro del ruido`() {
        val directo = SpeedResult("directo", 2.0, 300, 1_000_000)
        val porProxy = SpeedResult("proxy", 1.3, 320, 1_000_000)
        val text = SpeedProbe.verdict(directo, porProxy)
        assertTrue("acusa al proxy con 0,7 Mbps de diferencia: $text", text.contains("ruido"))
    }

    @Test
    fun `si el telefono no tiene salida lo dice, en vez de culpar al proxy`() {
        val muerta = DownloadUrl { "http://no-existe.invalido-hotspot/x" }
        val sinSalida = SpeedProbe.measureDirect(muerta)
        val tampoco = SpeedProbe.measureThroughProxy(1, muerta)
        val text = SpeedProbe.verdict(sinSalida, tampoco)
        assertTrue("debería señalar la falta de señal: $text", text.contains("Sin señal"))
    }
}

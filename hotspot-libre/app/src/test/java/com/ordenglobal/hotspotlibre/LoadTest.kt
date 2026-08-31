package com.ordenglobal.hotspotlibre

import com.ordenglobal.hotspotlibre.core.LogBus
import com.ordenglobal.hotspotlibre.core.Stats
import com.ordenglobal.hotspotlibre.proxy.ProxyServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.junit.Test
import java.io.DataInputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicLong
import kotlin.concurrent.thread

/**
 * Speedtest sintético: muchas conexiones en paralelo mientras la pantalla
 * está abierta consumiendo logs y contadores, que es la situación real en
 * la que el usuario mide la velocidad.
 */
class LoadTest {

    private val connections = 64
    private val mbPerConnection = 4

    @Test
    fun `rendimiento con carga y pantalla abierta`() {
        val origin = ServerSocket(0)
        thread(isDaemon = true) {
            while (!origin.isClosed) {
                val client = runCatching { origin.accept() }.getOrNull() ?: break
                thread(isDaemon = true) {
                    runCatching {
                        client.use {
                            it.getInputStream().read(ByteArray(1))
                            val chunk = ByteArray(32 * 1024)
                            val out = it.getOutputStream()
                            repeat(mbPerConnection * 1024 * 1024 / chunk.size) { _ -> out.write(chunk) }
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

        // La pantalla abierta: dos colectores, como los de MainActivity.
        val ui = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val renders = AtomicLong()
        ui.launch { LogBus.lines.collect { renders.incrementAndGet() } }
        ui.launch { Stats.state.collect { renders.incrementAndGet() } }

        val total = AtomicLong()
        val ready = CountDownLatch(connections)
        val go = CountDownLatch(1)
        val done = CountDownLatch(connections)

        repeat(connections) {
            thread(isDaemon = true) {
                runCatching {
                    val socket = Socket()
                    socket.connect(InetSocketAddress("127.0.0.1", proxyPort), 5000)
                    socket.soTimeout = 60_000
                    val out = socket.getOutputStream()
                    out.write("CONNECT 127.0.0.1:${origin.localPort} HTTP/1.1\r\n\r\n".toByteArray())
                    out.flush()
                    val input = DataInputStream(socket.getInputStream())
                    var blanks = 0
                    while (blanks < 2) {
                        val b = input.read()
                        if (b < 0) break
                        if (b == '\n'.code) blanks++ else if (b != '\r'.code) blanks = 0
                    }
                    ready.countDown()
                    go.await()
                    out.write(byteArrayOf(1))
                    out.flush()

                    val buffer = ByteArray(32 * 1024)
                    var got = 0L
                    while (got < mbPerConnection * 1024L * 1024L) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        got += read
                    }
                    total.addAndGet(got)
                    socket.close()
                }
                done.countDown()
            }
        }

        ready.await()
        val started = System.nanoTime()
        go.countDown()
        done.await()
        val seconds = (System.nanoTime() - started) / 1e9
        val mbps = (total.get() * 8 / 1e6) / seconds

        println(
            "CARGA: ${"%.0f".format(mbps)} Mbps agregados · " +
                "${"%.0f".format(total.get() / 1e6)} MB en ${"%.2f".format(seconds)} s · " +
                "${renders.get()} emisiones a la UI",
        )

        ui.cancel()
        proxy.stop()
        origin.close()
    }
}

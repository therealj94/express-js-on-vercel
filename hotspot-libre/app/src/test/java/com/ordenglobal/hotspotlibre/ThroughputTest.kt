package com.ordenglobal.hotspotlibre

import com.ordenglobal.hotspotlibre.proxy.ProxyServer
import org.junit.Test
import java.io.DataInputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/** Mide cuánto ancho de banda deja pasar el proxy en un túnel CONNECT. */
class ThroughputTest {

    private val payloadMb = 200

    @Test
    fun `rendimiento de un tunel`() {
        val origin = ServerSocket(0)
        thread(isDaemon = true) {
            while (!origin.isClosed) {
                val client = runCatching { origin.accept() }.getOrNull() ?: break
                thread(isDaemon = true) {
                    runCatching {
                        client.use {
                            it.getInputStream().read(ByteArray(1))
                            val chunk = ByteArray(64 * 1024)
                            val out = it.getOutputStream()
                            repeat(payloadMb * 1024 * 1024 / chunk.size) { out.write(chunk) }
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

        val socket = Socket()
        socket.connect(InetSocketAddress("127.0.0.1", proxyPort), 3000)
        socket.soTimeout = 60_000
        val out = socket.getOutputStream()
        out.write("CONNECT 127.0.0.1:${origin.localPort} HTTP/1.1\r\n\r\n".toByteArray())
        out.flush()

        val input = DataInputStream(socket.getInputStream())
        // Descartamos la respuesta del proxy hasta la línea en blanco.
        var blanks = 0
        while (blanks < 2) {
            val b = input.read()
            if (b == '\n'.code) blanks++ else if (b != '\r'.code) blanks = 0
        }
        out.write(byteArrayOf(1)) // dispara el envío del origen
        out.flush()

        val buffer = ByteArray(64 * 1024)
        var total = 0L
        val started = System.nanoTime()
        while (total < payloadMb * 1024L * 1024L) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
        }
        val seconds = (System.nanoTime() - started) / 1e9
        val mbps = (total * 8 / 1e6) / seconds

        println("THROUGHPUT: ${"%.0f".format(mbps)} Mbps (${"%.1f".format(total / 1e6)} MB en ${"%.2f".format(seconds)} s)")

        socket.close()
        proxy.stop()
        origin.close()
    }
}

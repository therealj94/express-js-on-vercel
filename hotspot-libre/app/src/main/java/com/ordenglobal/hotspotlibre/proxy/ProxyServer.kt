package com.ordenglobal.hotspotlibre.proxy

import com.ordenglobal.hotspotlibre.core.LogBus
import com.ordenglobal.hotspotlibre.core.Stats
import com.ordenglobal.hotspotlibre.core.humanBytes
import com.ordenglobal.hotspotlibre.net.Outbound
import java.io.PushbackInputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Escucha en un puerto y atiende HTTP y SOCKS5 en el mismo, distinguiéndolos
 * por el primer byte. Un solo puerto que configurar en cada dispositivo.
 */
class ProxyServer(
    private val port: Int,
    /** Corte automático al llegar a estos bytes de sesión; 0 = sin límite. */
    private val dataCapBytes: Long = 0,
    private val onCapReached: () -> Unit = {},
) {

    private var serverSocket: ServerSocket? = null
    @Volatile private var running = false
    private var capAnnounced = false

    private val workers = Executors.newCachedThreadPool { runnable ->
        Thread(runnable, "proxy-worker").apply { isDaemon = true }
    } as ThreadPoolExecutor

    fun start() {
        if (running) return
        running = true
        Outbound.selfPorts = Outbound.selfPorts + port
        thread(name = "proxy-accept", isDaemon = true) { acceptLoop() }
    }

    fun stop() {
        running = false
        Outbound.selfPorts = Outbound.selfPorts - port
        runCatching { serverSocket?.close() }
        workers.shutdownNow()
        LogBus.info("proxy", "Proxy detenido")
    }

    fun isRunning(): Boolean = running

    private fun acceptLoop() {
        try {
            val socket = ServerSocket()
            socket.reuseAddress = true
            socket.bind(InetSocketAddress("0.0.0.0", port), 128)
            serverSocket = socket
            LogBus.ok("proxy", "Escuchando en el puerto $port (HTTP + SOCKS5)")
        } catch (e: Exception) {
            running = false
            LogBus.error("proxy", "No se pudo abrir el puerto $port: ${e.message ?: "ocupado"}")
            return
        }

        while (running) {
            val client = try {
                serverSocket?.accept() ?: break
            } catch (e: Exception) {
                if (running) LogBus.error("proxy", "Fallo aceptando conexión: ${e.message}")
                break
            }
            workers.execute { serve(client) }
        }
    }

    private fun serve(client: Socket) {
        Stats.connectionOpened()
        try {
            if (overCap()) {
                runCatching { client.close() }
                return
            }
            client.tcpNoDelay = true
            client.soTimeout = 120_000

            val input = PushbackInputStream(client.getInputStream(), 1)
            val output = client.getOutputStream()

            val first = input.read()
            if (first < 0) return
            input.unread(first)

            if (first == 0x05) {
                Socks5Session.handle(client, input, output)
            } else {
                val line = HttpSession.readLine(input) ?: return
                if (line.isBlank()) return
                HttpSession.handle(client, input, output, line)
            }
        } catch (_: Exception) {
            // Cliente que se va a mitad del handshake: ruido, no error.
        } finally {
            runCatching { client.close() }
            Stats.connectionClosed()
        }
    }

    /** Corta el tráfico nuevo al llegar al límite, avisando una sola vez. */
    private fun overCap(): Boolean {
        if (dataCapBytes <= 0) return false
        if (Stats.sessionTotal() < dataCapBytes) return false
        if (!capAnnounced) {
            capAnnounced = true
            LogBus.warn("proxy", "Límite de ${dataCapBytes.humanBytes()} alcanzado — no se aceptan conexiones nuevas")
            onCapReached()
        }
        return true
    }

    fun awaitTermination() {
        runCatching { workers.awaitTermination(2, TimeUnit.SECONDS) }
    }
}

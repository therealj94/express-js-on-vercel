package com.ordenglobal.hotspotlibre.proxy

import com.ordenglobal.hotspotlibre.core.LogBus
import com.ordenglobal.hotspotlibre.core.Stats
import com.ordenglobal.hotspotlibre.core.humanBytes
import com.ordenglobal.hotspotlibre.net.Outbound
import java.io.BufferedInputStream
import java.io.PushbackInputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
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

    /**
     * Un solo pool para las dos direcciones de cada conexión. Antes cada
     * relay creaba un hilo suelto para la subida: con las ~100 conexiones
     * que abre un speedtest eso son 200 hilos nuevos con su pila cada uno,
     * creados y tirados en segundos. Aquí se reciclan.
     */
    private val workers = Executors.newCachedThreadPool { runnable ->
        Thread(runnable, "proxy-worker").apply { isDaemon = true }
    } as ThreadPoolExecutor

    /** Ejecuta en el pool; si está saturado, en un hilo propio antes que perder la conexión. */
    fun execute(task: Runnable) {
        try {
            workers.execute(task)
        } catch (_: RejectedExecutionException) {
            Thread(task, "proxy-overflow").apply { isDaemon = true }.start()
        }
    }

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
            // Antes del bind: el tamaño de ventana se negocia en el
            // handshake, así que fijarlo después no serviría de nada. Con la
            // ventana por defecto, un enlace móvil de 50 Mbps y 100 ms de
            // latencia se queda muy por debajo de su capacidad.
            socket.receiveBufferSize = SOCKET_BUFFER_BYTES
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
        if (Stats.activeConnections() >= MAX_CONCURRENT) {
            // Cada relay ocupa dos hilos bloqueados. Sin techo, una tanda de
            // pestañas puede dejar al teléfono con cientos de hilos y quitarle
            // al propio proxy la CPU que necesita.
            LogBus.warn("proxy", "$MAX_CONCURRENT conexiones a la vez: se rechazan nuevas hasta que bajen")
            runCatching { client.close() }
            return
        }
        Stats.connectionOpened()
        try {
            if (overCap()) {
                runCatching { client.close() }
                return
            }
            if (!isLocalClient(client)) {
                LogBus.warn("proxy", "Rechazado ${client.inetAddress?.hostAddress}: no es de la red local")
                runCatching { client.close() }
                return
            }
            client.tcpNoDelay = true
            client.soTimeout = CLIENT_IDLE_TIMEOUT_MS
            client.keepAlive = true
            runCatching { client.sendBufferSize = SOCKET_BUFFER_BYTES }

            // Buffer antes del pushback: la cabecera se lee byte a byte y sin
            // esto cada byte es una llamada al sistema. El relay lee después
            // de este mismo stream, así que nada de lo bufferizado se pierde.
            val input = PushbackInputStream(BufferedInputStream(client.getInputStream(), 32 * 1024), 1)
            val output = client.getOutputStream()

            val first = input.read()
            if (first < 0) return
            input.unread(first)

            if (first == 0x05) {
                Socks5Session.handle(this, client, input, output)
            } else {
                val line = HttpSession.readLine(input) ?: return
                if (line.isBlank()) return
                HttpSession.handle(this, client, input, output, line)
            }
        } catch (_: Exception) {
            // Cliente que se va a mitad del handshake: ruido, no error.
        } finally {
            runCatching { client.close() }
            Stats.connectionClosed()
        }
    }

    /**
     * Solo atiende a quien está en la red local.
     *
     * El proxy escucha en 0.0.0.0 porque la IP del hotspot aparece y cambia
     * sola. El efecto colateral es que, con el teléfono conectado a un wifi
     * ajeno, cualquiera de esa red podría salir a internet por tus datos
     * móviles. Esto lo cierra sin depender de a qué interfaz se ató.
     */
    private fun isLocalClient(client: Socket): Boolean {
        val address = client.inetAddress ?: return false
        return address.isLoopbackAddress ||
            address.isSiteLocalAddress ||
            address.isLinkLocalAddress ||
            address.isAnyLocalAddress
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

    companion object {
        /** 512 KB cubre el producto ancho de banda × latencia de un enlace móvil rápido. */
        const val SOCKET_BUFFER_BYTES = 512 * 1024

        /** Mismo criterio que la salida: no matar conexiones abiertas pero calladas. */
        const val CLIENT_IDLE_TIMEOUT_MS = 15 * 60 * 1000

        /**
         * Techo de conexiones simultáneas. Un navegador rara vez pasa de cien;
         * esto no estorba al uso normal y evita que el teléfono se ahogue.
         */
        const val MAX_CONCURRENT = 256
    }

    fun awaitTermination() {
        runCatching { workers.awaitTermination(2, TimeUnit.SECONDS) }
    }
}

package com.ordenglobal.hotspotlibre.net

import com.ordenglobal.hotspotlibre.core.LogBus
import java.io.BufferedInputStream
import java.io.InputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.util.concurrent.Executors
import kotlin.concurrent.thread

/**
 * Sirve un archivo PAC en http://IP:PUERTO/proxy.pac
 *
 * Ventaja sobre escribir IP y puerto a mano en cada dispositivo: la URL no
 * cambia aunque después cambies el puerto del proxy, y en Windows, macOS y
 * escritorios Linux se pega una sola vez en «configuración automática».
 *
 * No es WPAD completo: el descubrimiento automático exige servir en el
 * puerto 80, y Android no deja a una app sin root abrir puertos bajo 1024.
 */
class PacServer(private val port: Int, private val proxyPort: Int) {

    private companion object {
        /** Una petición que no se completa en este tiempo se descarta. */
        const val REQUEST_TIMEOUT_MS = 10_000
    }

    private var serverSocket: ServerSocket? = null
    @Volatile private var running = false

    private val workers = Executors.newCachedThreadPool { runnable ->
        Thread(runnable, "pac-worker").apply { isDaemon = true }
    }

    fun start() {
        if (running) return
        running = true
        thread(name = "pac-server", isDaemon = true) { loop() }
    }

    fun stop() {
        running = false
        runCatching { serverSocket?.close() }
        workers.shutdownNow()
    }

    fun url(): String? = LocalAddresses.hotspotIp()?.let { "http://$it:$port/proxy.pac" }

    /** Página de instrucciones para abrir desde el equipo recién conectado. */
    fun setupUrl(): String? = LocalAddresses.hotspotIp()?.let { "http://$it:$port/" }

    private fun loop() {
        try {
            val socket = ServerSocket()
            socket.reuseAddress = true
            socket.bind(InetSocketAddress("0.0.0.0", port), 16)
            serverSocket = socket
            LogBus.ok("pac", "Ayuda de conexión en ${setupUrl() ?: "el puerto $port"}")
        } catch (e: Exception) {
            running = false
            LogBus.error(
                "pac",
                "La página de ayuda NO está disponible: el puerto $port está ocupado " +
                    "(${e.message}). Cambia el puerto del proxy y vuelve a arrancar.",
            )
            return
        }

        while (running) {
            val client = try {
                serverSocket?.accept() ?: break
            } catch (_: Exception) {
                if (running) continue else break
            }

            // Un hilo por petición, y con temporizador. Atendiéndolas en fila,
            // la primera conexión que se abre y no manda nada —los navegadores
            // abren varias de reserva— dejaba la página muerta para siempre.
            workers.execute {
                runCatching {
                    client.soTimeout = REQUEST_TIMEOUT_MS
                    client.use {
                        val path = readRequestPath(BufferedInputStream(it.getInputStream(), 4096))
                        val (type, body) = if (path.startsWith("/proxy.pac")) {
                            "application/x-ns-proxy-autoconfig" to pacBody()
                        } else {
                            "text/html; charset=utf-8" to SetupPage.html(LocalAddresses.hotspotIp(), proxyPort, port)
                        }
                        val bytes = body.toByteArray()
                        val response = "HTTP/1.1 200 OK\r\n" +
                            "Content-Type: $type\r\n" +
                            "Content-Length: ${bytes.size}\r\n" +
                            "Connection: close\r\n\r\n"
                        it.getOutputStream().write(response.toByteArray() + bytes)
                        it.getOutputStream().flush()
                    }
                }
            }
        }
    }

    /** Devuelve la ruta pedida y consume el resto de la petición. */
    private fun readRequestPath(input: InputStream): String {
        val first = StringBuilder()
        var consecutiveNewlines = 0
        var read = 0
        var line = 0
        while (read < 8192) {
            val byte = input.read()
            if (byte < 0) break
            read++
            if (byte == '\n'.code) {
                consecutiveNewlines++
                line++
                if (consecutiveNewlines == 2) break
            } else if (byte != '\r'.code) {
                consecutiveNewlines = 0
                if (line == 0) first.append(byte.toChar())
            }
        }
        return first.toString().split(" ").getOrNull(1) ?: "/"
    }

    /**
     * SOCKS5 primero porque cubre todo protocolo; PROXY como respaldo para
     * clientes que solo entienden HTTP; DIRECT al final para que las IPs de
     * la propia red local no den la vuelta por el teléfono — eso sería el
     * bucle que el proxy después tendría que rechazar.
     */
    private fun pacBody(): String {
        val ip = LocalAddresses.hotspotIp() ?: "127.0.0.1"
        return """
            function FindProxyForURL(url, host) {
              if (isPlainHostName(host) ||
                  shExpMatch(host, "*.local") ||
                  isInNet(dnsResolve(host), "192.168.0.0", "255.255.0.0") ||
                  isInNet(dnsResolve(host), "10.0.0.0", "255.0.0.0") ||
                  isInNet(dnsResolve(host), "172.16.0.0", "255.240.0.0") ||
                  isInNet(dnsResolve(host), "127.0.0.0", "255.0.0.0")) {
                return "DIRECT";
              }
              return "SOCKS5 $ip:$proxyPort; PROXY $ip:$proxyPort; DIRECT";
            }
        """.trimIndent()
    }
}

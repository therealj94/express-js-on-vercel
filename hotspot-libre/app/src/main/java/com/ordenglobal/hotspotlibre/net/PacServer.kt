package com.ordenglobal.hotspotlibre.net

import com.ordenglobal.hotspotlibre.core.LogBus
import java.io.InputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
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

    private var serverSocket: ServerSocket? = null
    @Volatile private var running = false

    fun start() {
        if (running) return
        running = true
        thread(name = "pac-server", isDaemon = true) { loop() }
    }

    fun stop() {
        running = false
        runCatching { serverSocket?.close() }
    }

    fun url(): String? = LocalAddresses.hotspotIp()?.let { "http://$it:$port/proxy.pac" }

    private fun loop() {
        try {
            val socket = ServerSocket()
            socket.reuseAddress = true
            socket.bind(InetSocketAddress("0.0.0.0", port), 16)
            serverSocket = socket
            LogBus.ok("pac", "Archivo PAC disponible en ${url() ?: "el puerto $port"}")
        } catch (e: Exception) {
            running = false
            LogBus.warn("pac", "No se pudo publicar el PAC en $port: ${e.message}")
            return
        }

        while (running) {
            val client = try {
                serverSocket?.accept() ?: break
            } catch (_: Exception) {
                break
            }
            runCatching {
                client.use {
                    drainRequest(it.getInputStream())
                    val body = pacBody()
                    val response = "HTTP/1.1 200 OK\r\n" +
                        "Content-Type: application/x-ns-proxy-autoconfig\r\n" +
                        "Content-Length: ${body.toByteArray().size}\r\n" +
                        "Connection: close\r\n\r\n$body"
                    it.getOutputStream().write(response.toByteArray())
                    it.getOutputStream().flush()
                }
            }
        }
    }

    private fun drainRequest(input: InputStream) {
        var consecutiveNewlines = 0
        var read = 0
        while (read < 8192) {
            val byte = input.read()
            if (byte < 0) return
            read++
            if (byte == '\n'.code) {
                consecutiveNewlines++
                if (consecutiveNewlines == 2) return
            } else if (byte != '\r'.code) {
                consecutiveNewlines = 0
            }
        }
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

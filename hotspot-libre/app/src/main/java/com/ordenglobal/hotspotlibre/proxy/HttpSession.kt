package com.ordenglobal.hotspotlibre.proxy

import com.ordenglobal.hotspotlibre.core.LogBus
import com.ordenglobal.hotspotlibre.core.Stats
import com.ordenglobal.hotspotlibre.core.TunnelLog
import com.ordenglobal.hotspotlibre.net.LocalAddresses
import com.ordenglobal.hotspotlibre.net.Outbound
import com.ordenglobal.hotspotlibre.net.SetupPage
import java.io.InputStream
import java.io.OutputStream
import java.net.Socket
import java.net.URI
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Lado HTTP del proxy: CONNECT para túneles TLS y forma absoluta para HTTP plano.
 *
 * Las conexiones se manejan de a una petición y se cierran (`Connection: close`).
 * Reusar la conexión obligaría a re-parsear cada petición para ver si cambió
 * de host, y a esa complejidad no le corresponde ninguna ganancia real aquí.
 */
object HttpSession {

    private val HOP_BY_HOP = setOf(
        "connection", "proxy-connection", "keep-alive", "transfer-encoding",
        "te", "trailer", "upgrade", "proxy-authenticate", "proxy-authorization",
    )

    /**
     * En una petición de cambio de protocolo, `Connection` y `Upgrade` no son
     * cabeceras de salto: son la petición misma. Quitarlas —que es lo que
     * manda hacer la regla general— convertía cada WebSocket sobre HTTP en un
     * 200 normal que el cliente no entiende. Speedtest usa exactamente eso
     * cuando no puede ir por HTTPS, y responde «socket error».
     */
    private val HOP_BY_HOP_ON_UPGRADE = HOP_BY_HOP - setOf("connection", "upgrade")

    fun handle(
        server: ProxyServer,
        client: Socket,
        input: InputStream,
        output: OutputStream,
        firstLine: String,
    ) {
        val parts = firstLine.split(" ")
        if (parts.size < 3) {
            fail(output, 400, "Petición mal formada")
            return
        }
        val (method, target) = parts[0].uppercase() to parts[1]
        val headers = readHeaders(input)

        if (method == "CONNECT") {
            tunnel(server, client, input, output, target)
        } else if (target.startsWith("/")) {
            // Petición en forma origen: no viene de un cliente configurado con
            // proxy, sino de alguien que escribió esta dirección en el
            // navegador. En vez de un error incomprensible, se le da la
            // página que explica cómo configurarlo.
            serveSetupPage(output, server.port)
        } else {
            forward(server, client, input, output, method, target, parts[2], headers)
        }
    }

    private fun serveSetupPage(output: OutputStream, proxyPort: Int) {
        val body = SetupPage.html(LocalAddresses.hotspotIp(), proxyPort, proxyPort + 1)
            .toByteArray()
        val header = "HTTP/1.1 200 OK\r\n" +
            "Content-Type: text/html; charset=utf-8\r\n" +
            "Content-Length: ${body.size}\r\n" +
            "Connection: close\r\n\r\n"
        runCatching {
            output.write(header.toByteArray() + body)
            output.flush()
        }
    }

    /** CONNECT host:443 — abrimos el socket y nos quitamos del medio. */
    private fun tunnel(
        server: ProxyServer,
        client: Socket,
        input: InputStream,
        output: OutputStream,
        target: String,
    ) {
        val host = target.substringBeforeLast(':')
        val port = target.substringAfterLast(':', "443").toIntOrNull() ?: 443

        val result = Outbound.dial(host, port)
        val upstream = result.socket
        if (upstream == null) {
            val reason = result.error?.reason ?: "error desconocido"
            LogBus.error("proxy", "No se pudo salir a $host:$port → $reason")
            fail(output, 502, reason)
            return
        }

        output.write("HTTP/1.1 200 Connection established\r\n\r\n".toByteArray())
        output.flush()
        TunnelLog.opened(host, port, Stats.activeConnections())
        relay(server, client, upstream, input, output)
    }

    /** GET http://host/path — reescribimos a forma origen y reenviamos. */
    private fun forward(
        server: ProxyServer,
        client: Socket,
        input: InputStream,
        output: OutputStream,
        method: String,
        target: String,
        version: String,
        headers: List<Pair<String, String>>,
    ) {
        val uri = runCatching { URI(target) }.getOrNull()
        val host = uri?.host ?: headers.firstOrNull { it.first.equals("host", true) }?.second
        if (host == null) {
            fail(output, 400, "La petición no dice a qué host va")
            return
        }
        val port = if (uri?.port != null && uri.port > 0) uri.port else 80
        val path = buildString {
            append(uri?.rawPath?.takeIf { it.isNotEmpty() } ?: "/")
            uri?.rawQuery?.let { append("?").append(it) }
        }

        val result = Outbound.dial(host, port)
        val upstream = result.socket
        if (upstream == null) {
            val reason = result.error?.reason ?: "error desconocido"
            LogBus.error("proxy", "No se pudo salir a $host:$port → $reason")
            fail(output, 502, reason)
            return
        }

        val isUpgrade = headers.any { it.first.equals("upgrade", true) }
        val drop = if (isUpgrade) HOP_BY_HOP_ON_UPGRADE else HOP_BY_HOP

        val out = upstream.getOutputStream()
        val request = StringBuilder("$method $path $version\r\n")
        var sawHost = false
        for ((name, value) in headers) {
            if (name.lowercase() in drop) continue
            if (name.equals("host", true)) sawHost = true
            request.append("$name: $value\r\n")
        }
        if (!sawHost) request.append("Host: $host\r\n")
        if (!isUpgrade) request.append("Connection: close\r\n")
        request.append("\r\n")
        out.write(request.toString().toByteArray())
        out.flush()

        if (isUpgrade) {
            LogBus.ok("proxy", "cambio de protocolo → $host:$port$path")
        } else {
            LogBus.debug("proxy", "$method → $host:$port$path")
        }
        relay(server, client, upstream, input, output)
    }

    /** Bombea en las dos direcciones y no vuelve hasta que ambas terminan. */
    private fun relay(
        server: ProxyServer,
        client: Socket,
        upstream: Socket,
        input: InputStream,
        output: OutputStream,
    ) {
        val uploadDone = CountDownLatch(1)
        server.execute {
            try {
                pump(input, upstream.getOutputStream(), Direction.UPLOAD, upstream)
            } finally {
                uploadDone.countDown()
            }
        }
        pump(upstream.getInputStream(), output, Direction.DOWNLOAD, client)

        // Cerrar los dos extremos despierta a la subida si estaba bloqueada
        // leyendo de un cliente que ya no va a mandar nada. Sin esto su hilo
        // se queda esperando hasta el temporizador, y con uno largo eso es
        // un hilo perdido por cada conexión.
        runCatching { upstream.close() }
        runCatching { client.close() }
        uploadDone.await(5, TimeUnit.SECONDS)
    }

    private fun readHeaders(input: InputStream): List<Pair<String, String>> {
        val headers = mutableListOf<Pair<String, String>>()
        while (true) {
            val line = readLine(input) ?: break
            if (line.isEmpty()) break
            val name = line.substringBefore(':', "").trim()
            if (name.isEmpty()) continue
            headers += name to line.substringAfter(':').trim()
            if (headers.size > 100) break
        }
        return headers
    }

    /** Lee una línea terminada en CRLF sin bufferizar de más del stream. */
    fun readLine(input: InputStream): String? {
        val builder = StringBuilder()
        while (true) {
            val byte = input.read()
            if (byte < 0) return if (builder.isEmpty()) null else builder.toString()
            if (byte == '\n'.code) return builder.toString().removeSuffix("\r")
            builder.append(byte.toChar())
            if (builder.length > 8192) return builder.toString()
        }
    }

    private fun fail(output: OutputStream, code: Int, reason: String) {
        val body = "Hotspot Libre no pudo completar la petición.\n$reason\n"
        val response = "HTTP/1.1 $code Proxy Error\r\n" +
            "Content-Type: text/plain; charset=utf-8\r\n" +
            "Content-Length: ${body.toByteArray().size}\r\n" +
            "Connection: close\r\n\r\n$body"
        runCatching {
            output.write(response.toByteArray())
            output.flush()
        }
    }
}

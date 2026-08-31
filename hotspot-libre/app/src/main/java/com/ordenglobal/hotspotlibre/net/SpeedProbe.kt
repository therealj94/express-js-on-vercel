package com.ordenglobal.hotspotlibre.net

import com.ordenglobal.hotspotlibre.core.LogBus
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.URL

data class SpeedResult(
    val label: String,
    val mbps: Double,
    val firstByteMs: Long,
    val bytes: Long,
    val error: String? = null,
) {
    val ok: Boolean get() = error == null && bytes > 0

    fun render(): String = when {
        !ok -> "$label: falló — ${error ?: "sin datos"}"
        else -> "$label: ${"%.1f".format(mbps)} Mbps · primer byte en $firstByteMs ms"
    }
}

/**
 * Mide de dónde viene la lentitud.
 *
 * La misma descarga por dos caminos: directo por los datos móviles del
 * teléfono, y a través del propio proxy. La diferencia entre los dos números
 * es lo único que acusa al proxy; si los dos son igual de bajos, el techo
 * está en el enlace o en el operador y no hay nada que optimizar en el código.
 */
object SpeedProbe {

    /** Endpoint público de medición; responde el tamaño exacto que se le pida. */
    const val DEFAULT_URL = "https://speed.cloudflare.com/__down?bytes=8000000"

    private const val CONNECT_TIMEOUT_MS = 15_000
    private const val READ_TIMEOUT_MS = 30_000

    fun measureDirect(url: String = DEFAULT_URL): SpeedResult =
        measure("Directo por los datos del teléfono", url, Proxy.NO_PROXY)

    fun measureThroughProxy(proxyPort: Int, url: String = DEFAULT_URL): SpeedResult =
        measure(
            "A través del proxy",
            url,
            Proxy(Proxy.Type.HTTP, InetSocketAddress("127.0.0.1", proxyPort)),
        )

    private fun measure(label: String, url: String, proxy: Proxy): SpeedResult {
        var connection: HttpURLConnection? = null
        return try {
            val started = System.nanoTime()
            connection = (URL(url).openConnection(proxy) as HttpURLConnection).apply {
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                useCaches = false
                setRequestProperty("Cache-Control", "no-store")
            }

            val code = connection.responseCode
            if (code !in 200..299) {
                return SpeedResult(label, 0.0, 0, 0, "el servidor respondió $code")
            }

            val stream: InputStream = connection.inputStream
            val buffer = ByteArray(64 * 1024)
            var total = 0L
            var firstByteAt = 0L

            while (true) {
                val read = stream.read(buffer)
                if (read < 0) break
                if (firstByteAt == 0L) firstByteAt = System.nanoTime()
                total += read
            }
            stream.close()

            val ttfb = if (firstByteAt == 0L) 0 else (firstByteAt - started) / 1_000_000
            // Se cronometra desde el primer byte: el tiempo de abrir la
            // conexión es latencia, no ancho de banda, y mezclarlos haría
            // parecer lento un enlace que solo tarda en arrancar.
            val transferSeconds = (System.nanoTime() - firstByteAt) / 1e9
            val mbps = if (transferSeconds > 0) (total * 8 / 1e6) / transferSeconds else 0.0

            SpeedResult(label, mbps, ttfb, total)
        } catch (e: Exception) {
            SpeedResult(label, 0.0, 0, 0, e.message ?: e.javaClass.simpleName)
        } finally {
            runCatching { connection?.disconnect() }
        }
    }

    /**
     * Traduce los dos números a una acusación concreta. Es el punto de todo
     * esto: decir a quién hay que reclamarle.
     */
    fun verdict(direct: SpeedResult, proxied: SpeedResult): String {
        if (!direct.ok) {
            return "El teléfono no llegó a bajar nada por su cuenta " +
                "(${direct.error}). Sin señal no hay nada que medir: repite con datos móviles activos."
        }
        if (!proxied.ok) {
            return "El enlace del teléfono da ${"%.1f".format(direct.mbps)} Mbps, pero por el " +
                "proxy no pasó nada (${proxied.error}). El fallo está en la app: mándame este reporte."
        }

        val ratio = proxied.mbps / direct.mbps
        val extraLatency = proxied.firstByteMs - direct.firstByteMs
        val head = "Enlace: ${"%.1f".format(direct.mbps)} Mbps · " +
            "por el proxy: ${"%.1f".format(proxied.mbps)} Mbps " +
            "(${(ratio * 100).toInt()} %) · el proxy añade ${extraLatency} ms de espera.\n\n"

        return head + when {
            ratio >= 0.8 ->
                "El proxy no es el problema: te deja casi todo el enlace. " +
                "Si aun así navegas lento, el techo es tu señal o el operador. " +
                "Para separar esos dos: mide desde el equipo conectado con la " +
                "página de ayuda, primero SIN el proxy puesto. Si ahí ya baja " +
                "respecto a este número, es el operador limitándote el compartir."
            ratio >= 0.5 ->
                "El proxy se está quedando con parte del enlace, pero no es el " +
                "culpable principal. Mide también desde el equipo conectado: si " +
                "sin proxy tampoco alcanza el número del enlace, es el operador."
            else ->
                "El proxy se está comiendo más de la mitad del enlace. Esto sí " +
                "es cosa de la app: mándame el reporte con «Copiar reporte»."
        }
    }

    fun run(proxyPort: Int, url: String = DEFAULT_URL): Triple<SpeedResult, SpeedResult, String> {
        LogBus.info("medida", "Midiendo el enlace directo…")
        val direct = measureDirect(url)
        LogBus.info("medida", direct.render())

        LogBus.info("medida", "Midiendo a través del proxy…")
        val proxied = measureThroughProxy(proxyPort, url)
        LogBus.info("medida", proxied.render())

        return Triple(direct, proxied, verdict(direct, proxied))
    }
}

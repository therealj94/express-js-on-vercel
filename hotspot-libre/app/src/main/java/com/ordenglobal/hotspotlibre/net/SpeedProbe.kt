package com.ordenglobal.hotspotlibre.net

import com.ordenglobal.hotspotlibre.core.LogBus
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicLong
import kotlin.concurrent.thread

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

/** Construye la URL de descarga para un tamaño dado. */
fun interface DownloadUrl {
    fun forBytes(bytes: Int): String
}

/**
 * Mide de dónde viene la lentitud: la señal, el proxy o el operador.
 *
 * Tres decisiones vienen de haber medido mal la primera vez:
 *
 * 1. **Varias conexiones a la vez.** Con una sola, un enlace móvil da muy por
 *    debajo de su capacidad: la latencia limita cuánto puede viajar sin
 *    confirmar. Por eso los speedtest abren varias. Midiendo con una sola
 *    salían 2 Mbps en un enlace que daba 7.
 * 2. **Calentamiento antes de cronometrar.** La primera petición paga DNS y
 *    TLS. Como el camino directo se medía primero, cargaba con ese coste y el
 *    del proxy salía «más rápido»: de ahí una latencia añadida negativa.
 * 3. **Dos rondas, y se queda la mejor.** Una sola medida en móvil tiene tanto
 *    ruido que no da para acusar a nadie.
 */
object SpeedProbe {

    private const val STREAMS = 4
    private const val BYTES_PER_STREAM = 1_000_000
    private const val ROUNDS = 2
    private const val WARMUP_BYTES = 100_000

    private const val CONNECT_TIMEOUT_MS = 15_000
    private const val READ_TIMEOUT_MS = 30_000

    private val cloudflare = DownloadUrl { "https://speed.cloudflare.com/__down?bytes=$it" }

    fun measureDirect(url: DownloadUrl = cloudflare): SpeedResult =
        measure("Directo por los datos del teléfono", url, Proxy.NO_PROXY)

    fun measureThroughProxy(proxyPort: Int, url: DownloadUrl = cloudflare): SpeedResult =
        measure(
            "A través del proxy",
            url,
            Proxy(Proxy.Type.HTTP, InetSocketAddress("127.0.0.1", proxyPort)),
        )

    private fun measure(label: String, url: DownloadUrl, proxy: Proxy): SpeedResult {
        // Calentamiento: paga DNS, TLS y el arranque del proxy fuera del reloj,
        // y de paso da la latencia ya con el camino abierto.
        val warmup = downloadOne(url.forBytes(WARMUP_BYTES), proxy)
        if (warmup.error != null) return SpeedResult(label, 0.0, 0, 0, warmup.error)

        var best = 0.0
        var total = 0L
        repeat(ROUNDS) {
            val round = downloadParallel(url, proxy)
            if (round.error == null && round.mbps > best) best = round.mbps
            total += round.bytes
        }

        if (total == 0L) return SpeedResult(label, 0.0, warmup.firstByteMs, 0, "no bajó nada")
        return SpeedResult(label, best, warmup.firstByteMs, total)
    }

    private class Sample(val mbps: Double, val bytes: Long, val firstByteMs: Long, val error: String?)

    /** Varias descargas simultáneas; el ritmo es el del conjunto. */
    private fun downloadParallel(url: DownloadUrl, proxy: Proxy): Sample {
        val bytes = AtomicLong()
        val firstByte = AtomicLong()
        val done = CountDownLatch(STREAMS)
        val failure = java.util.concurrent.atomic.AtomicReference<String?>(null)

        repeat(STREAMS) {
            thread(isDaemon = true) {
                val sample = downloadOne(url.forBytes(BYTES_PER_STREAM), proxy) { at ->
                    // El reloj arranca con el primer byte de la primera
                    // conexión que conteste, no con el de cada una.
                    firstByte.compareAndSet(0, at)
                }
                if (sample.error != null) failure.compareAndSet(null, sample.error)
                bytes.addAndGet(sample.bytes)
                done.countDown()
            }
        }
        done.await()

        val started = firstByte.get()
        if (started == 0L) return Sample(0.0, 0, 0, failure.get() ?: "sin respuesta")
        val seconds = (System.nanoTime() - started) / 1e9
        val mbps = if (seconds > 0) (bytes.get() * 8 / 1e6) / seconds else 0.0
        return Sample(mbps, bytes.get(), 0, null)
    }

    private fun downloadOne(
        url: String,
        proxy: Proxy,
        onFirstByte: (Long) -> Unit = {},
    ): Sample {
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
            if (code !in 200..299) return Sample(0.0, 0, 0, "el servidor respondió $code")

            val buffer = ByteArray(64 * 1024)
            var total = 0L
            var firstByteAt = 0L
            connection.inputStream.use { stream ->
                while (true) {
                    val read = stream.read(buffer)
                    if (read < 0) break
                    if (firstByteAt == 0L) {
                        firstByteAt = System.nanoTime()
                        onFirstByte(firstByteAt)
                    }
                    total += read
                }
            }

            val ttfb = if (firstByteAt == 0L) 0 else (firstByteAt - started) / 1_000_000
            Sample(0.0, total, ttfb, null)
        } catch (e: Exception) {
            Sample(0.0, 0, 0, e.message ?: e.javaClass.simpleName)
        } finally {
            runCatching { connection?.disconnect() }
        }
    }

    /** Traduce los números a una acusación concreta, o a un «no se sabe». */
    fun verdict(direct: SpeedResult, proxied: SpeedResult): String {
        if (!direct.ok) {
            return "El teléfono no llegó a bajar nada por su cuenta (${direct.error}). " +
                "Sin señal no hay nada que medir: repite con datos móviles activos."
        }
        if (!proxied.ok) {
            return "El enlace del teléfono da ${"%.1f".format(direct.mbps)} Mbps, pero por el " +
                "proxy no pasó nada (${proxied.error}). El fallo está en la app: mándame este reporte."
        }

        val ratio = proxied.mbps / direct.mbps
        val gap = direct.mbps - proxied.mbps
        val latency = proxied.firstByteMs - direct.firstByteMs

        val head = buildString {
            append("Enlace: ${"%.1f".format(direct.mbps)} Mbps · ")
            append("por el proxy: ${"%.1f".format(proxied.mbps)} Mbps (${(ratio * 100).toInt()} %)\n")
            append("Primer byte: ${direct.firstByteMs} ms directo · ${proxied.firstByteMs} ms por el proxy")
            // Una diferencia negativa no es que el proxy vaya más rápido que
            // la red: es ruido de medida. Decir «añade -454 ms» era absurdo.
            append(if (latency > 20) " (el proxy añade $latency ms)" else " (sin espera añadida apreciable)")
            append("\n\n")
        }

        return head + when {
            ratio >= 0.85 ->
                "El proxy no es el problema: te deja casi todo el enlace. El techo " +
                    "es tu señal o el operador. Para separarlos: mide desde el equipo " +
                    "conectado SIN el proxy puesto. Si ahí ya baja respecto a este " +
                    "número, es el operador limitándote el compartir."
            gap < 1.0 ->
                "La diferencia es de ${"%.1f".format(gap)} Mbps: en móvil eso entra en " +
                    "el ruido de una medida. Repite un par de veces antes de sacar " +
                    "conclusiones; si se mantiene, es el proxy."
            ratio >= 0.6 ->
                "El proxy se queda con parte del enlace, pero no es el culpable " +
                    "principal. Mide también desde el equipo conectado: si sin proxy " +
                    "tampoco alcanza el número del enlace, es el operador."
            else ->
                "El proxy se está comiendo más de un tercio del enlace. Esto sí es " +
                    "cosa de la app: mándame el reporte con «Copiar reporte»."
        }
    }

    fun run(proxyPort: Int): Triple<SpeedResult, SpeedResult, String> {
        LogBus.info("medida", "Midiendo el enlace directo…")
        val direct = measureDirect()
        LogBus.info("medida", direct.render())

        LogBus.info("medida", "Midiendo a través del proxy…")
        val proxied = measureThroughProxy(proxyPort)
        LogBus.info("medida", proxied.render())

        return Triple(direct, proxied, verdict(direct, proxied))
    }
}

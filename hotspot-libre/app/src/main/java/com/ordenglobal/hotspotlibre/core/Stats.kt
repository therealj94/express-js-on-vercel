package com.ordenglobal.hotspotlibre.core

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.io.File
import java.util.concurrent.atomic.AtomicLong

data class Counters(
    val totalDown: Long = 0,
    val totalUp: Long = 0,
    val sessionDown: Long = 0,
    val sessionUp: Long = 0,
    val activeConnections: Int = 0,
    val openedTunnels: Long = 0,
)

/**
 * Contadores de tráfico del proxy con persistencia a prueba de muertes.
 *
 * Escribe a un archivo temporal y renombra: si MIUI mata el proceso a
 * mitad del guardado no queda un JSON truncado, que es como se pierden
 * los totales acumulados.
 */
object Stats {

    private val totalDown = AtomicLong()
    private val totalUp = AtomicLong()
    private val sessionDown = AtomicLong()
    private val sessionUp = AtomicLong()
    private val active = AtomicLong()
    private val tunnels = AtomicLong()

    private val _state = MutableStateFlow(Counters())
    val state: StateFlow<Counters> = _state.asStateFlow()

    private var file: File? = null
    private var lastFlush = 0L

    fun load(context: Context) {
        val f = File(context.filesDir, "stats.json")
        file = f
        if (!f.exists()) return
        runCatching {
            val json = JSONObject(f.readText())
            totalDown.set(json.optLong("totalDown"))
            totalUp.set(json.optLong("totalUp"))
            sessionDown.set(json.optLong("sessionDown"))
            sessionUp.set(json.optLong("sessionUp"))
        }.onFailure {
            LogBus.warn("stats", "No se pudieron leer los contadores guardados, arranco de cero")
        }
        publish()
    }

    /**
     * Camino caliente: se llama una vez por bloque leído, en el hilo que
     * mueve los bytes. Aquí solo se suman enteros — ni objetos nuevos, ni
     * StateFlow, ni disco. Publicar en cada bloque hacía que a 50 Mbps la
     * pantalla se recompusiera cientos de veces por segundo y le robara al
     * proxy justo la CPU que necesitaba.
     */
    fun addDown(bytes: Long) {
        totalDown.addAndGet(bytes)
        sessionDown.addAndGet(bytes)
    }

    fun addUp(bytes: Long) {
        totalUp.addAndGet(bytes)
        sessionUp.addAndGet(bytes)
    }

    fun connectionOpened() {
        active.incrementAndGet()
        tunnels.incrementAndGet()
    }

    fun connectionClosed() {
        active.updateAndGet { if (it > 0) it - 1 else 0 }
    }

    fun activeConnections(): Int = active.get().toInt()

    fun resetSession() {
        sessionDown.set(0)
        sessionUp.set(0)
        flush()
        publish()
    }

    /**
     * Publica el estado a la UI y espacia el guardado a disco. Lo llama el
     * servicio una vez por segundo: una recomposición por segundo alcanza
     * de sobra para leer unos contadores.
     */
    fun tick() {
        publish()
        flushThrottled()
    }

    /** Lectura directa de los atómicos, sin depender del ritmo del tick. */
    fun snapshot(): Counters = Counters(
        totalDown = totalDown.get(),
        totalUp = totalUp.get(),
        sessionDown = sessionDown.get(),
        sessionUp = sessionUp.get(),
        activeConnections = active.get().toInt(),
        openedTunnels = tunnels.get(),
    )

    /** Bytes movidos por el proxy en esta sesión, para el límite de datos. */
    fun sessionTotal(): Long = sessionDown.get() + sessionUp.get()

    fun flush() {
        val f = file ?: return
        val json = JSONObject().apply {
            put("totalDown", totalDown.get())
            put("totalUp", totalUp.get())
            put("sessionDown", sessionDown.get())
            put("sessionUp", sessionUp.get())
        }
        runCatching {
            val tmp = File(f.parentFile, "stats.json.tmp")
            tmp.writeText(json.toString())
            tmp.renameTo(f)
        }
    }

    private fun flushThrottled() {
        val now = System.currentTimeMillis()
        if (now - lastFlush < 30_000) return
        lastFlush = now
        flush()
    }

    private fun publish() {
        _state.value = snapshot()
    }
}

fun Long.humanBytes(): String {
    val unit = 1024.0
    if (this < unit) return "$this B"
    val exp = (Math.log(this.toDouble()) / Math.log(unit)).toInt().coerceAtMost(4)
    val prefix = "KMGTP"[exp - 1]
    return String.format("%.2f %sB", this / Math.pow(unit, exp.toDouble()), prefix)
}

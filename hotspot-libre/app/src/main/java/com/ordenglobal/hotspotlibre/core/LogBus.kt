package com.ordenglobal.hotspotlibre.core

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.ArrayDeque
import java.util.Date
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/** Nivel de una línea de log, usado solo para pintarla en la UI. */
enum class LogLevel { INFO, OK, WARN, ERROR }

data class LogLine(
    val at: Long,
    val level: LogLevel,
    val tag: String,
    val text: String,
) {
    fun render(): String = "[$tag] ${level.mark()} $text"

    private fun LogLevel.mark(): String = when (this) {
        LogLevel.INFO -> "·"
        LogLevel.OK -> "▸"
        LogLevel.WARN -> "!"
        LogLevel.ERROR -> "✗"
    }
}

/**
 * Log en memoria compartido por el servicio y la UI.
 *
 * Dos decisiones vienen de medir el coste en el hilo del relay:
 *
 * 1. Cola circular con candado en vez de copiar la lista entera en cada
 *    línea. Copiar 500 elementos por túnel abierto, con la pantalla
 *    repintándose detrás, le quita al proxy la CPU que necesita para mover
 *    bytes — y una tanda de anuncios abre cientos de túneles.
 * 2. La emisión a la UI se agrupa cada 300 ms. La ráfaga se ve igual; lo que
 *    desaparece es una recomposición de Compose por cada línea.
 */
object LogBus {

    private const val MAX_LINES = 500
    private const val EMIT_INTERVAL_MS = 300L

    private val lock = Any()
    private val buffer = ArrayDeque<LogLine>(MAX_LINES)

    private val _lines = MutableStateFlow<List<LogLine>>(emptyList())
    val lines: StateFlow<List<LogLine>> = _lines.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val emitScheduled = AtomicBoolean(false)

    /** Detalle por conexión. Apagado por defecto: en carga es puro ruido. */
    @Volatile
    var verbose: Boolean = false

    fun info(tag: String, text: String) = add(LogLevel.INFO, tag, text)
    fun ok(tag: String, text: String) = add(LogLevel.OK, tag, text)
    fun warn(tag: String, text: String) = add(LogLevel.WARN, tag, text)
    fun error(tag: String, text: String) = add(LogLevel.ERROR, tag, text)

    /** Detalle que solo interesa depurando; se descarta si no está verbose. */
    fun debug(tag: String, text: String) {
        if (verbose) add(LogLevel.INFO, tag, text)
    }

    fun clear() {
        synchronized(lock) { buffer.clear() }
        _lines.value = emptyList()
    }

    private fun add(level: LogLevel, tag: String, text: String) {
        val line = LogLine(System.currentTimeMillis(), level, tag, text)
        synchronized(lock) {
            if (buffer.size >= MAX_LINES) buffer.removeFirst()
            buffer.addLast(line)
        }
        scheduleEmit()
    }

    /**
     * Agrupa la ráfaga en una sola publicación. El `compareAndSet` garantiza
     * una única corrutina en vuelo, y como publica DESPUÉS de esperar, la
     * última línea de la ráfaga siempre acaba en pantalla.
     */
    private fun scheduleEmit() {
        if (!emitScheduled.compareAndSet(false, true)) return
        scope.launch {
            delay(EMIT_INTERVAL_MS)
            emitScheduled.set(false)
            _lines.value = snapshot()
        }
    }

    fun snapshot(): List<LogLine> = synchronized(lock) { buffer.toList() }

    /** Reporte completo en texto plano, para el botón «Copiar reporte». */
    fun report(header: String): String {
        val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        val body = snapshot().joinToString("\n") {
            "${stamp.format(Date(it.at))}  ${it.render()}"
        }
        return "$header\n\n--- LOG ---\n$body\n"
    }
}

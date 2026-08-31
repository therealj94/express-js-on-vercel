package com.ordenglobal.hotspotlibre.core

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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
 * Es un anillo acotado: nunca crece sin límite aunque el proxy quede
 * corriendo días, que es como se comen la RAM estas apps.
 */
object LogBus {

    private const val MAX_LINES = 500

    private val _lines = MutableStateFlow<List<LogLine>>(emptyList())
    val lines: StateFlow<List<LogLine>> = _lines.asStateFlow()

    fun info(tag: String, text: String) = add(LogLevel.INFO, tag, text)
    fun ok(tag: String, text: String) = add(LogLevel.OK, tag, text)
    fun warn(tag: String, text: String) = add(LogLevel.WARN, tag, text)
    fun error(tag: String, text: String) = add(LogLevel.ERROR, tag, text)

    fun clear() {
        _lines.value = emptyList()
    }

    private fun add(level: LogLevel, tag: String, text: String) {
        val line = LogLine(System.currentTimeMillis(), level, tag, text)
        _lines.value = (_lines.value + line).takeLast(MAX_LINES)
    }

    /** Reporte completo en texto plano, para el botón «Copiar logs». */
    fun report(header: String): String {
        val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        val body = _lines.value.joinToString("\n") {
            "${stamp.format(Date(it.at))}  ${it.render()}"
        }
        return "$header\n\n--- LOG ---\n$body\n"
    }
}

package com.ordenglobal.hotspotlibre.proxy

import com.ordenglobal.hotspotlibre.core.Stats
import java.io.InputStream
import java.io.OutputStream
import java.net.Socket

/** Dirección del flujo, solo para contabilizar en el contador correcto. */
enum class Direction { DOWNLOAD, UPLOAD }

/**
 * Copia un stream en el otro contando bytes.
 *
 * Al terminar cierra la mitad de escritura del socket destino en vez del
 * socket entero: así una descarga que sigue bajando no se corta porque el
 * cliente ya dejó de mandar (half-close). Es la diferencia entre que
 * funcionen las subidas grandes o no.
 */
fun pump(source: InputStream, sink: OutputStream, direction: Direction, sinkSocket: Socket?) {
    val buffer = ByteArray(64 * 1024)
    try {
        while (true) {
            val read = source.read(buffer)
            if (read < 0) break
            sink.write(buffer, 0, read)
            sink.flush()
            when (direction) {
                Direction.DOWNLOAD -> Stats.addDown(read.toLong())
                Direction.UPLOAD -> Stats.addUp(read.toLong())
            }
        }
    } catch (_: Exception) {
        // Un corte a mitad de transferencia es lo normal al cerrar pestañas.
    } finally {
        runCatching {
            if (sinkSocket != null && !sinkSocket.isClosed) sinkSocket.shutdownOutput() else sink.close()
        }
    }
}

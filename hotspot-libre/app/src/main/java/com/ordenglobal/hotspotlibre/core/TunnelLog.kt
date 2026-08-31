package com.ordenglobal.hotspotlibre.core

import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/**
 * Resume la apertura de túneles en una línea por segundo.
 *
 * Cargar una página cualquiera abre decenas de túneles hacia rastreadores y
 * CDNs. Una línea por túnel no informa de nada y cuesta caro: se escribe
 * desde el hilo que está moviendo los bytes. Se cuenta y se resume.
 */
object TunnelLog {

    private const val WINDOW_MS = 1_000L

    private val pending = AtomicInteger()
    private val lastTarget = AtomicReference("")
    private val lastEmit = AtomicLong()

    fun opened(host: String, port: Int, active: Int) {
        lastTarget.set("$host:$port")
        pending.incrementAndGet()
        LogBus.debug("proxy", "túnel abierto → $host:$port")

        val now = System.currentTimeMillis()
        val previous = lastEmit.get()
        if (now - previous < WINDOW_MS) return
        if (!lastEmit.compareAndSet(previous, now)) return

        val count = pending.getAndSet(0)
        if (count == 0) return
        LogBus.ok(
            "proxy",
            "$count túnel(es) abierto(s) · activos: $active · último → ${lastTarget.get()}",
        )
    }
}

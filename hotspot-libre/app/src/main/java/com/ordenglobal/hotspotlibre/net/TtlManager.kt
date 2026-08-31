package com.ordenglobal.hotspotlibre.net

import com.ordenglobal.hotspotlibre.core.LogBus
import java.io.DataOutputStream

/**
 * Fija el TTL de los paquetes que salen del teléfono.
 *
 * Cada salto de red baja el TTL en uno: lo que sale del propio teléfono
 * llega al operador con 64, y lo que viene de un equipo conectado al
 * hotspot llega con 63. Igualarlo todo a 64 es lo que borra esa diferencia.
 *
 * Esto exige root sin excepción — `iptables` toca el netfilter del kernel y
 * no hay API de Android que lo exponga. El modo proxy de esta app existe
 * justamente para los teléfonos sin root.
 */
object TtlManager {

    private const val CHAIN = "mangle"

    fun isRootAvailable(): Boolean = runCatching {
        val process = Runtime.getRuntime().exec("su -c id")
        val output = process.inputStream.bufferedReader().readText()
        process.waitFor()
        output.contains("uid=0")
    }.getOrDefault(false)

    fun apply(ttl: Int): Boolean {
        if (ttl !in 1..255) {
            LogBus.error("ttl", "TTL $ttl fuera de rango (1-255)")
            return false
        }
        val commands = listOf(
            "iptables -t $CHAIN -F POSTROUTING",
            "iptables -t $CHAIN -A POSTROUTING -j TTL --ttl-set $ttl",
            "ip6tables -t $CHAIN -F POSTROUTING",
            "ip6tables -t $CHAIN -A POSTROUTING -j HL --hl-set $ttl",
        )
        val ok = runAsRoot(commands)
        if (ok) LogBus.ok("ttl", "TTL fijado en $ttl para todo el tráfico saliente")
        else LogBus.error("ttl", "No se pudo aplicar el TTL — hace falta root")
        return ok
    }

    fun clear(): Boolean = runAsRoot(
        listOf(
            "iptables -t $CHAIN -F POSTROUTING",
            "ip6tables -t $CHAIN -F POSTROUTING",
        ),
    )

    private fun runAsRoot(commands: List<String>): Boolean = runCatching {
        val process = Runtime.getRuntime().exec("su")
        DataOutputStream(process.outputStream).use { stream ->
            commands.forEach { stream.writeBytes("$it\n") }
            stream.writeBytes("exit\n")
            stream.flush()
        }
        process.waitFor() == 0
    }.getOrDefault(false)
}

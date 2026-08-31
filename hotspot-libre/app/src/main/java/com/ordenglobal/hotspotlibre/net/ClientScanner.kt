package com.ordenglobal.hotspotlibre.net

import java.io.File
import java.net.InetAddress

data class TetherClient(
    val ip: String,
    val mac: String,
    val reachable: Boolean,
)

/**
 * Lista los dispositivos colgados del hotspot leyendo la tabla ARP.
 *
 * `/proc/net/arp` dejó de ser legible para apps en Android 10+, así que se
 * intenta primero y, si no hay nada, se cae a un barrido de la subred. El
 * barrido es lento pero es lo único que queda sin root.
 */
object ClientScanner {

    private val ARP_PATHS = listOf("/proc/net/arp")

    fun scan(): List<TetherClient> {
        val fromArp = readArp()
        if (fromArp.isNotEmpty()) return fromArp
        return sweepSubnet()
    }

    private fun readArp(): List<TetherClient> {
        val file = ARP_PATHS.map { File(it) }.firstOrNull { it.canRead() } ?: return emptyList()
        return runCatching {
            file.readLines()
                .drop(1)
                .mapNotNull { line ->
                    val cols = line.split(Regex("\\s+")).filter { it.isNotBlank() }
                    if (cols.size < 4) return@mapNotNull null
                    val ip = cols[0]
                    val mac = cols[3]
                    // 00:00:00:00:00:00 son entradas muertas que la tabla aún no purgó.
                    if (mac == "00:00:00:00:00:00") return@mapNotNull null
                    if (LocalAddresses.ipv4().contains(ip)) return@mapNotNull null
                    TetherClient(ip, mac, reachable = true)
                }
                .distinctBy { it.ip }
        }.getOrDefault(emptyList())
    }

    /** Barrido de los .1-.254 del prefijo local. Solo si ARP no está disponible. */
    private fun sweepSubnet(): List<TetherClient> {
        val own = LocalAddresses.hotspotIp() ?: return emptyList()
        val prefix = own.substringBeforeLast('.')
        val found = mutableListOf<TetherClient>()
        val threads = (1..254).map { host ->
            Thread {
                val ip = "$prefix.$host"
                if (ip == own) return@Thread
                val alive = runCatching {
                    InetAddress.getByName(ip).isReachable(300)
                }.getOrDefault(false)
                if (alive) synchronized(found) { found += TetherClient(ip, "—", true) }
            }
        }
        threads.forEach { it.start() }
        threads.forEach { runCatching { it.join(1500) } }
        return found.sortedBy { it.ip }
    }
}

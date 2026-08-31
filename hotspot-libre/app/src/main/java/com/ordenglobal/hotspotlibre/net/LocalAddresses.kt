package com.ordenglobal.hotspotlibre.net

import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface

/**
 * Direcciones propias del teléfono.
 *
 * Sirve para dos cosas: mostrarle al usuario en qué IP configurar el proxy,
 * y — más importante — cortar los bucles. Un cliente que pide como destino
 * la IP del propio proxy hace que el proxy se conecte a sí mismo y se quede
 * esperando hasta el timeout. Ese es el «no se pudo salir a 192.168.x.x:80»
 * que aparece en los logs de estas apps.
 */
object LocalAddresses {

    /** Prefijos que Android usa para la interfaz del hotspot. */
    private val TETHER_IFACES = listOf("ap", "wlan1", "swlan", "softap", "rndis", "bt-pan")

    fun all(): List<InetAddress> = runCatching {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp }
            .flatMap { it.inetAddresses.toList() }
    }.getOrDefault(emptyList())

    /** IPv4 no-loopback de todas las interfaces activas. */
    fun ipv4(): List<String> = all()
        .filterIsInstance<Inet4Address>()
        .filterNot { it.isLoopbackAddress }
        .map { it.hostAddress ?: "" }
        .filter { it.isNotEmpty() }

    /**
     * IP en la que escuchar/anunciar el proxy: la de la interfaz del hotspot
     * si se puede identificar, si no la primera IPv4 privada.
     */
    fun hotspotIp(): String? {
        val ifaces = runCatching { NetworkInterface.getNetworkInterfaces().toList() }
            .getOrDefault(emptyList())
            .filter { it.isUp && !it.isLoopback }

        val tether = ifaces.firstOrNull { iface ->
            TETHER_IFACES.any { iface.name.startsWith(it, ignoreCase = true) }
        }
        val pick = tether ?: ifaces.firstOrNull { iface ->
            iface.inetAddresses.toList().any { it is Inet4Address && it.isSiteLocalAddress }
        }
        return pick?.inetAddresses?.toList()
            ?.filterIsInstance<Inet4Address>()
            ?.firstOrNull { !it.isLoopbackAddress }
            ?.hostAddress
    }

    /**
     * ¿Este destino somos nosotros mismos?
     *
     * Se consulta con la dirección YA resuelta, no con el hostname: un
     * dominio puede resolver a la IP local y el bucle sería el mismo.
     */
    fun isSelf(address: InetAddress): Boolean {
        if (address.isLoopbackAddress || address.isAnyLocalAddress) return true
        return all().any { it == address }
    }
}

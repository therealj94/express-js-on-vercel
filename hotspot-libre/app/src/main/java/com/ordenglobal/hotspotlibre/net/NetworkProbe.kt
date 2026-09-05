package com.ordenglobal.hotspotlibre.net

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket

/**
 * Ejecuta las comprobaciones reales que después interpreta el NetworkDoctor.
 *
 * Se prueba con conexiones TCP y no con ping: muchos routers domésticos y
 * casi todos los servidores públicos descartan el ICMP, así que un ping
 * fallido no distingue «está caído» de «no contesta a pings».
 */
object NetworkProbe {

    private const val TIMEOUT_MS = 2_500

    /** IP desnuda, sin nombre de por medio: separa el fallo de red del de DNS. */
    private const val INTERNET_IP = "1.1.1.1"
    private const val INTERNET_PORT = 443
    private const val NAME_TO_RESOLVE = "www.google.com"

    fun run(context: Context): Pair<Checks, String?> {
        val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivity.activeNetwork
        val capabilities = network?.let { connectivity.getNetworkCapabilities(it) }
        val onWifi = capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true

        val gateway = gatewayOf(context)
        val gatewayOk = gateway != null && reachable(gateway, 80) || gateway != null && reachable(gateway, 53)

        val checks = Checks(
            wifiConnected = onWifi,
            gatewayReachable = gatewayOk,
            internetByIp = reachable(INTERNET_IP, INTERNET_PORT),
            dnsResolves = resolves(),
        )
        return checks to gateway
    }

    /** La puerta de enlace sale de la ruta por defecto que instaló el sistema. */
    fun gatewayOf(context: Context): String? {
        val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivity.activeNetwork ?: return null
        val link = connectivity.getLinkProperties(network) ?: return null
        return link.routes
            .firstOrNull { it.isDefaultRoute && it.gateway != null }
            ?.gateway
            ?.hostAddress
    }

    private fun reachable(host: String, port: Int): Boolean = runCatching {
        Socket().use { it.connect(InetSocketAddress(host, port), TIMEOUT_MS) }
        true
    }.getOrDefault(false)

    private fun resolves(): Boolean = runCatching {
        InetAddress.getAllByName(NAME_TO_RESOLVE).isNotEmpty()
    }.getOrDefault(false)
}

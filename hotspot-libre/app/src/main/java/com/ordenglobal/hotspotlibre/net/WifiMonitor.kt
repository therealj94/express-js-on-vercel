package com.ordenglobal.hotspotlibre.net

import android.annotation.SuppressLint
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import com.ordenglobal.hotspotlibre.core.Incident
import com.ordenglobal.hotspotlibre.core.IncidentKind
import com.ordenglobal.hotspotlibre.core.IncidentLog
import com.ordenglobal.hotspotlibre.core.LogBus

/**
 * Vigila el Wi-Fi y anota qué había justo cuando se cayó.
 *
 * El valor no está en avisar del corte —eso ya se nota— sino en guardar el
 * contexto: canal, señal y punto de acceso del instante anterior. Cuando el
 * usuario mira el historial media hora después, esos tres datos son la
 * diferencia entre «se cayó otra vez» y «se cayó porque el router saltó del
 * canal 52 al 100, que son de radar».
 */
object WifiMonitor {

    private var connectivity: ConnectivityManager? = null
    private var wifi: WifiManager? = null
    private var callback: ConnectivityManager.NetworkCallback? = null

    @Volatile private var lastChannel: Int = 0
    @Volatile private var previousChannel: Int = 0
    @Volatile private var lastRssi: Int = 0
    @Volatile private var lastBssid: String = ""
    @Volatile private var lastSsid: String = ""
    @Volatile private var wasConnected: Boolean = false

    @Synchronized
    fun start(context: Context) {
        if (callback != null) return

        val app = context.applicationContext
        IncidentLog.load(app)
        connectivity = app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        wifi = app.getSystemService(Context.WIFI_SERVICE) as WifiManager

        val request = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .build()

        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                sample()
                if (wasConnected) return
                wasConnected = true
                IncidentLog.record(snapshot(IncidentKind.RECUPERADA))
            }

            override fun onLost(network: Network) {
                // Se anota con los valores de la última muestra, no con los de
                // ahora: al perderse la red, el sistema ya no reporta ni canal
                // ni señal, y sin ese contexto el registro no explicaría nada.
                wasConnected = false
                IncidentLog.record(snapshot(IncidentKind.CAIDA))
            }

            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                sample()
                val validated = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                if (!validated && wasConnected) {
                    IncidentLog.record(snapshot(IncidentKind.SIN_INTERNET))
                }
            }
        }

        runCatching {
            connectivity?.registerNetworkCallback(request, cb)
            callback = cb
            LogBus.info("red", "Vigilancia de Wi-Fi activada")
        }.onFailure {
            LogBus.warn("red", "No se pudo vigilar el Wi-Fi: ${it.message}")
        }
    }

    @Synchronized
    fun stop() {
        callback?.let { cb -> runCatching { connectivity?.unregisterNetworkCallback(cb) } }
        callback = null
    }

    /** Refresca el contexto para tenerlo listo cuando llegue el corte. */
    @SuppressLint("MissingPermission")
    fun sample() {
        val info = runCatching { wifi?.connectionInfo }.getOrNull() ?: return
        val frequency = runCatching { info.frequency }.getOrDefault(0)
        val channel = NetworkDoctor.channelFor(frequency)
        if (channel != 0 && channel != lastChannel) {
            // Se guarda el canal anterior ANTES de pisarlo: es la mitad de la
            // comparación que después explica el corte. Sin esto, el registro
            // diría que el canal no cambió nunca.
            if (lastChannel != 0) {
                previousChannel = lastChannel
                LogBus.info("red", "El router cambió del canal $lastChannel al $channel")
            }
            lastChannel = channel
        }
        lastRssi = runCatching { info.rssi }.getOrDefault(0)
        lastBssid = runCatching { info.bssid.orEmpty() }.getOrDefault("")
        lastSsid = runCatching { info.ssid.orEmpty().trim('"') }.getOrDefault("")
    }

    private fun snapshot(kind: IncidentKind): Incident {
        return Incident(
            at = System.currentTimeMillis(),
            kind = kind,
            ssid = lastSsid,
            bssid = lastBssid,
            channel = lastChannel,
            rssi = lastRssi,
            previousChannel = previousChannel,
        )
    }
}

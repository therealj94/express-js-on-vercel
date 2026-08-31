package com.ordenglobal.hotspotlibre.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.ordenglobal.hotspotlibre.core.LogBus
import com.ordenglobal.hotspotlibre.core.Settings

/**
 * Arranca el proxy solo cuando se enciende el hotspot.
 *
 * `WIFI_AP_STATE_CHANGED` no es API pública y varios fabricantes no lo
 * emiten. Por eso el arranque automático nunca depende únicamente de esto:
 * el watchdog periódico cubre los teléfonos que se quedan callados.
 */
class HotspotWatcher : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != AP_STATE_CHANGED) return
        val settings = Settings(context)
        if (!settings.autoStart) return

        when (intent.getIntExtra(EXTRA_STATE, 0)) {
            AP_ENABLED -> {
                LogBus.info("hotspot", "Hotspot encendido — levantando el proxy")
                TetherService.start(context)
            }
            AP_DISABLED -> {
                LogBus.info("hotspot", "Hotspot apagado — deteniendo el proxy")
                TetherService.stop(context)
            }
        }
    }

    companion object {
        const val AP_STATE_CHANGED = "android.net.wifi.WIFI_AP_STATE_CHANGED"
        private const val EXTRA_STATE = "wifi_state"

        // 10..14 en vez de 0..4: el estado del AP viene desplazado.
        private const val AP_ENABLED = 13
        private const val AP_DISABLED = 11
    }
}

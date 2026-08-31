package com.ordenglobal.hotspotlibre.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.ordenglobal.hotspotlibre.core.Settings

/** Vuelve a levantar el proxy tras reiniciar, si estaba encendido. */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val settings = Settings(context)
        if (settings.proxyEnabled) TetherService.start(context)
        if (settings.autoStart) WatchdogWorker.schedule(context)
    }
}

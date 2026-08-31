package com.ordenglobal.hotspotlibre.service

import android.app.ActivityManager
import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.ordenglobal.hotspotlibre.core.LogBus
import com.ordenglobal.hotspotlibre.core.Settings
import java.util.concurrent.TimeUnit

/**
 * Revive el servicio si el sistema lo mató.
 *
 * En MIUI un servicio en primer plano no alcanza: el gestor de batería lo
 * cierra igual y el usuario se entera cuando a los conectados se les cayó
 * internet. Este chequeo periódico es el que evita ese silencio.
 */
class WatchdogWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val settings = Settings(applicationContext)
        if (!settings.proxyEnabled) return Result.success()

        if (isServiceRunning()) return Result.success()

        LogBus.warn("watchdog", "El servicio estaba caído — reiniciando el proxy")
        TetherService.start(applicationContext)
        return Result.success()
    }

    @Suppress("DEPRECATION")
    private fun isServiceRunning(): Boolean {
        val manager = applicationContext
            .getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        // getRunningServices está obsoleto pero sigue devolviendo los
        // servicios de la propia app, que es justo lo que preguntamos.
        return manager.getRunningServices(Int.MAX_VALUE)
            .any { it.service.className == TetherService::class.java.name }
    }

    companion object {
        private const val NAME = "hotspot-watchdog"

        /** 15 minutos es el mínimo que WorkManager acepta para trabajo periódico. */
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<WatchdogWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(NAME)
        }
    }
}

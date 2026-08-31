package com.ordenglobal.hotspotlibre.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.ordenglobal.hotspotlibre.R
import com.ordenglobal.hotspotlibre.core.LogBus
import com.ordenglobal.hotspotlibre.core.Settings
import com.ordenglobal.hotspotlibre.core.Stats
import com.ordenglobal.hotspotlibre.core.humanBytes
import com.ordenglobal.hotspotlibre.net.LocalAddresses
import com.ordenglobal.hotspotlibre.net.PacServer
import com.ordenglobal.hotspotlibre.proxy.ProxyServer
import com.ordenglobal.hotspotlibre.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * El proxy vive aquí, en un servicio en primer plano.
 *
 * Sin notificación permanente Android mata el proceso a los pocos minutos en
 * segundo plano y a los conectados se les cae internet sin explicación.
 */
class TetherService : Service() {

    private lateinit var settings: Settings
    private var proxy: ProxyServer? = null
    private var pac: PacServer? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var notifier: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        settings = Settings(this)
        Stats.load(this)
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                settings.proxyEnabled = false
                stopEverything()
                return START_NOT_STICKY
            }
            else -> startEverything()
        }
        // STICKY: si el sistema nos mata por memoria, que nos vuelva a levantar.
        return START_STICKY
    }

    private fun startEverything() {
        startForegroundCompat(buildNotification("Iniciando…"))

        if (proxy?.isRunning() == true) return

        settings.proxyEnabled = true
        val server = ProxyServer(
            port = settings.proxyPort,
            dataCapBytes = settings.dataCapBytes,
            onCapReached = { stopSelf() },
        )
        server.start()
        proxy = server

        val pacServer = PacServer(settings.pacPort, settings.proxyPort)
        pacServer.start()
        pac = pacServer

        val ip = LocalAddresses.hotspotIp()
        if (ip == null) {
            LogBus.warn("proxy", "No encuentro la IP del hotspot — ¿está encendido?")
        } else {
            LogBus.info("proxy", "Configura en cada dispositivo: $ip:${settings.proxyPort}")
        }

        WatchdogWorker.schedule(this)
        startNotifier()
    }

    /** Refresca la notificación con los contadores reales cada 5 segundos. */
    private fun startNotifier() {
        notifier?.cancel()
        notifier = scope.launch {
            while (true) {
                val counters = Stats.state.value
                val text = "${counters.activeConnections} conexiones · " +
                    "↓ ${counters.sessionDown.humanBytes()} · ↑ ${counters.sessionUp.humanBytes()}"
                runCatching {
                    notificationManager().notify(NOTIFICATION_ID, buildNotification(text))
                }
                delay(5_000)
            }
        }
    }

    private fun stopEverything() {
        notifier?.cancel()
        proxy?.stop()
        pac?.stop()
        proxy = null
        pac = null
        Stats.flush()
        WatchdogWorker.cancel(this)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        notifier?.cancel()
        proxy?.stop()
        pac?.stop()
        Stats.flush()
        scope.cancel()
        super.onDestroy()
    }

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(text: String): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            this,
            1,
            Intent(this, TetherService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Proxy activo · puerto ${settings.proxyPort}")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(0, "Detener", stop)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Proxy del hotspot",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Mantiene vivo el proxy mientras compartes internet"
            setShowBadge(false)
        }
        notificationManager().createNotificationChannel(channel)
    }

    private fun notificationManager() =
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    companion object {
        private const val CHANNEL_ID = "hotspot_proxy"
        private const val NOTIFICATION_ID = 42
        const val ACTION_STOP = "com.ordenglobal.hotspotlibre.STOP"

        fun start(context: Context) {
            val intent = Intent(context, TetherService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, TetherService::class.java).setAction(ACTION_STOP),
            )
        }
    }
}

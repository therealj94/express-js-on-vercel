package com.ordenglobal.hotspotlibre.ui

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings as AndroidSettings

/**
 * Atajos a los ajustes que MIUI esconde.
 *
 * Sin «inicio automático» concedido, Xiaomi cierra el servicio en cuanto la
 * pantalla se apaga, y no hay nada en el código de la app que pueda
 * impedirlo. Estos permisos no son un extra: son el requisito.
 */
object MiuiHelper {

    fun isBatteryOptimized(context: Context): Boolean {
        val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return !power.isIgnoringBatteryOptimizations(context.packageName)
    }

    @SuppressLint("BatteryLife")
    fun requestIgnoreBatteryOptimization(context: Context) {
        runCatching {
            context.startActivity(
                Intent(AndroidSettings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    .setData(Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }.onFailure { openAppSettings(context) }
    }

    /** La pantalla de autoarranque de MIUI; si no existe, ajustes de la app. */
    fun openAutoStartSettings(context: Context) {
        val candidates = listOf(
            ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity",
            ),
            ComponentName(
                "com.letv.android.letvsafe",
                "com.letv.android.letvsafe.AutobootManageActivity",
            ),
            ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
            ),
            ComponentName(
                "com.coloros.safecenter",
                "com.coloros.safecenter.permission.startup.StartupAppListActivity",
            ),
        )
        for (component in candidates) {
            val intent = Intent().setComponent(component).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (intent.resolveActivity(context.packageManager) != null) {
                runCatching { context.startActivity(intent) }.onSuccess { return }
            }
        }
        openAppSettings(context)
    }

    fun openWifiSettings(context: Context) {
        runCatching {
            context.startActivity(
                Intent(AndroidSettings.ACTION_WIFI_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }

    private fun openAppSettings(context: Context) {
        runCatching {
            context.startActivity(
                Intent(AndroidSettings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }
}

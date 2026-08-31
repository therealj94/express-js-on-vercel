package com.ordenglobal.hotspotlibre.core

import android.content.Context

/** Preferencias del usuario. Un solo lugar, para que nadie invente claves. */
class Settings(context: Context) {

    private val prefs = context.getSharedPreferences("hotspot_libre", Context.MODE_PRIVATE)

    var proxyPort: Int
        get() = prefs.getInt(KEY_PORT, DEFAULT_PORT)
        set(value) = prefs.edit().putInt(KEY_PORT, value).apply()

    /** El PAC va siempre en el puerto siguiente: una cosa menos que elegir. */
    val pacPort: Int get() = proxyPort + 1

    var ttl: Int
        get() = prefs.getInt(KEY_TTL, 64)
        set(value) = prefs.edit().putInt(KEY_TTL, value).apply()

    var autoStart: Boolean
        get() = prefs.getBoolean(KEY_AUTO_START, false)
        set(value) = prefs.edit().putBoolean(KEY_AUTO_START, value).apply()

    /** Debe estar corriendo el proxy; lo consulta el watchdog para revivirlo. */
    var proxyEnabled: Boolean
        get() = prefs.getBoolean(KEY_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_ENABLED, value).apply()

    /** Corte automático en MB de sesión. 0 = sin límite. */
    var dataCapMb: Int
        get() = prefs.getInt(KEY_CAP_MB, 0)
        set(value) = prefs.edit().putInt(KEY_CAP_MB, value).apply()

    val dataCapBytes: Long get() = dataCapMb.toLong() * 1024 * 1024

    companion object {
        const val DEFAULT_PORT = 8888
        private const val KEY_PORT = "proxy_port"
        private const val KEY_TTL = "ttl"
        private const val KEY_AUTO_START = "auto_start"
        private const val KEY_ENABLED = "proxy_enabled"
        private const val KEY_CAP_MB = "data_cap_mb"
    }
}

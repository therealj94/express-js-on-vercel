package com.ordenglobal.hotspotlibre.core

import android.content.Context
import com.ordenglobal.hotspotlibre.net.NetworkDoctor
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

enum class IncidentKind { CAIDA, SIN_INTERNET, RECUPERADA }

data class Incident(
    val at: Long,
    val kind: IncidentKind,
    val ssid: String,
    val bssid: String,
    val channel: Int,
    val rssi: Int,
    /** Canal en el que estaba justo antes; sirve para delatar un salto por radar. */
    val previousChannel: Int,
) {
    /**
     * La explicación sale de comparar el antes con el después. Un corte a secas
     * no dice nada; un corte en el que además cambió el canal sí.
     */
    fun explain(): String {
        val stamp = SimpleDateFormat("dd/MM HH:mm:ss", Locale.US).format(Date(at))
        val base = when (kind) {
            IncidentKind.CAIDA -> "$stamp · Se cayó el Wi-Fi"
            IncidentKind.SIN_INTERNET -> "$stamp · Wi-Fi conectado pero sin internet"
            IncidentKind.RECUPERADA -> "$stamp · Volvió la conexión"
        }
        val cause = when {
            kind == IncidentKind.RECUPERADA -> "canal $channel"
            previousChannel != 0 && channel != 0 && previousChannel != channel ->
                "el canal cambió de $previousChannel a $channel" +
                    if (NetworkDoctor.isDfs(previousChannel)) " — el $previousChannel es de radar (DFS): tu router tuvo que abandonarlo" else ""
            rssi != 0 && rssi < -80 -> "señal muy débil al caerse ($rssi dBm) — es cobertura"
            kind == IncidentKind.SIN_INTERNET -> "el enlace seguía en pie: mira DNS o proveedor"
            else -> "señal $rssi dBm, canal $channel"
        }
        return "$base · $cause"
    }
}

/** Historial de cortes, para poder mirar atrás cuando ya pasó. */
object IncidentLog {

    private const val MAX = 100

    private val _incidents = MutableStateFlow<List<Incident>>(emptyList())
    val incidents: StateFlow<List<Incident>> = _incidents.asStateFlow()

    private var file: File? = null

    fun load(context: Context) {
        val f = File(context.filesDir, "incidents.json")
        file = f
        if (!f.exists()) return
        runCatching {
            val array = JSONArray(f.readText())
            val list = (0 until array.length()).map { i ->
                val o = array.getJSONObject(i)
                Incident(
                    at = o.getLong("at"),
                    kind = IncidentKind.valueOf(o.getString("kind")),
                    ssid = o.optString("ssid"),
                    bssid = o.optString("bssid"),
                    channel = o.optInt("channel"),
                    rssi = o.optInt("rssi"),
                    previousChannel = o.optInt("previousChannel"),
                )
            }
            _incidents.value = list.takeLast(MAX)
        }
    }

    fun record(incident: Incident) {
        _incidents.value = (_incidents.value + incident).takeLast(MAX)
        LogBus.warn("red", incident.explain())
        save()
    }

    fun clear() {
        _incidents.value = emptyList()
        save()
    }

    private fun save() {
        val f = file ?: return
        val array = JSONArray()
        _incidents.value.forEach {
            array.put(
                JSONObject().apply {
                    put("at", it.at)
                    put("kind", it.kind.name)
                    put("ssid", it.ssid)
                    put("bssid", it.bssid)
                    put("channel", it.channel)
                    put("rssi", it.rssi)
                    put("previousChannel", it.previousChannel)
                },
            )
        }
        runCatching {
            val tmp = File(f.parentFile, "incidents.json.tmp")
            tmp.writeText(array.toString())
            tmp.renameTo(f)
        }
    }
}

package com.ordenglobal.hotspotlibre.radio

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.CellInfoLte
import android.telephony.CellSignalStrengthLte
import android.telephony.CellSignalStrengthNr
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat

data class SignalSnapshot(
    val networkType: String,
    val rsrpDbm: Int?,
    val sinrDb: Int?,
    val band: String?,
    val cellId: String?,
)

/**
 * Lee lo que el teléfono sabe de su propia radio.
 *
 * Android no expone estos valores sin permiso de ubicación: la celda a la
 * que estás enganchado dice dónde estás, así que el sistema lo trata como
 * dato de ubicación. Sin ese permiso solo se puede dar el tipo de red.
 */
object SignalReader {

    fun hasPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    fun read(context: Context): SignalSnapshot {
        val telephony = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            ?: return SignalSnapshot("sin radio", null, null, null, null)

        val type = networkTypeName(context, telephony)
        if (!hasPermission(context)) return SignalSnapshot(type, null, null, null, null)

        var rsrp: Int? = null
        var sinr: Int? = null

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val strengths = runCatching { telephony.signalStrength?.cellSignalStrengths }
                .getOrNull()
                .orEmpty()
            for (strength in strengths) {
                when (strength) {
                    is CellSignalStrengthLte -> {
                        rsrp = strength.rsrp.takeIf { it != Int.MAX_VALUE }
                        sinr = strength.rssnr.takeIf { it != Int.MAX_VALUE }
                    }
                    is CellSignalStrengthNr -> {
                        // El 5G reporta en décimas de dB; se normaliza a dB
                        // para que el veredicto no compare peras con manzanas.
                        rsrp = strength.ssRsrp.takeIf { it != Int.MAX_VALUE } ?: rsrp
                        sinr = strength.ssSinr.takeIf { it != Int.MAX_VALUE } ?: sinr
                    }
                }
                if (rsrp != null) break
            }
        }

        var band: String? = null
        var cellId: String? = null
        runCatching {
            val lte = telephony.allCellInfo?.filterIsInstance<CellInfoLte>()?.firstOrNull { it.isRegistered }
            lte?.cellIdentity?.let { identity ->
                band = "EARFCN ${identity.earfcn}"
                cellId = "celda ${identity.ci} · PCI ${identity.pci}"
                if (rsrp == null) {
                    rsrp = lte.cellSignalStrength.rsrp.takeIf { it != Int.MAX_VALUE }
                    sinr = lte.cellSignalStrength.rssnr.takeIf { it != Int.MAX_VALUE }
                }
            }
        }

        return SignalSnapshot(type, rsrp, sinr, band, cellId)
    }

    private fun networkTypeName(context: Context, telephony: TelephonyManager): String {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return "tipo de red: hace falta permiso"
        }
        return when (runCatching { telephony.dataNetworkType }.getOrDefault(0)) {
            TelephonyManager.NETWORK_TYPE_NR -> "5G"
            TelephonyManager.NETWORK_TYPE_LTE -> "4G LTE"
            TelephonyManager.NETWORK_TYPE_HSPAP,
            TelephonyManager.NETWORK_TYPE_HSPA,
            TelephonyManager.NETWORK_TYPE_UMTS,
            -> "3G"
            TelephonyManager.NETWORK_TYPE_EDGE,
            TelephonyManager.NETWORK_TYPE_GPRS,
            -> "2G"
            TelephonyManager.NETWORK_TYPE_UNKNOWN -> "sin datos móviles"
            else -> "otra"
        }
    }
}

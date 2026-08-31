package com.ordenglobal.hotspotlibre.ui

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ordenglobal.hotspotlibre.core.LogBus
import com.ordenglobal.hotspotlibre.core.Settings
import com.ordenglobal.hotspotlibre.core.Stats
import com.ordenglobal.hotspotlibre.core.humanBytes
import com.ordenglobal.hotspotlibre.net.CheckResult
import com.ordenglobal.hotspotlibre.net.ClientScanner
import com.ordenglobal.hotspotlibre.net.Diagnostics
import com.ordenglobal.hotspotlibre.net.LocalAddresses
import com.ordenglobal.hotspotlibre.net.SpeedProbe
import com.ordenglobal.hotspotlibre.net.TetherClient
import com.ordenglobal.hotspotlibre.net.TtlManager
import com.ordenglobal.hotspotlibre.service.TetherService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* Sin permiso el servicio corre igual, solo sin notificación visible. */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Stats.load(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        setContent {
            MaterialTheme {
                Scaffold { padding ->
                    HomeScreen(Modifier.padding(padding))
                }
            }
        }
    }
}

@Composable
private fun HomeScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val settings = remember { Settings(context) }
    val scope = rememberCoroutineScope()

    val counters by Stats.state.collectAsStateWithLifecycle()
    val logs by LogBus.lines.collectAsStateWithLifecycle()
    var verbose by remember { mutableStateOf(LogBus.verbose) }

    // Con el servicio parado nadie publica; la pantalla se refresca sola.
    LaunchedEffect(Unit) {
        while (true) {
            Stats.tick()
            delay(1_000)
        }
    }

    var running by remember { mutableStateOf(settings.proxyEnabled) }
    var autoStart by remember { mutableStateOf(settings.autoStart) }
    var portText by remember { mutableStateOf(settings.proxyPort.toString()) }
    var ttlText by remember { mutableStateOf(settings.ttl.toString()) }
    var capText by remember { mutableStateOf(settings.dataCapMb.toString()) }
    var clients by remember { mutableStateOf<List<TetherClient>>(emptyList()) }
    var probing by remember { mutableStateOf(false) }
    var verdict by remember { mutableStateOf<String?>(null) }
    var checks by remember { mutableStateOf<List<CheckResult>>(emptyList()) }

    val ip = remember(running) { LocalAddresses.hotspotIp() }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Section("Proxy del hotspot") {
            Text(
                "Los dispositivos conectados salen a internet a través de este " +
                    "teléfono. Hay que configurar el proxy una vez en cada uno.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = if (ip != null) "$ip:${settings.proxyPort}" else "Enciende el hotspot",
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                fontSize = 20.sp,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Activar proxy")
                Switch(
                    checked = running,
                    onCheckedChange = { on ->
                        running = on
                        if (on) TetherService.start(context) else TetherService.stop(context)
                    },
                )
            }
            Text(
                "Desde el equipo recién conectado, abre " +
                    (ip?.let { "http://$it:${settings.pacPort}/" } ?: "—") +
                    " y ahí están los pasos para su sistema. Se ve sin tener " +
                    "el proxy puesto todavía.",
                style = MaterialTheme.typography.bodySmall,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = {
                    copy(context, "${ip ?: ""}:${settings.proxyPort}")
                }) { Text("Copiar dirección") }
                OutlinedButton(onClick = {
                    copy(context, ip?.let { "http://$it:${settings.pacPort}/" } ?: "")
                }) { Text("Copiar ayuda") }
                OutlinedButton(onClick = {
                    scope.launch {
                        checks = withContext(Dispatchers.IO) {
                            Diagnostics.run(settings.proxyPort, settings.pacPort)
                        }
                    }
                }) { Text("Probar conexión") }
            }
            checks.forEach { check ->
                Text(
                    "${if (check.passed) "✓" else "✗"} ${check.name} — ${check.detail}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        Section("Puerto y límite de datos") {
            OutlinedTextField(
                value = portText,
                onValueChange = { portText = it.filter(Char::isDigit).take(5) },
                label = { Text("Puerto del proxy") },
            )
            OutlinedTextField(
                value = capText,
                onValueChange = { capText = it.filter(Char::isDigit).take(6) },
                label = { Text("Límite de sesión en MB (0 = sin límite)") },
            )
            Button(onClick = {
                val port = portText.toIntOrNull()
                // 65534 y no 65535: el PAC se publica en el puerto siguiente.
                if (port == null || port !in 1024..65534) {
                    toast(context, "El puerto debe estar entre 1024 y 65534")
                    return@Button
                }
                settings.proxyPort = port
                settings.dataCapMb = capText.toIntOrNull() ?: 0
                if (running) {
                    TetherService.stop(context)
                    TetherService.start(context)
                }
                toast(context, "Guardado")
            }) { Text("Guardar y reiniciar el proxy") }
        }

        Section("Dispositivos conectados") {
            if (clients.isEmpty()) {
                Text("Sin dispositivos detectados.", style = MaterialTheme.typography.bodySmall)
            }
            clients.forEach {
                Text("${it.ip} · ${it.mac}", fontFamily = FontFamily.Monospace, fontSize = 13.sp)
            }
            OutlinedButton(onClick = {
                scope.launch {
                    clients = withContext(Dispatchers.IO) { ClientScanner.scan() }
                }
            }) { Text("Refrescar") }
        }

        Section("¿De dónde viene la lentitud?") {
            Text(
                "Baja lo mismo por dos caminos —directo por los datos del " +
                    "teléfono y a través del proxy— con cuatro conexiones a la " +
                    "vez, como hace un speedtest. Comparar los dos números dice " +
                    "si la culpa es de la app, de tu señal o del operador.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                "Gasta unos 16 MB de datos móviles.",
                style = MaterialTheme.typography.bodySmall,
            )
            Button(
                enabled = !probing,
                onClick = {
                    probing = true
                    verdict = null
                    scope.launch {
                        val (_, _, text) = withContext(Dispatchers.IO) {
                            SpeedProbe.run(settings.proxyPort)
                        }
                        verdict = text
                        probing = false
                    }
                },
            ) { Text(if (probing) "Midiendo…" else "Medir ahora") }

            verdict?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }

            Text(
                "El tercer número —el que dice si el operador te limita el " +
                    "compartir— se mide desde el equipo conectado, en la página " +
                    "de ayuda del teléfono.",
                style = MaterialTheme.typography.bodySmall,
            )
        }

        Section("Consumo por el proxy") {
            Text("Total descargado: ${counters.totalDown.humanBytes()}")
            Text("Total enviado: ${counters.totalUp.humanBytes()}")
            Text("Sesión: ↓ ${counters.sessionDown.humanBytes()} · ↑ ${counters.sessionUp.humanBytes()}")
            Text("Conexiones activas: ${counters.activeConnections} · túneles abiertos: ${counters.openedTunnels}")
            OutlinedButton(onClick = { Stats.resetSession() }) {
                Text("Reiniciar contador de sesión")
            }
        }

        Section("TTL (requiere root)") {
            Text(
                "Iguala el TTL de todo el tráfico saliente para que el operador " +
                    "no distinga lo que sale del teléfono de lo que viene de los " +
                    "equipos conectados. Sin root no se puede aplicar; usa el proxy.",
                style = MaterialTheme.typography.bodySmall,
            )
            OutlinedTextField(
                value = ttlText,
                onValueChange = { ttlText = it.filter(Char::isDigit).take(3) },
                label = { Text("TTL") },
            )
            Button(onClick = {
                val ttl = ttlText.toIntOrNull() ?: 64
                settings.ttl = ttl
                scope.launch {
                    val ok = withContext(Dispatchers.IO) {
                        if (TtlManager.isRootAvailable()) TtlManager.apply(ttl) else false
                    }
                    toast(context, if (ok) "TTL aplicado" else "No hay root disponible")
                }
            }) { Text("Aplicar TTL") }
        }

        Section("Arranque automático") {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Activar al encender el hotspot")
                Switch(
                    checked = autoStart,
                    onCheckedChange = {
                        autoStart = it
                        settings.autoStart = it
                    },
                )
            }
            Text(
                "Algunos fabricantes no avisan cuando se enciende el hotspot. " +
                    "Un chequeo cada 15 minutos revive el proxy si el sistema lo mató.",
                style = MaterialTheme.typography.bodySmall,
            )
            OutlinedButton(onClick = { MiuiHelper.openAutoStartSettings(context) }) {
                Text("Permitir inicio automático")
            }
            OutlinedButton(onClick = { MiuiHelper.requestIgnoreBatteryOptimization(context) }) {
                Text("Ignorar optimización de batería")
            }
            OutlinedButton(onClick = { MiuiHelper.openWifiSettings(context) }) {
                Text("Abrir ajustes de Wi-Fi")
            }
        }

        Section("Registro en vivo") {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Detalle por conexión")
                Switch(
                    checked = verbose,
                    onCheckedChange = {
                        verbose = it
                        LogBus.verbose = it
                    },
                )
            }
            Text(
                "Apagado, los túneles se resumen en una línea por segundo. " +
                    "Encenderlo cuesta velocidad: cada conexión escribe y repinta.",
                style = MaterialTheme.typography.bodySmall,
            )
            logs.takeLast(25).forEach {
                Text(it.render(), fontFamily = FontFamily.Monospace, fontSize = 12.sp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { copy(context, LogBus.report(header(counters.toString()))) }) {
                    Text("Copiar reporte")
                }
                OutlinedButton(onClick = { share(context, LogBus.report(header(counters.toString()))) }) {
                    Text("Compartir")
                }
                OutlinedButton(onClick = { LogBus.clear() }) { Text("Limpiar") }
            }
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}

private fun header(counters: String): String =
    "Hotspot Libre — reporte\nAndroid ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})\n" +
        "Dispositivo: ${Build.MANUFACTURER} ${Build.MODEL}\nIPs: ${LocalAddresses.ipv4()}\n$counters"

private fun copy(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Hotspot Libre", text))
    toast(context, "Copiado")
}

private fun share(context: Context, text: String) {
    val intent = Intent(Intent.ACTION_SEND)
        .setType("text/plain")
        .putExtra(Intent.EXTRA_TEXT, text)
    context.startActivity(Intent.createChooser(intent, "Compartir reporte"))
}

private fun toast(context: Context, message: String) {
    Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
}

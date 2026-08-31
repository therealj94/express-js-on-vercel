package com.ordenglobal.hotspotlibre.net

import com.ordenglobal.hotspotlibre.core.LogBus
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetSocketAddress
import java.net.Socket

data class CheckResult(val name: String, val passed: Boolean, val detail: String)

/**
 * Autodiagnóstico real: se conecta al propio proxy como si fuera un cliente
 * y hace el mismo recorrido que hará el dispositivo del usuario.
 *
 * Preguntar «¿está el puerto abierto?» no sirve de nada: el puerto puede
 * estar abierto y el operador seguir bloqueando la salida. Esto prueba la
 * cadena completa y dice en qué eslabón se rompe.
 */
object Diagnostics {

    fun run(proxyPort: Int, pacPort: Int): List<CheckResult> {
        val checks = mutableListOf<CheckResult>()

        val ip = LocalAddresses.hotspotIp()
        checks += CheckResult(
            "IP del hotspot",
            ip != null,
            ip ?: "No hay interfaz de hotspot activa. Enciende el punto de acceso primero.",
        )

        checks += checkListening(proxyPort)
        checks += checkHttpConnect(proxyPort)
        checks += checkSocks5(proxyPort)
        checks += checkListening(pacPort).copy(name = "Página de ayuda (puerto $pacPort)")

        checks.forEach {
            if (it.passed) LogBus.ok("test", "${it.name}: ${it.detail}")
            else LogBus.error("test", "${it.name}: ${it.detail}")
        }
        return checks
    }

    private fun checkListening(port: Int): CheckResult = runCatching {
        Socket().use {
            it.connect(InetSocketAddress("127.0.0.1", port), 2000)
        }
        CheckResult("Proxy escuchando (puerto $port)", true, "acepta conexiones")
    }.getOrElse {
        CheckResult("Proxy escuchando (puerto $port)", false, "el puerto no responde — el servicio no está corriendo")
    }

    private fun checkHttpConnect(proxyPort: Int): CheckResult = runCatching {
        Socket().use { socket ->
            socket.connect(InetSocketAddress("127.0.0.1", proxyPort), 3000)
            socket.soTimeout = 12_000
            socket.getOutputStream().write(
                "CONNECT www.google.com:443 HTTP/1.1\r\nHost: www.google.com:443\r\n\r\n".toByteArray(),
            )
            socket.getOutputStream().flush()
            val response = BufferedReader(InputStreamReader(socket.getInputStream())).readLine().orEmpty()
            if (response.contains(" 200 ")) {
                CheckResult("Salida a internet (HTTPS)", true, "www.google.com:443 responde")
            } else {
                CheckResult("Salida a internet (HTTPS)", false, "el proxy respondió: $response")
            }
        }
    }.getOrElse {
        CheckResult("Salida a internet (HTTPS)", false, it.message ?: "sin respuesta")
    }

    private fun checkSocks5(proxyPort: Int): CheckResult = runCatching {
        Socket().use { socket ->
            socket.connect(InetSocketAddress("127.0.0.1", proxyPort), 3000)
            socket.soTimeout = 12_000
            val out = socket.getOutputStream()
            out.write(byteArrayOf(0x05, 0x01, 0x00)) // saludo, sin autenticación
            out.flush()
            val greeting = ByteArray(2)
            socket.getInputStream().read(greeting)
            if (greeting[0].toInt() != 0x05) {
                return@runCatching CheckResult("SOCKS5", false, "el proxy no habla SOCKS5")
            }
            val host = "www.google.com".toByteArray()
            val request = byteArrayOf(0x05, 0x01, 0x00, 0x03, host.size.toByte()) +
                host + byteArrayOf(0x01, 0xBB.toByte()) // puerto 443
            out.write(request)
            out.flush()
            val reply = ByteArray(10)
            socket.getInputStream().read(reply)
            if (reply[1].toInt() == 0x00) {
                CheckResult("SOCKS5", true, "túnel establecido a www.google.com:443")
            } else {
                CheckResult("SOCKS5", false, "el destino devolvió el código ${reply[1].toInt()}")
            }
        }
    }.getOrElse {
        CheckResult("SOCKS5", false, it.message ?: "sin respuesta")
    }
}

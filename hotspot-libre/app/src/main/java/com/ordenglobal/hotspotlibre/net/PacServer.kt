package com.ordenglobal.hotspotlibre.net

import com.ordenglobal.hotspotlibre.core.LogBus
import java.io.BufferedInputStream
import java.io.InputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import kotlin.concurrent.thread

/**
 * Sirve un archivo PAC en http://IP:PUERTO/proxy.pac
 *
 * Ventaja sobre escribir IP y puerto a mano en cada dispositivo: la URL no
 * cambia aunque después cambies el puerto del proxy, y en Windows, macOS y
 * escritorios Linux se pega una sola vez en «configuración automática».
 *
 * No es WPAD completo: el descubrimiento automático exige servir en el
 * puerto 80, y Android no deja a una app sin root abrir puertos bajo 1024.
 */
class PacServer(private val port: Int, private val proxyPort: Int) {

    private var serverSocket: ServerSocket? = null
    @Volatile private var running = false

    fun start() {
        if (running) return
        running = true
        thread(name = "pac-server", isDaemon = true) { loop() }
    }

    fun stop() {
        running = false
        runCatching { serverSocket?.close() }
    }

    fun url(): String? = LocalAddresses.hotspotIp()?.let { "http://$it:$port/proxy.pac" }

    /** Página de instrucciones para abrir desde el equipo recién conectado. */
    fun setupUrl(): String? = LocalAddresses.hotspotIp()?.let { "http://$it:$port/" }

    private fun loop() {
        try {
            val socket = ServerSocket()
            socket.reuseAddress = true
            socket.bind(InetSocketAddress("0.0.0.0", port), 16)
            serverSocket = socket
            LogBus.ok("pac", "Ayuda de conexión en ${setupUrl() ?: "el puerto $port"}")
        } catch (e: Exception) {
            running = false
            LogBus.warn("pac", "No se pudo publicar el PAC en $port: ${e.message}")
            return
        }

        while (running) {
            val client = try {
                serverSocket?.accept() ?: break
            } catch (_: Exception) {
                break
            }
            runCatching {
                client.use {
                    val path = readRequestPath(BufferedInputStream(it.getInputStream(), 4096))
                    val (type, body) = if (path.startsWith("/proxy.pac")) {
                        "application/x-ns-proxy-autoconfig" to pacBody()
                    } else {
                        "text/html; charset=utf-8" to setupPage()
                    }
                    val bytes = body.toByteArray()
                    val response = "HTTP/1.1 200 OK\r\n" +
                        "Content-Type: $type\r\n" +
                        "Content-Length: ${bytes.size}\r\n" +
                        "Connection: close\r\n\r\n"
                    it.getOutputStream().write(response.toByteArray() + bytes)
                    it.getOutputStream().flush()
                }
            }
        }
    }

    /** Devuelve la ruta pedida y consume el resto de la petición. */
    private fun readRequestPath(input: InputStream): String {
        val first = StringBuilder()
        var consecutiveNewlines = 0
        var read = 0
        var line = 0
        while (read < 8192) {
            val byte = input.read()
            if (byte < 0) break
            read++
            if (byte == '\n'.code) {
                consecutiveNewlines++
                line++
                if (consecutiveNewlines == 2) break
            } else if (byte != '\r'.code) {
                consecutiveNewlines = 0
                if (line == 0) first.append(byte.toChar())
            }
        }
        return first.toString().split(" ").getOrNull(1) ?: "/"
    }

    /**
     * Página de ayuda servida desde el propio teléfono.
     *
     * Un equipo recién conectado al hotspot todavía no tiene el proxy puesto,
     * pero sí alcanza esta IP: es el único sitio donde se le pueden dar las
     * instrucciones en el momento exacto en que las necesita.
     */
    private fun setupPage(): String {
        val ip = LocalAddresses.hotspotIp() ?: "192.168.43.1"
        return """
            <!doctype html>
            <html lang="es">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>Conectar a Hotspot Libre</title>
              <style>
                :root { color-scheme: light dark; }
                body { font: 16px/1.6 system-ui, sans-serif; margin: 0; padding: 24px;
                       max-width: 40rem; margin-inline: auto; }
                code { background: rgba(128,128,128,.18); padding: .15em .4em; border-radius: 4px; }
                .big { font-size: 1.6rem; font-weight: 700; letter-spacing: .02em;
                       font-family: ui-monospace, monospace; margin: .3em 0 1em; }
                h2 { font-size: 1.05rem; margin-top: 2rem; }
                li { margin-bottom: .4rem; }
              </style>
            </head>
            <body>
              <h1>Ya casi</h1>
              <p>Falta un paso: decirle a este equipo que salga a internet por el teléfono.</p>
              <p>Dirección del proxy:</p>
              <p class="big">$ip:$proxyPort</p>

              <h2>Windows, macOS y escritorios Linux</h2>
              <p>Es lo más rápido: pega esta URL en «configuración automática del proxy»
                 y no hay que tocar nada más, ni siquiera si luego cambia el puerto.</p>
              <p class="big">http://$ip:$port/proxy.pac</p>

              <h2>Android</h2>
              <ol>
                <li>Ajustes → Wi-Fi → mantén pulsada esta red → Modificar</li>
                <li>Opciones avanzadas → Proxy → <b>Manual</b></li>
                <li>Nombre de host: <code>$ip</code> · Puerto: <code>$proxyPort</code></li>
              </ol>

              <h2>iPhone y iPad</h2>
              <ol>
                <li>Ajustes → Wi-Fi → la (i) junto a esta red</li>
                <li>Abajo del todo: Configurar proxy → <b>Manual</b></li>
                <li>Servidor: <code>$ip</code> · Puerto: <code>$proxyPort</code></li>
              </ol>

              <h2>Medir desde este equipo</h2>
              <p>Este es el número que dice si el operador te está limitando el
                 compartir. Mídelo <b>dos veces</b>: una con el proxy puesto y otra
                 sin él. Gasta unos 8 MB cada vez.</p>
              <p><button id="run">Medir ahora</button> <span id="out"></span></p>
              <p id="hint" style="opacity:.75"></p>

              <h2>Si algo no carga</h2>
              <p>Las apps que no respetan la configuración de proxy —bastantes juegos y
                 algunas apps de sistema— saldrán por fuera. Seguirán funcionando, pero
                 sin pasar por aquí. Los navegadores sí lo respetan siempre.</p>
              <script>
                const url = "https://speed.cloudflare.com/__down?bytes=8000000";
                const out = document.getElementById("out");
                const hint = document.getElementById("hint");
                document.getElementById("run").onclick = async (event) => {
                  const button = event.target;
                  button.disabled = true;
                  out.textContent = " midiendo…";
                  hint.textContent = "";
                  try {
                    // Se cronometra desde el primer trozo recibido: abrir la
                    // conexión es latencia, no ancho de banda.
                    const response = await fetch(url + "&t=" + Date.now(), { cache: "no-store" });
                    const reader = response.body.getReader();
                    let bytes = 0, start = 0;
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      if (!start) start = performance.now();
                      bytes += value.length;
                    }
                    const seconds = (performance.now() - start) / 1000;
                    const mbps = (bytes * 8 / 1e6) / seconds;
                    out.textContent = " " + mbps.toFixed(1) + " Mbps";
                    hint.textContent = "Apunta este número y repite con el proxy " +
                      "en el otro estado. Si sin proxy ya te da mucho menos de lo " +
                      "que mide el teléfono por su cuenta, es el operador limitando " +
                      "el compartir, no la app.";
                  } catch (error) {
                    out.textContent = " falló: " + error.message;
                    hint.textContent = "Sin salida a internet desde este equipo. " +
                      "Revisa que el proxy esté bien puesto, o quítalo para probar.";
                  }
                  button.disabled = false;
                };
              </script>
            </body>
            </html>
        """.trimIndent()
    }

    /**
     * SOCKS5 primero porque cubre todo protocolo; PROXY como respaldo para
     * clientes que solo entienden HTTP; DIRECT al final para que las IPs de
     * la propia red local no den la vuelta por el teléfono — eso sería el
     * bucle que el proxy después tendría que rechazar.
     */
    private fun pacBody(): String {
        val ip = LocalAddresses.hotspotIp() ?: "127.0.0.1"
        return """
            function FindProxyForURL(url, host) {
              if (isPlainHostName(host) ||
                  shExpMatch(host, "*.local") ||
                  isInNet(dnsResolve(host), "192.168.0.0", "255.255.0.0") ||
                  isInNet(dnsResolve(host), "10.0.0.0", "255.0.0.0") ||
                  isInNet(dnsResolve(host), "172.16.0.0", "255.240.0.0") ||
                  isInNet(dnsResolve(host), "127.0.0.0", "255.0.0.0")) {
                return "DIRECT";
              }
              return "SOCKS5 $ip:$proxyPort; PROXY $ip:$proxyPort; DIRECT";
            }
        """.trimIndent()
    }
}

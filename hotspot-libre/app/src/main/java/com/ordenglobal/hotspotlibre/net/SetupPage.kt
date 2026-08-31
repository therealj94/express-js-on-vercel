package com.ordenglobal.hotspotlibre.net

/**
 * La página que ve el equipo recién conectado.
 *
 * Vive aparte porque la sirven dos sitios: el servidor de ayuda en su propio
 * puerto y el propio proxy cuando alguien apunta el navegador directamente a
 * él. Es el único texto que el usuario puede leer antes de tener nada
 * configurado, así que conviene que no dependa de acertar el puerto.
 */
object SetupPage {

    fun html(ip: String?, proxyPort: Int, pacPort: Int): String {
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
              <p class="big">${ip ?: "192.168.43.1"}:$proxyPort</p>

              <h2>Windows, macOS y escritorios Linux</h2>
              <p>Es lo más rápido: pega esta URL en «configuración automática del proxy»
                 y no hay que tocar nada más, ni siquiera si luego cambia el puerto.</p>
              <p class="big">http://${ip ?: "192.168.43.1"}:$pacPort/proxy.pac</p>

              <h2>Android</h2>
              <ol>
                <li>Ajustes → Wi-Fi → mantén pulsada esta red → Modificar</li>
                <li>Opciones avanzadas → Proxy → <b>Manual</b></li>
                <li>Nombre de host: <code>${ip ?: "192.168.43.1"}</code> · Puerto: <code>$proxyPort</code></li>
              </ol>

              <h2>iPhone y iPad</h2>
              <ol>
                <li>Ajustes → Wi-Fi → la (i) junto a esta red</li>
                <li>Abajo del todo: Configurar proxy → <b>Manual</b></li>
                <li>Servidor: <code>${ip ?: "192.168.43.1"}</code> · Puerto: <code>$proxyPort</code></li>
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
}

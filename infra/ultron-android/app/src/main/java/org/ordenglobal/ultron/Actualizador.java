package org.ordenglobal.ultron;

import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * LA ACTUALIZACIÓN POR AIRE.
 *
 * ── LAS DOS ACTUALIZACIONES, QUE NO SON LA MISMA ───────────────────────────
 *
 * 1. LA DEL TABLERO. Es la que pasa todos los días y no se nota: el tablero se
 *    sirve desde ultron.ordenglobal.link, así que cuando se despliega el
 *    servidor, el teléfono lo tiene en el momento sin reinstalar nada. El 99 %
 *    de lo que cambia —la pantalla, las herramientas, el cerebro— entra por
 *    aquí.
 *
 * 2. LA DE LA ENVOLTURA, que es esto. Solo hace falta cuando cambia la app
 *    nativa: un permiso nuevo, otra forma de bajar archivos. Se mira un JSON
 *    en el servidor; si trae un `codigo` mayor que el de esta app, se ofrece
 *    bajar el APK y se le entrega al instalador de Android.
 *
 * SE PREGUNTA, NO SE IMPONE: una app que se actualiza sola sin avisar y se
 * reinicia en medio de una conversación es peor que una desactualizada. Y si
 * no hay red, o el JSON no está, no pasa nada: se calla y sigue.
 *
 * LA FIRMA. Android solo deja instalar encima si el APK nuevo está firmado con
 * la MISMA llave. Es la protección de verdad: aunque alguien lograra servir
 * otro APK desde esa dirección, el teléfono lo rechazaría.
 */
final class Actualizador {

    private static final String DONDE = BuildConfig.CASA + "/apk/ultron.json";

    static void buscar(Activity a) {
        if (!Principal.hayRed(a)) return;
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(DONDE).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                c.setRequestProperty("User-Agent", "UltronApp/" + BuildConfig.VERSION_NAME);
                if (c.getResponseCode() != 200) return;
                JSONObject j;
                try (InputStream in = c.getInputStream()) { j = new JSONObject(leer(in)); }
                int codigo = j.optInt("codigo", 0);
                if (codigo <= BuildConfig.VERSION_CODE) return;      // ya está al día
                String nombre = j.optString("version", String.valueOf(codigo));
                String url = j.optString("apk", BuildConfig.CASA + "/apk/ultron.apk");
                String nota = j.optString("nota", "");
                new Handler(Looper.getMainLooper()).post(() -> {
                    if (a.isFinishing() || a.isDestroyed()) return;
                    new AlertDialog.Builder(a)
                            .setTitle("ULTRON FP " + nombre)
                            .setMessage(nota.isEmpty() ? "Hay una versión nueva de la app. ¿La bajo e instalo?" : nota)
                            .setPositiveButton("ACTUALIZAR", (d, w) -> bajar(a, url, nombre))
                            .setNegativeButton("AHORA NO", null)
                            .show();
                });
            } catch (Exception e) {
                /* Sin ruido: no poder mirar si hay versión nueva no es un
                   problema que la persona pueda arreglar ni tenga que ver. */
            }
        }).start();
    }

    private static void bajar(Activity a, String url, String nombre) {
        Toast.makeText(a, "Bajando ULTRON FP " + nombre + "…", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            try {
                File destino = new File(a.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS), "ultron-" + nombre + ".apk");
                if (destino.exists() && !destino.delete()) throw new Exception("no se pudo borrar la copia anterior");
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(60000);
                if (c.getResponseCode() != 200) throw new Exception("el servidor contestó " + c.getResponseCode());
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(destino)) {
                    byte[] b = new byte[16384];
                    int n;
                    while ((n = in.read(b)) > 0) out.write(b, 0, n);
                }
                new Handler(Looper.getMainLooper()).post(() -> {
                    if (a.isFinishing()) return;
                    Principal.instalar(a, destino);
                });
            } catch (Exception e) {
                new Handler(Looper.getMainLooper()).post(() ->
                        Toast.makeText(a, "No se pudo bajar la actualización: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        }).start();
    }

    private static String leer(InputStream in) throws Exception {
        java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
        byte[] t = new byte[4096];
        int n;
        while ((n = in.read(t)) > 0) b.write(t, 0, n);
        return b.toString("utf-8");
    }

    private Actualizador() {}
}

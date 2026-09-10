package org.ordenglobal.ultron;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;

/**
 * ULTRON FP para Android.
 *
 * ── QUÉ ES ESTO Y QUÉ NO ────────────────────────────────────────────────────
 * Es una app NATIVA que lleva dentro el tablero de ULTRON. No es un acceso
 * directo al navegador: tiene su icono, su proceso, su botón de atrás, el
 * micrófono conectado de verdad, las descargas en la carpeta del teléfono, y
 * se actualiza sola.
 *
 * Y lo importante: el tablero se sirve desde ultron.ordenglobal.link, así que
 * TODO lo que se despliegue en el servidor está en el teléfono en el momento,
 * sin reinstalar nada. Eso es la actualización por aire de verdad — la del APK
 * (más abajo) solo hace falta cuando cambia esta envoltura, que es casi nunca.
 */
public class Principal extends AppCompatActivity {

    private WebView web;
    private Oido oido;
    private Voz voz;
    private ValueCallback<Uri[]> paraArchivos;
    private PermissionRequest permisoDeLaPagina;

    private static final int PIDE_ARCHIVO = 11;
    private static final int PIDE_MICROFONO = 12;
    /** El micrófono pedido por el OÍDO NATIVO, no por la página. Son dos
     *  caminos distintos y hay que saber a cuál contestarle. */
    static final int PIDE_MICROFONO_NATIVO = 13;
    private static final int PIDE_AVISOS = 14;

    /** El host de la casa, UNA vez. Antes se comparaba con
     *  `BuildConfig.CASA.contains(host)`, que es demasiado generoso:
     *  «ultron.ordenglobal.lin» está contenido en la dirección de la casa, así
     *  que un dominio así se habría abierto DENTRO de la app como si fuera
     *  nuestro. Aquí se compara el host entero. */
    private static final String CASA_HOST = Uri.parse(BuildConfig.CASA).getHost();

    private static boolean esDeLaCasa(String host) {
        if (host == null || CASA_HOST == null) return false;
        return host.equalsIgnoreCase(CASA_HOST);
    }

    @Override
    protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        setContentView(R.layout.principal);
        web = findViewById(R.id.web);
        prepararWeb();

        /* El botón de atrás anda por la historia del tablero; solo sale de la
           app cuando ya no hay a dónde volver. Sin esto, atrás cierra la app a
           la primera y se pierde la conversación de vista. */
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack(); else finish();
            }
        });

        if (guardado != null) web.restoreState(guardado);
        else web.loadUrl(abrirCon(getIntent()));

        pedirAvisosSiHaceFalta();
        Actualizador.buscar(this);
    }

    /** Un enlace de ULTRON abre la app en esa página, no en la portada. */
    private String abrirCon(Intent i) {
        Uri d = i != null ? i.getData() : null;
        if (d != null && esDeLaCasa(d.getHost())) return d.toString();
        return BuildConfig.CASA;
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        String u = abrirCon(i);
        if (!u.equals(BuildConfig.CASA)) web.loadUrl(u);
    }

    @Override protected void onSaveInstanceState(@NonNull Bundle b) {
        super.onSaveInstanceState(b);
        web.saveState(b);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void prepararWeb() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // el tablero guarda ahí lo suyo
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);   // la voz suena tras el toque del centro
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);               // el tablero ya está hecho para el teléfono
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " UltronApp/" + BuildConfig.VERSION_NAME);
        web.setBackgroundColor(0xFF05090C);

        /* ── DESEMPEÑO ────────────────────────────────────────────────────────
           setTextZoom(100): el tamaño de letra del sistema NO reescala el
             tablero. Con la letra grande de Android el panel se desarmaba y
             los botones se salían de la pantalla.
           OVER_SCROLL_NEVER: quita el rebote azul del borde. Además de sobrar
             en una pantalla fija, ese efecto se come arrastres que son del
             tablero — la misma familia del fallo del «tirar para recargar».
           setOffscreenPreRaster: dibuja un poco por delante de lo que se ve,
             que es la diferencia entre desplazar una respuesta larga con
             tirones y hacerlo liso. Cuesta memoria; en una sola pantalla se
             puede pagar.
           LOAD_DEFAULT: se respeta la caché que ya manda el servidor (10 min
             para lo suelto, un año para lo que lleva versión). Sin esto cada
             apertura se volvía a bajar el tablero entero.
           No abrir ventanas: el tablero no usa `window.open`, y dejarlo abierto
             es una puerta que nadie vigila. */
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setOffscreenPreRaster(true);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);

        /* EL OÍDO NATIVO Y EL PUENTE. El tablero dicta con `SpeechRecognition`,
           que es una API de Chrome y el WebView NO trae: sin esto el botón de
           hablar no hace nada, con permiso de micrófono y todo. Se le pone
           delante el reconocedor de Android, el mismo del teclado. */
        oido = new Oido(this, web);
        voz = new Voz(this, web);
        web.addJavascriptInterface(oido, "AndroidOido");
        web.addJavascriptInterface(voz, "AndroidVoz");
        web.addJavascriptInterface(new Puente(), "Android");

        web.setWebViewClient(new WebViewClient() {
            /* Lo de la casa se abre DENTRO; lo de fuera, en el navegador. Sin
               esto, tocar un enlace a ordenscan dejaba la app varada en una
               página ajena sin barra de direcciones ni forma de volver. */
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (esDeLaCasa(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { return false; }
                return true;
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (!r.isForMainFrame()) return;
                /* Sin red no se deja una pantalla en blanco: se dice qué pasa y
                   se ofrece reintentar. Una app que se abre en blanco parece
                   rota aunque el problema sea el wifi del aeropuerto. */
                v.loadDataWithBaseURL(null, sinRed(), "text/html", "utf-8", null);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            /* EL MICRÓFONO. La página lo pide con getUserMedia; Android exige
               que la APP lo tenga concedido primero. Se encadenan los dos: si
               falta el del sistema se pide, y al concederlo se le entrega a la
               página. Sin esto, el botón de hablar no hace nada y no se sabe
               por qué. */
            @Override public void onPermissionRequest(PermissionRequest p) {
                runOnUiThread(() -> {
                    boolean quiereMicro = false;
                    for (String r : p.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) quiereMicro = true;
                    if (!quiereMicro) { p.deny(); return; }
                    if (ContextCompat.checkSelfPermission(Principal.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        p.grant(p.getResources());
                    } else {
                        permisoDeLaPagina = p;
                        ActivityCompat.requestPermissions(Principal.this, new String[]{Manifest.permission.RECORD_AUDIO}, PIDE_MICROFONO);
                    }
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest p) { permisoDeLaPagina = null; }

            /* SUBIR UN ARCHIVO. El clip del tablero y arrastrar un PDF encima
               pasan por aquí; sin esto el selector no abre nunca. */
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams fcp) {
                if (paraArchivos != null) paraArchivos.onReceiveValue(null);
                paraArchivos = cb;
                try {
                    startActivityForResult(fcp.createIntent(), PIDE_ARCHIVO);
                } catch (ActivityNotFoundException e) {
                    paraArchivos = null;
                    Toast.makeText(Principal.this, "No hay con qué elegir archivos en este teléfono.", Toast.LENGTH_LONG).show();
                    return false;
                }
                return true;
            }
        });

        /* LAS DESCARGAS. ULTRON arma PDF y documentos: sin esto, tocar el botón
           de bajar no hacía absolutamente nada. Van con la galleta de la sesión
           puesta, o el servidor devolvería la puerta de entrada en vez del
           archivo. */
        web.setDownloadListener((url, agente, contenido, tipo, tam) -> {
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                r.addRequestHeader("User-Agent", agente);
                r.setMimeType(tipo);
                String nombre = android.webkit.URLUtil.guessFileName(url, contenido, tipo);
                r.setTitle(nombre);
                r.setDescription("ULTRON FP");
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, nombre);
                ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
                Toast.makeText(this, "Bajando " + nombre, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "No se pudo bajar: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
    }

    private String sinRed() {
        boolean hay = hayRed(this);
        return "<html><body style='background:#05090C;color:#9FB2BF;font-family:sans-serif;"
                + "display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;margin:0;text-align:center;padding:24px'>"
                + "<div style='color:#38E1FF;letter-spacing:.3em;font-size:13px;margin-bottom:14px'>ULTRON FP</div>"
                + "<div style='font-size:15px;line-height:1.6;margin-bottom:26px'>"
                + (hay ? "No contesta el servidor de ULTRON.<br>Puede estar desplegándose: pruebe en un minuto."
                       : "Este teléfono no tiene internet.<br>Conéctese y toque REINTENTAR.")
                + "</div>"
                + "<button onclick='Android.recargar()' style='background:#38E1FF;color:#031014;border:0;padding:14px 30px;"
                + "font-weight:700;letter-spacing:.12em;font-size:13px;font-family:inherit'>REINTENTAR</button>"
                + "</body></html>";
    }

    static boolean hayRed(Context c) {
        ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        NetworkCapabilities n = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return n != null && n.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    @Override public void onRequestPermissionsResult(int codigo, @NonNull String[] permisos, @NonNull int[] r) {
        super.onRequestPermissionsResult(codigo, permisos, r);
        boolean si = r.length > 0 && r[0] == PackageManager.PERMISSION_GRANTED;

        /* DOS CAMINOS DISTINTOS AL MISMO MICRÓFONO. El de arriba lo pide la
           PÁGINA con getUserMedia; el de abajo lo pide el OÍDO NATIVO, que es
           por donde va el dictado de verdad en la app. Antes solo existía el
           primero: como el oído nativo no pasa por getUserMedia, el permiso no
           se pedía nunca y el reconocedor moría en silencio. */
        if (codigo == PIDE_MICROFONO_NATIVO) {
            if (oido != null) oido.permisoResuelto(si);
            if (!si) Toast.makeText(this, "Sin micrófono no se puede hablar con ULTRON. Se puede escribir igual.", Toast.LENGTH_LONG).show();
            return;
        }

        if (codigo == PIDE_AVISOS) return;   // sin avisos la app funciona igual

        if (codigo != PIDE_MICROFONO || permisoDeLaPagina == null) return;
        if (si) permisoDeLaPagina.grant(permisoDeLaPagina.getResources());
        else {
            permisoDeLaPagina.deny();
            Toast.makeText(this, "Sin micrófono no se puede hablar con ULTRON. Se puede escribir igual.", Toast.LENGTH_LONG).show();
        }
        permisoDeLaPagina = null;
    }

    /* ── LOS AVISOS ───────────────────────────────────────────────────────────
       Desde Android 13 los avisos también se piden. Estaban declarados en el
       manifiesto pero no se pedían nunca, así que el aviso de «descarga
       terminada» y el de «hay versión nueva» no salían en ningún teléfono
       moderno: se pedían en silencio y se descartaban en silencio. */
    private void pedirAvisosSiHaceFalta() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, PIDE_AVISOS);
    }

    /* La pantalla se va: el micrófono se cierra y la voz se calla. Un
       micrófono abierto en segundo plano no se queda abierto en esta casa. */
    @Override protected void onPause() {
        super.onPause();
        if (oido != null) oido.alPausar();
        if (voz != null) voz.callar();
        web.onPause();
        web.pauseTimers();          // deja de gastar batería con la pestaña detrás
    }

    @Override protected void onResume() {
        super.onResume();
        web.resumeTimers();
        web.onResume();
    }

    @Override protected void onDestroy() {
        if (oido != null) oido.alCerrar();
        if (voz != null) voz.alCerrar();
        super.onDestroy();
    }

    @Override protected void onActivityResult(int codigo, int resultado, Intent datos) {
        super.onActivityResult(codigo, resultado, datos);
        if (codigo != PIDE_ARCHIVO) return;
        if (paraArchivos == null) return;
        paraArchivos.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultado, datos));
        paraArchivos = null;
    }

    /** Lo poquito que la página necesita de la app. Nada que lea datos del
     *  teléfono: solo recargar, que es lo que hace falta cuando no hay red. */
    private class Puente {
        @android.webkit.JavascriptInterface
        public void recargar() { runOnUiThread(() -> web.loadUrl(BuildConfig.CASA)); }
    }

    /** Le entrega el APK bajado al instalador de Android. */
    static void instalar(Context c, File apk) {
        Uri u = FileProvider.getUriForFile(c, c.getPackageName() + ".archivos", apk);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(u, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        c.startActivity(i);
    }
}

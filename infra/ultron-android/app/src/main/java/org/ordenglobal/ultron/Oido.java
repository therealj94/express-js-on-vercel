package org.ordenglobal.ultron;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.util.ArrayList;

/**
 * EL OÍDO NATIVO.
 *
 * ── POR QUÉ HACE FALTA ──────────────────────────────────────────────────────
 * El tablero dicta con `SpeechRecognition`, que es una API de CHROME. El
 * WebView de Android NO la trae — no existe, ni con el micrófono concedido ni
 * con nada. Esto pone el reconocedor de voz de Android —el mismo del teclado—
 * detrás de la misma puerta que usa la página: desde el JavaScript se ve como
 * `window.AndroidOido`, y `voz.js` lo prefiere cuando está.
 *
 * ── LAS TRES COSAS QUE LO TENÍAN MUDO EN LA 1.1.0 ───────────────────────────
 * 1. VISIBILIDAD. Desde Android 11 una app no ve a las demás salvo que lo
 *    declare. `isRecognitionAvailable()` le pregunta al sistema qué apps dan
 *    el servicio, y el sistema contestaba «ninguna». Se arregla en el
 *    manifiesto con el bloque <queries>; aquí solo se nota que ahora sí ve.
 * 2. PERMISO. El único sitio donde se pedía RECORD_AUDIO era
 *    `onPermissionRequest`, que solo salta cuando la PÁGINA pide el micrófono
 *    con getUserMedia. Al pasar al reconocedor nativo esa llamada ya no ocurre
 *    nunca, así que el permiso no se pedía jamás y el reconocedor moría con
 *    «sin-permiso» en silencio. Ahora lo pide este mismo oído, y en cuanto la
 *    persona acepta arranca solo sin que haya que volver a tocar el botón.
 * 3. SIN RED. Desde Android 12 hay reconocedor DENTRO del teléfono. Si el de
 *    la nube no está, se usa ése.
 *
 * Y algo que no es un fallo pero se nota: mientras se dicta se pide el foco de
 * audio, así la música o el video que estuviera sonando se aparta en vez de
 * pelearse con el micrófono.
 *
 * El reconocedor de Android SOLO se puede tocar desde el hilo de la pantalla, y
 * el JavaScript llama desde otro: de ahí que todo entre por un Handler. Sin
 * eso revienta con «SpeechRecognizer should be used only from the main thread».
 */
public class Oido {

    private final AppCompatActivity a;
    private final WebView web;
    private final Handler enPantalla = new Handler(Looper.getMainLooper());
    private SpeechRecognizer rec;
    private boolean continuo;
    private boolean apagando;

    /* Lo que se estaba intentando cuando hizo falta pedir el permiso, para
       reanudarlo solo en cuanto la persona diga que sí. */
    private String idiomaEnEspera;
    private boolean seguidoEnEspera;

    private AudioFocusRequest focoNuevo;
    private boolean conFoco;

    Oido(AppCompatActivity a, WebView web) { this.a = a; this.web = web; }

    // ── LO QUE VE EL TABLERO ────────────────────────────────────────────────

    /** Lo que pregunta `hayOido()`. Basta con que exista CUALQUIERA de los dos
     *  reconocedores: el de la nube o el del propio teléfono. */
    @JavascriptInterface
    public boolean hay() {
        return SpeechRecognizer.isRecognitionAvailable(a) || hayEnElTelefono();
    }

    /** Para poder decir POR QUÉ no escucha en vez de callarse. Lo pinta la
     *  consola del tablero cuando algo falla. */
    @JavascriptInterface
    public String diagnostico() {
        try {
            JSONObject o = new JSONObject();
            o.put("reconocedorEnLaNube", SpeechRecognizer.isRecognitionAvailable(a));
            o.put("reconocedorEnElTelefono", hayEnElTelefono());
            o.put("permisoDeMicrofono", tienePermiso());
            o.put("android", Build.VERSION.SDK_INT);
            o.put("app", BuildConfig.VERSION_NAME);
            return o.toString();
        } catch (Exception e) {
            return "{\"fallo\":\"" + e.getMessage() + "\"}";
        }
    }

    @JavascriptInterface
    public void escuchar(String idioma, boolean seguido) {
        final String lang = (idioma == null || idioma.isEmpty()) ? "es-HN" : idioma;
        enPantalla.post(() -> {
            /* EL PERMISO PRIMERO. Si falta, se pide y se deja apuntado lo que
               se quería hacer: cuando la persona acepta, `permisoResuelto()`
               arranca solo. Nada de obligarla a tocar el botón otra vez. */
            if (!tienePermiso()) {
                idiomaEnEspera = lang;
                seguidoEnEspera = seguido;
                ActivityCompat.requestPermissions(a, new String[]{Manifest.permission.RECORD_AUDIO}, Principal.PIDE_MICROFONO_NATIVO);
                return;
            }
            arrancar(lang, seguido);
        });
    }

    @JavascriptInterface
    public void parar() {
        enPantalla.post(() -> {
            apagando = true;
            soltarFoco();
            if (rec != null) { try { rec.cancel(); } catch (Exception ignorada) {} }
        });
    }

    // ── LO QUE LE CONTESTA `Principal` ──────────────────────────────────────

    /** Llega desde `onRequestPermissionsResult`. */
    void permisoResuelto(boolean concedido) {
        String lang = idiomaEnEspera;
        boolean seguido = seguidoEnEspera;
        idiomaEnEspera = null;
        if (lang == null) return;
        if (concedido) enPantalla.post(() -> arrancar(lang, seguido));
        else aJs("fallo", "sin-permiso");
    }

    /** Cuando la pantalla se va, el micrófono se cierra. Un micrófono abierto
     *  que nadie apaga es exactamente lo que nadie quiere en su casa. */
    void alPausar() {
        apagando = true;
        soltarFoco();
        if (rec != null) { try { rec.cancel(); } catch (Exception ignorada) {} }
    }

    void alCerrar() {
        soltarFoco();
        if (rec != null) { try { rec.destroy(); } catch (Exception ignorada) {} rec = null; }
    }

    // ── EL MOTOR ────────────────────────────────────────────────────────────

    private boolean tienePermiso() {
        return ContextCompat.checkSelfPermission(a, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hayEnElTelefono() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(a);
    }

    private void arrancar(String idioma, boolean seguido) {
        continuo = seguido;
        apagando = false;
        if (rec != null) { try { rec.destroy(); } catch (Exception ignorada) {} rec = null; }

        /* El de la nube va primero: entiende mucho mejor. El del teléfono es el
           respaldo, y encima sirve sin datos. */
        boolean enElTelefono = false;
        if (SpeechRecognizer.isRecognitionAvailable(a)) {
            rec = SpeechRecognizer.createSpeechRecognizer(a);
        } else if (hayEnElTelefono()) {
            rec = SpeechRecognizer.createOnDeviceSpeechRecognizer(a);
            enElTelefono = true;
        } else {
            aJs("fallo", "sin-reconocimiento");
            return;
        }
        final boolean local = enElTelefono;

        pedirFoco();
        rec.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle b) { aJs("listo", ""); }
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float v) {}
            @Override public void onBufferReceived(byte[] b) {}
            @Override public void onEndOfSpeech() {}

            /* Lo que se va oyendo mientras habla: es lo que hace que el tablero
               vaya escribiendo en vivo en vez de aparecer todo de golpe. */
            @Override public void onPartialResults(Bundle b) {
                String t = primero(b);
                if (!t.isEmpty()) aJs("parcial", t);
            }

            @Override public void onResults(Bundle b) {
                String t = primero(b);
                if (!t.isEmpty()) aJs("final", t);
                if (continuo && !apagando) enPantalla.postDelayed(() -> arrancar(idioma, true), 120);
                else { soltarFoco(); aJs("fin", ""); }
            }

            @Override public void onError(int codigo) {
                /* «No oí nada» no es un fallo: en modo seguido se vuelve a
                   abrir, que es lo que la persona espera de un micrófono
                   abierto. En modo de una frase, se cierra y ya. */
                boolean silencio = codigo == SpeechRecognizer.ERROR_NO_MATCH
                        || codigo == SpeechRecognizer.ERROR_SPEECH_TIMEOUT;
                if (silencio && continuo && !apagando) { enPantalla.postDelayed(() -> arrancar(idioma, true), 200); return; }
                soltarFoco();
                if (silencio) { aJs("fin", ""); return; }
                /* Si el de la nube se cae por red y hay uno dentro del
                   teléfono, se reintenta con ése antes de rendirse. */
                boolean deRed = codigo == SpeechRecognizer.ERROR_NETWORK || codigo == SpeechRecognizer.ERROR_NETWORK_TIMEOUT;
                if (deRed && !local && hayEnElTelefono() && !apagando) {
                    enPantalla.postDelayed(() -> arrancarSoloLocal(idioma, continuo), 150);
                    return;
                }
                aJs("fallo", nombre(codigo));
            }

            @Override public void onEvent(int t, Bundle b) {}
        });

        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, idioma);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, idioma);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, a.getPackageName());
        if (local) i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        try { rec.startListening(i); } catch (Exception e) { soltarFoco(); aJs("fallo", String.valueOf(e.getMessage())); }
    }

    /** El respaldo sin datos, cuando el de la nube se cayó por red. */
    private void arrancarSoloLocal(String idioma, boolean seguido) {
        if (!hayEnElTelefono()) { aJs("fallo", "sin-red"); return; }
        continuo = seguido;
        if (rec != null) { try { rec.destroy(); } catch (Exception ignorada) {} }
        rec = SpeechRecognizer.createOnDeviceSpeechRecognizer(a);
        arrancar(idioma, seguido);
    }

    // ── EL FOCO DE AUDIO ────────────────────────────────────────────────────
    // Para eso está MODIFY_AUDIO_SETTINGS en el manifiesto: mientras se dicta,
    // lo que esté sonando se aparta solo y vuelve al terminar.

    private void pedirFoco() {
        if (conFoco) return;
        AudioManager am = (AudioManager) a.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focoNuevo = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                        .setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                        .build();
                am.requestAudioFocus(focoNuevo);
            } else {
                am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
            }
            conFoco = true;
        } catch (Exception ignorada) { /* el foco es un lujo, no una condición */ }
    }

    private void soltarFoco() {
        if (!conFoco) return;
        conFoco = false;
        AudioManager am = (AudioManager) a.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) { if (focoNuevo != null) am.abandonAudioFocusRequest(focoNuevo); }
            else am.abandonAudioFocus(null);
        } catch (Exception ignorada) {}
        focoNuevo = null;
    }

    // ── UTILERÍA ────────────────────────────────────────────────────────────

    private static String primero(Bundle b) {
        ArrayList<String> l = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return l == null || l.isEmpty() ? "" : String.valueOf(l.get(0));
    }

    private static String nombre(int c) {
        switch (c) {
            case SpeechRecognizer.ERROR_AUDIO: return "audio";
            case SpeechRecognizer.ERROR_CLIENT: return "cliente";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "sin-permiso";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "sin-red";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "ocupado";
            case SpeechRecognizer.ERROR_SERVER: return "servidor";
            default: return "error-" + c;
        }
    }

    /** Le pasa a la página lo que oyó. El texto va en JSON para que una comilla
     *  en lo dicho no rompa el JavaScript. */
    private void aJs(String que, String texto) {
        String seguro = JSONObject.quote(texto == null ? "" : texto);
        String js = "window.__oidoAndroid && window.__oidoAndroid(" + JSONObject.quote(que) + "," + seguro + ")";
        enPantalla.post(() -> { try { web.evaluateJavascript(js, null); } catch (Exception ignorada) {} });
    }
}

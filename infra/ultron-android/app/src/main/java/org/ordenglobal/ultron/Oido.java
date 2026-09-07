package org.ordenglobal.ultron;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.appcompat.app.AppCompatActivity;

import java.util.ArrayList;

/**
 * EL OÍDO NATIVO.
 *
 * ── POR QUÉ HACE FALTA ──────────────────────────────────────────────────────
 * 7-sep, José con el APK ya instalado: «no me escucha el micrófono».
 *
 * Y no era el permiso: el tablero dicta con `SpeechRecognition`, que es una API
 * de CHROME. El WebView de Android NO la trae — no existe, ni con el micrófono
 * concedido ni con nada. Así que `hayOido()` daba falso, el botón de hablar no
 * hacía nada, y no había forma de que la persona supiera por qué.
 *
 * Esto pone el reconocedor de voz de Android —el mismo del teclado— detrás de
 * la misma puerta que usa la página. Desde el JavaScript se ve como
 * `window.AndroidOido`, y `voz.js` lo prefiere cuando está.
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

    Oido(AppCompatActivity a, WebView web) { this.a = a; this.web = web; }

    /** Lo que pregunta `hayOido()` en el tablero. */
    @JavascriptInterface
    public boolean hay() {
        return SpeechRecognizer.isRecognitionAvailable(a);
    }

    @JavascriptInterface
    public void escuchar(String idioma, boolean seguido) {
        enPantalla.post(() -> arrancar(idioma == null || idioma.isEmpty() ? "es-HN" : idioma, seguido));
    }

    @JavascriptInterface
    public void parar() {
        enPantalla.post(() -> {
            apagando = true;
            if (rec != null) { try { rec.cancel(); } catch (Exception ignorada) {} }
        });
    }

    private void arrancar(String idioma, boolean seguido) {
        continuo = seguido;
        apagando = false;
        if (rec != null) { try { rec.destroy(); } catch (Exception ignorada) {} }
        if (!SpeechRecognizer.isRecognitionAvailable(a)) { aJs("fallo", "sin-reconocimiento"); return; }
        rec = SpeechRecognizer.createSpeechRecognizer(a);
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
                else aJs("fin", "");
            }

            @Override public void onError(int codigo) {
                /* «No oí nada» no es un fallo: en modo seguido se vuelve a
                   abrir, que es lo que la persona espera de un micrófono
                   abierto. En modo de una frase, se cierra y ya. */
                boolean silencio = codigo == SpeechRecognizer.ERROR_NO_MATCH
                        || codigo == SpeechRecognizer.ERROR_SPEECH_TIMEOUT;
                if (silencio && continuo && !apagando) { enPantalla.postDelayed(() -> arrancar(idioma, true), 200); return; }
                if (silencio) { aJs("fin", ""); return; }
                aJs("fallo", nombre(codigo));
            }

            @Override public void onEvent(int t, Bundle b) {}
        });
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, idioma);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, a.getPackageName());
        try { rec.startListening(i); } catch (Exception e) { aJs("fallo", String.valueOf(e.getMessage())); }
    }

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
        String seguro = org.json.JSONObject.quote(texto == null ? "" : texto);
        String js = "window.__oidoAndroid && window.__oidoAndroid(" + org.json.JSONObject.quote(que) + "," + seguro + ")";
        enPantalla.post(() -> { try { web.evaluateJavascript(js, null); } catch (Exception ignorada) {} });
    }
}

package org.ordenglobal.ultron;

import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONObject;

import java.util.Locale;

/**
 * LA VOZ NATIVA (el respaldo).
 *
 * ── EL MISMO AGUJERO QUE EL MICRÓFONO, DEL OTRO LADO ────────────────────────
 * ULTRON habla con ElevenLabs, y eso funciona igual en la app que en la web
 * porque es un audio corriente. Pero cuando ElevenLabs no contesta —cuota
 * agotada, red mala, la llave rotada— el tablero se cae a `speechSynthesis`,
 * que es la voz del navegador... y el WebView de Android TAMPOCO la trae.
 *
 * O sea: en el teléfono, el día que ElevenLabs falle, ULTRON se queda MUDO sin
 * decir por qué. Es exactamente el fallo del micrófono en espejo, y estaba ahí
 * esperando. Esto pone detrás el motor de texto a voz del propio Android —el
 * que lee en Maps— como `window.AndroidVoz`.
 *
 * Es respaldo, no reemplazo: la voz buena sigue siendo ElevenLabs.
 */
public class Voz {

    private final AppCompatActivity a;
    private final WebView web;
    private final Handler enPantalla = new Handler(Looper.getMainLooper());
    private TextToSpeech motor;
    private boolean listo;
    private long turno;

    Voz(AppCompatActivity a, WebView web) {
        this.a = a;
        this.web = web;
        /* Se enciende de una vez: arrancar el motor tarda casi un segundo, y
           si se espera al primer «decí esto» ese segundo se le nota a quien
           está esperando la respuesta. */
        enPantalla.post(this::encender);
    }

    private void encender() {
        if (motor != null) return;
        try {
            motor = new TextToSpeech(a, estado -> {
                listo = estado == TextToSpeech.SUCCESS;
                if (!listo) return;
                try {
                    /* Español de Honduras si lo hay; si no, el español que
                       tenga el teléfono. Nunca se fuerza: un motor sin la voz
                       pedida se queda mudo en vez de leer en inglés. */
                    int r = motor.setLanguage(new Locale("es", "HN"));
                    if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                        motor.setLanguage(new Locale("es", "US"));
                    }
                } catch (Exception ignorada) {}
            });
            motor.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) {}
                @Override public void onDone(String id) { aJs("fin", id); }
                @Override public void onError(String id) { aJs("fallo", id); }
            });
        } catch (Exception ignorada) { listo = false; }
    }

    @JavascriptInterface
    public boolean hay() { return listo && motor != null; }

    @JavascriptInterface
    public String diagnostico() {
        try {
            JSONObject o = new JSONObject();
            o.put("motorListo", listo);
            o.put("motor", motor != null && motor.getDefaultEngine() != null ? motor.getDefaultEngine() : "");
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    /** Devuelve el número de turno: el tablero lo usa para saber cuál de sus
     *  frases terminó, porque `__vozAndroid('fin', id)` trae ese mismo id. */
    @JavascriptInterface
    public String decir(String texto, boolean encolar) {
        final String t = texto == null ? "" : texto.trim();
        if (t.isEmpty()) return "";
        final String id = "u" + (++turno);
        enPantalla.post(() -> {
            if (!listo || motor == null) { aJs("fallo", id); return; }
            try {
                motor.speak(t, encolar ? TextToSpeech.QUEUE_ADD : TextToSpeech.QUEUE_FLUSH, null, id);
            } catch (Exception e) { aJs("fallo", id); }
        });
        return id;
    }

    @JavascriptInterface
    public void callar() {
        enPantalla.post(() -> { if (motor != null) try { motor.stop(); } catch (Exception ignorada) {} });
    }

    void alCerrar() {
        if (motor == null) return;
        try { motor.stop(); motor.shutdown(); } catch (Exception ignorada) {}
        motor = null;
        listo = false;
    }

    private void aJs(String que, String id) {
        String js = "window.__vozAndroid && window.__vozAndroid(" + JSONObject.quote(que) + "," + JSONObject.quote(id == null ? "" : id) + ")";
        enPantalla.post(() -> { try { web.evaluateJavascript(js, null); } catch (Exception ignorada) {} });
    }
}

/* El motor de AU-RA: le pregunta a un modelo y devuelve una respuesta.
 *
 * ── POR QUE ESTO VIVE EN EL BACKEND Y NO EN EL NAVEGADOR ──────────────────
 *
 * El plan original apuntaba el navegador a `http://localhost:11434`. Eso no
 * puede funcionar para servir gente, y conviene entender por que antes de
 * escribir una linea:
 *
 *   `localhost` en el navegador de una persona significa LA COMPUTADORA DE
 *   ESA PERSONA. No la nuestra. Si Ollama corre en la maquina de la casa,
 *   ningun usuario llega: cada uno estaria hablandole a un puerto vacio en su
 *   propio equipo.
 *
 * Y abrir ese puerto a internet para arreglarlo es peor: la API de Ollama no
 * tiene autenticacion ninguna. Cualquiera que encuentre la direccion puede
 * usar la maquina de gratis hasta fundirla.
 *
 * Asi que el camino es: navegador -> NUESTRO backend -> el modelo. Tres cosas
 * se ganan con eso, y las tres importan:
 *
 *   1. El prompt vive aca. Uno puesto en el navegador se lee y se reescribe
 *      con la consola abierta: cualquiera podria hacerle decir a AU-RA lo que
 *      quiera y despues enseñar la captura.
 *   2. Se puede limitar cuantas preguntas hace cada quien. Sin eso, una
 *      persona con un bucle deja sin servicio a las otras cuatrocientas.
 *   3. El modelo no queda expuesto. Solo lo alcanza nuestro servidor.
 *
 * ── EL MODELO NO DECIDE NADA ──────────────────────────────────────────────
 *
 * Este modulo SOLO devuelve texto. No manda dinero, no navega, no toca la
 * cuenta de nadie. El cerebro determinista que ya vive en la billetera sigue
 * siendo el unico que actua: entiende «envia 15 a Maria», se niega a elegir si
 * hay dos Marias, y deja el pago preparado para que la persona lo firme.
 *
 * Un modelo de lenguaje puesto a decidir a quien se le manda dinero convierte
 * una alucinacion en una transferencia. El modelo explica; el cerebro actua.
 *
 * ── CONFIGURACION ─────────────────────────────────────────────────────────
 *
 *   AURA_MOTOR_URL    a donde preguntar. Por defecto http://127.0.0.1:11434
 *   AURA_MODELO       por defecto llama3.1:8b
 *   AURA_TIMEOUT_MS   por defecto 25000
 *
 * Sin motor levantado, `preguntar()` devuelve { ok:false, motivo:'apagado' }.
 * NO lanza y NO inventa una respuesta: quien llama decide que enseñar.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));

const URL_MOTOR = (process.env.AURA_MOTOR_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const MODELO = process.env.AURA_MODELO || "llama3.1:8b";
const TIMEOUT = Number(process.env.AURA_TIMEOUT_MS || 25000);

/* Cuanto puede escribir. Corto a proposito: AU-RA contesta en un panel
   pequeño dentro de la billetera, y una parrafada ahi no se lee. Ademas, un
   modelo al que se le deja escribir largo rellena — y rellenar es inventar. */
const LARGO_MAX = 400;

let _prompt = null;
let _fichas = null;

/** El prompt de sistema, sacado de PROMPT-AURA.md.
 *
 * Se lee del bloque de codigo del archivo y no de una constante en JS para que
 * la voz de la casa se pueda corregir sin tocar el backend, y para que el
 * cambio quede en un commit legible. Se cachea: el archivo no cambia sin un
 * despliegue.
 */
export async function promptSistema() {
  if (_prompt) return _prompt;
  const md = await readFile(join(AQUI, "PROMPT-AURA.md"), "utf8");
  const i = md.indexOf("```");
  const j = md.indexOf("```", i + 3);
  if (i < 0 || j < 0) throw new Error("PROMPT-AURA.md no tiene el bloque del prompt");
  _prompt = md.slice(i + 3, j).trim();
  return _prompt;
}

/** El saber de la casa. Una sola fuente: saber.json. */
async function saber() {
  if (_fichas) return _fichas;
  const ruta = join(AQUI, "..", "cerebro", "conocimiento", "saber.json");
  const crudo = JSON.parse(await readFile(ruta, "utf8"));
  const lista = Array.isArray(crudo) ? crudo : (crudo.fichas || []);
  // Solo lo que una persona marco como publico. Lo demas se queda en casa.
  _fichas = lista.filter((f) => f.publico !== false && f.publica !== false);
  return _fichas;
}

const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Las fichas que tienen que ver con lo que se pregunto.
 *
 * Si ninguna coincide se mandan TODAS y no ninguna: una pregunta general
 * —«¿que es esto?»— no engancha con ninguna palabra suelta, y dejar al modelo
 * sin fichas es dejarlo inventando. Son quince fichas cortas; caben.
 */
export async function fichasPara(dicho, idioma = "es") {
  const todas = await saber();
  const d = sinTildes(dicho);
  const tocadas = todas.filter((f) =>
    (f.palabras || []).some((p) => d.includes(sinTildes(p))) ||
    d.includes(sinTildes(f.tema)));
  const elegidas = tocadas.length ? tocadas : todas;
  return elegidas
    .map((f) => `— ${f.tema}: ${f[idioma] || f.es || ""}`)
    .join("\n");
}

/**
 * Le pregunta al modelo. NO lanza nunca.
 *
 * @param {{dicho: string, idioma?: string, historial?: Array}} p
 * @returns {Promise<{ok: boolean, texto?: string, motivo?: string}>}
 */
export async function preguntar({ dicho, idioma = "es", historial = [] }) {
  if (!dicho || !String(dicho).trim()) return { ok: false, motivo: "vacio" };

  let sistema;
  try {
    sistema = await promptSistema() + "\n\nFICHAS:\n" + await fichasPara(dicho, idioma);
  } catch (e) {
    console.error("[aura] no se pudo armar el prompt:", e.message);
    return { ok: false, motivo: "prompt" };
  }

  /* El historial se recorta a los ultimos seis turnos. Sin recorte, una charla
     larga empuja las fichas fuera de la ventana del modelo y AU-RA empieza a
     contestar de memoria — que es justo lo que este diseño evita. */
  const mensajes = [
    { role: "system", content: sistema },
    ...historial.slice(-6),
    { role: "user", content: String(dicho).slice(0, 1000) },
  ];

  try {
    const r = await fetch(`${URL_MOTOR}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        messages: mensajes,
        stream: false,
        options: {
          // Baja a proposito: no queremos que sea creativa con los datos de
          // nadie. Que sea aburrida y exacta.
          temperature: 0.3,
          num_predict: 220,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });

    if (!r.ok) {
      console.error("[aura] el motor respondio", r.status);
      return { ok: false, motivo: r.status === 404 ? "modelo" : "motor" };
    }

    const j = await r.json();
    let texto = (j?.message?.content || "").trim();
    if (!texto) return { ok: false, motivo: "vacia" };
    if (texto.length > LARGO_MAX) {
      // Se corta en el ultimo punto, no a mitad de palabra.
      const corte = texto.lastIndexOf(".", LARGO_MAX);
      texto = texto.slice(0, corte > 120 ? corte + 1 : LARGO_MAX).trim();
    }
    return { ok: true, texto };
  } catch (e) {
    const apagado = /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(e.message || "");
    if (!apagado) console.error("[aura] fallo:", e.message);
    return { ok: false, motivo: apagado ? "apagado" : "red" };
  }
}

/** ¿Hay motor? Para el arranque y para un panel de estado. */
export async function motorVivo() {
  try {
    const r = await fetch(`${URL_MOTOR}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return { vivo: false };
    const j = await r.json();
    const modelos = (j?.models || []).map((m) => m.name);
    return { vivo: true, modelos, tieneElNuestro: modelos.some((m) => m.startsWith(MODELO.split(":")[0])) };
  } catch {
    return { vivo: false };
  }
}

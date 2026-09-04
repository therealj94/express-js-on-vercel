// EL APK: la dirección, la versión y el peso. Un solo sitio.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE ESTE ARCHIVO
//
// La dirección del APK vivía en CUATRO sitios y nada los mantenía juntos:
//
//   lib/cartaInstalar.js                       la primera carta
//   lib/cartaSegundaVuelta.js                  la segunda
//   apps-web/veta-wallet/instalar.html         la página
//   infra/correo-ordenglobal/.../enviar.py     el que MANDA de verdad
//
// El comentario de cada uno avisaba de que al compilar había que cambiar los
// demás, y un aviso en un comentario se cumple las primeras veces. El 4 de
// septiembre los cuatro apuntaban a TRES artefactos distintos:
//
//   kEEJv7Dn…   144 MB   el que recibieron 409 personas el 2 de septiembre
//   lxUN7f_S…   144 MB   1.33.2, en la primera carta, que ya no manda nadie
//   TUIRM2Gu…    57 MB   1.34.0, en la página y en la segunda carta
//
// Y la prueba que debía cazarlo comparaba la primera carta con la página —
// o sea, el único par que no importaba: guardaba una carta que no manda nadie
// e ignoraba el archivo que sí manda.
//
// Desincronizarse no da ningún error. Da algo peor: cientos de personas con
// el enlace de una versión vieja, o una página que promete una cosa y entrega
// otra, y nadie se entera hasta que alguien pregunta por qué su app no tiene
// lo que decía el correo.
//
// ══════════════════════════════════════════════════════════════════════════
// LO QUE SIGUE SIN PODER IMPORTAR ESTO
//
// La página es HTML y el que manda es Python. No pueden leer este módulo, así
// que para ellos el guardián es `pruebas/probar-apk-al-dia.mjs`, que compara
// los cuatro sitios contra este archivo y se pone rojo si alguno se separa.
//
// AL COMPILAR UN APK NUEVO se cambia AQUÍ, y la prueba dice qué más hay que
// tocar. No al revés.

/** El artefacto de EAS. Siempre `expo.dev/artifacts/eas/…` y nunca un enlace
 *  de paso: un enlace temporal en un correo masivo son cientos de personas
 *  que no pueden instalar nada y no saben por qué. */
export const APK =
  "https://expo.dev/artifacts/eas/TUIRM2GuaWiLcf9rvdRzI6GZuSVVJ2HJBNvB7VYhKiA.apk";

export const VERSION = "1.34.0";
export const PESO = "55 MB";
/** Lo que pesaba antes, para poder contarlo en la carta. */
export const PESO_ANTES = "138 MB";

export const PAGINA = "https://app.vetawallet.com/instalar";

/**
 * LO QUE YA SE MANDÓ, Y A CUÁNTA GENTE.
 *
 * Va escrito porque si no hay que reconstruirlo leyendo `ya-enviados.txt` y
 * el historial de git, y eso nadie lo hace: se acaba mandando dos veces la
 * misma carta, o dando por enviada una que no salió.
 *
 * Quien ya recibió un enlace VIEJO no se queda tirado — los artefactos de EAS
 * no caducan y los tres siguen vivos, comprobado el 4 de septiembre. Lo que
 * pasa es que instala una versión anterior, y para eso está la segunda carta.
 */
export const ENVIADOS = [
  {
    cuando: "2026-09-02",
    apk: "https://expo.dev/artifacts/eas/kEEJv7Dn4TfA06aMVWX-CpiZRPtUooi6DnGfyA-f69U.apk",
    version: "1.33.1",
    personas: 409,
    por: "infra/correo-ordenglobal/instalar-android/enviar.py",
    nota: "la primera carta. La lista está en ya-enviados.txt, al lado del guion.",
  },
];

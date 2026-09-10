/* La carta que se manda DESPUES de transferir los tokens. El recibo.
 *
 * POR QUE EXISTE, Y POR QUE ES DISTINTA DE LA INVITACION
 *
 * `cartaInvitacion` pide algo: la direccion. Esta no pide nada — cierra. Es la
 * unica carta de la casa que no tiene un solo boton que empuje a hacer algo, y
 * eso es deliberado: quien acaba de recibir tokens no necesita que lo apuren,
 * necesita saber que llegaron y poder comprobarlo sin creernos.
 *
 * EL RECIBO ES EL OBJETO
 *
 * Igual que la carta de Genesis se recuerda por la placa del registro, esta se
 * recuerda por el recibo: tipografia de maquina, filetes de oro, los seis
 * datos y nada mas. No es un adorno con forma de dato — es el dato, y el hash
 * es lo que convierte esta carta en una prueba y no en un anuncio.
 *
 * Por eso el hash va COMPLETO y partido en dos lineas, no recortado con
 * puntos suspensivos: un hash a medias no se puede pegar en el explorador, y
 * entonces el recibo deja de ser comprobable y pasa a ser decoracion.
 *
 * ── LA LINEA QUE NO SE CRUZA ────────────────────────────────────────────────
 *
 * ONDK ES UN VALOR NEGOCIABLE (security token), y la preventa dice que NO SE
 * MERCADEA EN ESTADOS UNIDOS. Eso fija lo que esta carta puede y no puede
 * decir, y no es una cautela de abogado: es la diferencia entre acompanar una
 * entrega y hacer una oferta de valores por correo.
 *
 *   SE PUEDE      contar que los tokens llegaron, que la casa esta
 *                 construyendo una moneda para transaccionar en America
 *                 Latina, y que se le va a ir contando como avanza.
 *
 *   NO SE PUEDE   precio, cotizacion, rendimiento, «va a subir», fechas de
 *                 listado, comparaciones con otras monedas, ni nada que
 *                 insinue que tener ONDK es una ganancia. Tampoco invitar a
 *                 comprar mas.
 *
 * El proyecto se vende; el token no. Es lo que la mantiene fuera de terreno de
 * oferta, y es exactamente la misma regla que ya sigue `cartaGenesis`.
 */

import { marco, escaparCorreo as esc } from "./correo.js";

const CADENA = "https://ordenscan.com";
const CASA = "https://ordenglobal.org";
const SITIO = "https://app.vetawallet.com";
const RESPUESTA = "info@ordenglobal.org";

const SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,'Courier New',monospace";

const H = (t) =>
  `<div style="margin:32px 0 12px;font:700 17px/1.35 Georgia,serif;color:#F3ECD9;">${esc(t)}</div>`;

/* Una linea del recibo. La etiqueta en versalitas tenues y el dato en
   tipografia de maquina: el ojo baja por la columna de datos sin tropezar. */
const renglon = (etiqueta, dato, monoDato = true) => `
  <tr>
    <td style="padding:7px 0;font:600 10px/1.4 ${SANS};letter-spacing:.16em;
               text-transform:uppercase;color:#9A8C76;white-space:nowrap;
               vertical-align:top;width:96px;">${esc(etiqueta)}</td>
    <td style="padding:7px 0;font:${monoDato ? `400 13px/1.5 ${MONO}` : `600 14px/1.5 ${SANS}`};
               color:#F3ECD9;word-break:break-all;">${dato}</td>
  </tr>`;

/**
 * @param {{nombre: string, cantidad: string, token?: string, direccion: string,
 *          hash: string, bloque: number|string, fecha: string}} p
 *   `cantidad` y `fecha` van ya escritas como se quieren leer: "20.000",
 *   "30 de agosto de 2026, 16:25 UTC".
 * @returns {{asunto: string, html: string, texto: string}}
 */
export function cartaEntrega({
  nombre, cantidad, token = "ONDK", direccion, hash, bloque, fecha,
}) {
  const primer = String(nombre || "").trim().split(/\s+/)[0] || "";
  const asunto = `Listo, ${primer}: tus ${cantidad} ${token} ya están en tu billetera`;

  /* El hash partido a la mitad. Entero se puede copiar; en una sola linea se
     desborda en el telefono y el recibo se ve roto justo en el dato que
     importa. */
  const h = String(hash);
  const hashPartido = `${esc(h.slice(0, 34))}<br>${esc(h.slice(34))}`;

  const html = marco(`Tus ${cantidad} ${token} ya llegaron`, `
  <div style="padding:22px 0 6px;">
    <div style="font:400 27px/1.3 Georgia,'Times New Roman',serif;color:#FFFFFF;">
      Tus <span style="color:#C9A961;">${esc(cantidad)} ${esc(token)}</span><br>ya están en tu billetera.
    </div>
  </div>

  <p style="margin:18px 0 13px;font-size:16px;color:#F3ECD9;">Hola, ${esc(primer)}.</p>

  <p style="margin:0 0 13px;">
    Gracias por mandarnos tu dirección. La transferencia ya está hecha y
    confirmada en la cadena. Abajo va el recibo — y no hace falta que nos creas:
    todo lo que dice se puede comprobar por tu cuenta.
  </p>

  <!-- EL RECIBO. El elemento con el que se recuerda esta carta. -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="margin:26px 0;border:1px solid rgba(201,169,97,.35);border-radius:10px;
                background:rgba(201,169,97,.05);">
    <tr><td style="padding:20px 22px 6px;">
      <div style="font:600 10px/1 ${SANS};letter-spacing:.26em;text-transform:uppercase;
                  color:#C9A961;">Comprobante de entrega</div>
    </td></tr>
    <tr><td style="padding:6px 22px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${renglon("Entregado", `${esc(cantidad)} ${esc(token)}`, false)}
        ${renglon("A", esc(direccion))}
        ${renglon("Cuándo", esc(fecha), false)}
        ${renglon("Bloque", esc(String(bloque)))}
        ${renglon("Cadena", "5550 · Orden Global", false)}
        ${renglon("Transacción", hashPartido)}
      </table>
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(201,169,97,.22);
                  font:400 13px/1.6 ${SANS};color:#C4B7A2;">
        Pegá ese número en <a href="${CADENA}" style="color:#C9A961;text-decoration:none;">ordenscan.com</a>
        y vas a ver la transferencia tal cual quedó escrita en la cadena: cuánto,
        de dónde salió y a qué dirección llegó. No la escribimos nosotros — está
        en la cadena y ahí se queda.
      </div>
    </td></tr>
  </table>

  <p style="margin:0 0 13px;">
    También podés abrir tu Veta Wallet en
    <a href="${SITIO}" style="color:#C9A961;text-decoration:none;">app.vetawallet.com</a>
    y verlos en tu saldo. Si no aparecen a la primera, cerrá y volvé a entrar.
  </p>

  ${H("Lo que sigue")}

  <p style="margin:0 0 13px;">
    Te vamos a ir contando, paso por paso, cómo avanza el camino de ${esc(token)}
    hacia el mercado: qué se está construyendo, qué falta y cuándo se mueve cada
    pieza. Sin sorpresas y sin que tengas que andar preguntando — te llega por
    este mismo correo.
  </p>

  ${H("Y si querés saber en qué andamos")}

  <p style="margin:0 0 13px;">
    Orden Global está construyendo algo bastante simple de decir y difícil de
    hacer: <strong style="color:#F3ECD9;">una sola moneda para transaccionar en
    toda América Latina</strong>.
  </p>

  <p style="margin:0 0 13px;">
    Hoy mandar plata de un país a otro de la región cuesta caro, tarda, y pasa
    por tres monedas que se devalúan mientras el dinero viaja. Nosotros hicimos
    la cadena, la billetera, la identidad y la casa de cambio para que ese viaje
    sea uno solo: de una persona a otra, en minutos, con una moneda que no se
    achica mientras tanto.
  </p>

  <p style="margin:0 0 13px;">
    Si te interesa mirarlo por dentro, todo está a la vista:
  </p>

  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
    ${[[CASA, "la casa y lo que estamos construyendo"],
       [CADENA, "el explorador de la cadena, abierto a cualquiera"],
       [SITIO, "tu billetera"]].map(([u, q]) => `
    <tr>
      <td style="padding:5px 14px 5px 0;font:400 14px/1.5 ${SANS};white-space:nowrap;">
        <a href="${u}" style="color:#C9A961;text-decoration:none;">${esc(u.replace("https://", ""))}</a>
      </td>
      <td style="padding:5px 0;font:400 14px/1.5 ${SANS};color:#9A8C76;">${esc(q)}</td>
    </tr>`).join("")}
  </table>

  <p style="margin:20px 0 0;">
    Cualquier duda, respondé a este mismo correo y te contesta una persona.
  </p>
  `, `${esc(token)} es un valor negociable (security token) emitido bajo Próspera.
      Esta carta acompaña una entrega de tokens que ya son tuyos: no es una
      oferta, ni una invitación a invertir, ni una promesa de rentabilidad.`);

  const texto = `Hola, ${primer}.

Gracias por mandarnos tu dirección. La transferencia ya está hecha y confirmada
en la cadena. Abajo va el recibo — y no hace falta que nos creas: todo lo que
dice se puede comprobar por tu cuenta.

COMPROBANTE DE ENTREGA

  Entregado    ${cantidad} ${token}
  A            ${direccion}
  Cuándo       ${fecha}
  Bloque       ${bloque}
  Cadena       5550 · Orden Global
  Transacción  ${hash}

Pegá ese número en ${CADENA} y vas a ver la transferencia tal cual quedó
escrita en la cadena: cuánto, de dónde salió y a qué dirección llegó. No la
escribimos nosotros — está en la cadena y ahí se queda.

También podés abrir tu Veta Wallet en ${SITIO} y verlos en tu saldo. Si no
aparecen a la primera, cerrá y volvé a entrar.

LO QUE SIGUE

Te vamos a ir contando, paso por paso, cómo avanza el camino de ${token} hacia
el mercado: qué se está construyendo, qué falta y cuándo se mueve cada pieza.
Sin sorpresas y sin que tengas que andar preguntando — te llega por este mismo
correo.

Y SI QUERÉS SABER EN QUE ANDAMOS

Orden Global está construyendo algo bastante simple de decir y difícil de
hacer: una sola moneda para transaccionar en toda América Latina.

Hoy mandar plata de un país a otro de la región cuesta caro, tarda, y pasa por
tres monedas que se devalúan mientras el dinero viaja. Nosotros hicimos la
cadena, la billetera, la identidad y la casa de cambio para que ese viaje sea
uno solo: de una persona a otra, en minutos, con una moneda que no se achica
mientras tanto.

  ${CASA}      — la casa y lo que estamos construyendo
  ${CADENA}     — el explorador de la cadena, abierto a cualquiera
  ${SITIO}  — tu billetera

Cualquier duda, respondé a este mismo correo y te contesta una persona.

${token} es un valor negociable (security token) emitido bajo Próspera. Esta
carta acompaña una entrega de tokens que ya son tuyos: no es una oferta, ni una
invitación a invertir, ni una promesa de rentabilidad.

—
Orden Global Corp · Próspera, Roatán, Honduras
Nunca te vamos a pedir por correo tu contraseña ni tu frase de respaldo. Si un
mensaje a nombre nuestro te las pide, no es nuestro.
Escribinos a ${RESPUESTA}
`;

  return { asunto, html, texto };
}

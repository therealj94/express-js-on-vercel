/* La página que se ve al tocar el enlace de confirmación.
 *
 * Antes era un «Email verified successfully» en inglés y en texto plano. Si
 * algo fallaba no se respondía nada y el navegador se quedaba cargando. Ahora
 * es una página en español con el mismo marco que los correos y un botón que
 * vuelve a la app. No lleva scripts ni nada que venga de fuera: solo texto fijo.
 */
import { marco, botonCorreo } from "./correo.js";

const ABRIR_APP = "vetawallet://";

const PAGINAS = {
  ok: {
    titulo: "Correo confirmado",
    cuerpo: "Listo: tu correo quedó confirmado. Ya podés volver a la app.",
    boton: true,
  },
  vencido: {
    titulo: "El enlace venció",
    cuerpo: "Este enlace ya no vale: los enlaces de confirmación duran 7 días. " +
      "Pedí uno nuevo desde la app, en Ajustes → Reenviar correo de confirmación.",
    boton: true,
  },
  invalido: {
    titulo: "Enlace no válido",
    cuerpo: "Este enlace no es válido o ya se usó. Si ya confirmaste tu correo, no tenés que hacer nada más. " +
      "Si no, pedí uno nuevo desde la app, en Ajustes → Reenviar correo de confirmación.",
    boton: true,
  },
  error: {
    titulo: "Algo falló",
    cuerpo: "No pudimos confirmar tu correo ahora mismo. Probá abrir el enlace otra vez en unos minutos.",
    boton: false,
  },
};

/** @param {"ok"|"vencido"|"invalido"|"error"} estado */
export function paginaConfirmacion(estado) {
  const p = PAGINAS[estado] || PAGINAS.error;
  return marco(p.titulo, `
        <h1 style="margin:0 0 6px;font:700 24px/1.2 Georgia,serif;color:#F3ECD9;">${p.titulo}</h1>
        <p style="margin:14px 0 0;">${p.cuerpo}</p>
        ${p.boton ? botonCorreo("Abrir Veta Wallet", ABRIR_APP) : ""}`);
}

/* La carta de bienvenida: que diga lo que debe y calle lo que no.
 *
 *   node pruebas/probar-bienvenida.mjs
 *
 * Hay tres cosas que un humano no comprueba bien leyendo, y las tres se cuelan
 * solas al editar el texto meses después:
 *
 *   1. LOS GUIONES. José pidió que no hubiera ninguno, ni corto ni largo,
 *      porque el guion largo para meter incisos es lo que delata un texto
 *      escrito por una máquina. Al escribir en español salen sin pensarlo. Se
 *      miran solo en el TEXTO VISIBLE: el HTML lleva guiones a montones dentro
 *      de las hojas de estilo (`border-top`, `ui-monospace`) y contarlos ahí
 *      daría un falso positivo eterno hasta que nadie mirara la prueba.
 *   2. LA REGLA DE LA JUNTA. El ORIGEN sigue el precio del oro. Nunca está
 *      «respaldado» ni «es una onza». Es la clase de frase que alguien mejora
 *      con la mejor intención y convierte en una promesa que no se puede
 *      cumplir.
 *   3. LA BAJA. Una carta masiva sin enlace de baja no es un descuido de
 *      estilo: es lo que hace que la gente marque «esto es basura», y con eso
 *      se quema el dominio para todo, incluido el correo de recuperar la
 *      contraseña.
 */
const { cartaBienvenida, ASUNTO } = await import('../lib/cartaBienvenida.js');

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};

/** El texto que la persona ve: sin etiquetas, sin estilos, con las entidades ya resueltas. */
function visible(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const GUIONES = /[-‐‑‒–—―−]/g;

/* Las direcciones de internet se quitan antes de buscar guiones. El servidor se
   llama `vetawallet-1a2e38ac52b1.herokuapp.com` y ese guion no lo escribió
   nadie: lo puso Heroku. La regla es sobre cómo se REDACTA, no sobre los
   nombres propios de las máquinas, y una prueba que se queja de algo que no se
   puede arreglar es una prueba que se acaba ignorando. */
const sinEnlaces = (t) => t.replace(/https?:\/\/\S+/g, ' ');

for (const nuevo of [false, true]) {
  const quien = nuevo ? 'a quien acaba de llegar' : 'a quien ya tenía cuenta';
  const c = cartaBienvenida({ nombre: 'María', correo: 'maria@ejemplo.com', nuevo });
  console.log(`\n── ${quien} ───────────────────────────────────────────`);

  // ── 1 · ni un guion ───────────────────────────────────────────────────────
  for (const [donde, crudo] of [['el HTML', visible(c.html)], ['el texto plano', c.texto]]) {
    const texto = sinEnlaces(crudo);
    const hallados = texto.match(GUIONES) || [];
    let muestra = '';
    if (hallados.length) {
      const i = texto.search(GUIONES);
      muestra = '…' + texto.slice(Math.max(0, i - 45), i + 45).replace(/\n/g, ' ') + '…';
    }
    comprobar(hallados.length === 0, `sin un solo guion en ${donde}`,
      hallados.length ? `${hallados.length} encontrado(s): ${muestra}` : '');
  }

  // ── 2 · la regla de la Junta sobre el ORIGEN ──────────────────────────────
  const todo = (visible(c.html) + ' ' + c.texto).toLowerCase();
  for (const prohibida of ['respaldad', 'es una onza', 'garantizad', 'rendimiento', 'ganancia']) {
    comprobar(!todo.includes(prohibida), `no dice «${prohibida}…»`);
  }

  // ── 3 · la baja, en las dos versiones ─────────────────────────────────────
  comprobar(/\/baja\?c=/.test(c.html), 'el HTML lleva enlace de baja firmado');
  comprobar(/\/baja\?c=/.test(c.texto), 'el texto plano también');

  // ── 4 · el botón lleva a donde se entra o se abre cuenta ──────────────────
  comprobar(c.html.includes('https://app.vetawallet.com'), 'el botón va a la app');
  comprobar(c.texto.includes('https://app.vetawallet.com'), 'y el texto plano da la misma dirección');

  // ── 5 · nada que llegue roto ──────────────────────────────────────────────
  comprobar(!/<img|background-image|url\(/i.test(c.html),
    'ni una imagen remota, que la mayoría de clientes bloquea');
  comprobar(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(todo),
    'sin emoji: un correo que habla de dinero compite con la desconfianza');

  // ── 6 · que de verdad diga algo ───────────────────────────────────────────
  for (const pieza of ['Veta Wallet', 'PULSE2CHAT', 'Genesis ID', '5550']) {
    comprobar(todo.includes(pieza.toLowerCase()), `nombra ${pieza}`);
  }
  comprobar(c.asunto === ASUNTO && c.asunto.length > 10 && c.asunto.length < 70,
    'el asunto cabe sin que lo corten', `${c.asunto.length} caracteres`);
  comprobar(c.texto.length > 400, 'la versión de texto no está vacía',
    `${c.texto.length} caracteres`);
}

// La apertura tiene que ser DISTINTA para cada quien; si no, sobra el
// parametro entero y alguien le esta diciendo «bienvenido» a quien lleva meses.
const a = cartaBienvenida({ correo: 'x@y.com', nuevo: false }).texto;
const b = cartaBienvenida({ correo: 'x@y.com', nuevo: true }).texto;
console.log('\n── las dos versiones ───────────────────────────────────────');
comprobar(a !== b, 'quien ya estaba y quien acaba de llegar leen aperturas distintas');

if (fallos) { console.log(`\n${fallos} comprobación(es) fallaron`); process.exit(1); }
console.log('\nTodo en verde');

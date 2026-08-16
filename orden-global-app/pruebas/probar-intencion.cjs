// ═══ LA PRUEBA DEL TRADUCTOR ═════════════════════════════════════════════
// node pruebas/probar-intencion.cjs
//
// src/intencion.js no tiene imports a propósito: aquí se lee el fichero, se
// le quitan los `export` y se evalúa tal cual — la MISMA gramática que corre
// en el teléfono, sin transpilar nada. Si esta prueba está en verde, cada
// frase de EJEMPLOS la entiende el traductor de verdad (esa es la regla:
// nunca se enseña una frase que no funciona).
const fs = require('fs');
const path = require('path');

const fuente = fs.readFileSync(path.join(__dirname, '..', 'src', 'intencion.js'), 'utf8');
const fabrica = new Function(fuente.replace(/^export /gm, '') + '\nreturn { traducir, EJEMPLOS, sinTildes, masParecido };');
const { traducir, EJEMPLOS, masParecido } = fabrica();

// La libreta de mentira: Ana DENTRO de Mariana a propósito — es el caso que
// mandaba dinero a la persona equivocada cuando se buscaba por substring.
const LIB = [
  { nombre: 'Juan', correo: 'juan@og.hn', addr: '0xJUAN' },
  { nombre: 'María', correo: 'maria@og.hn', addr: '0xMARIA' },
  { nombre: 'Ana', correo: 'ana@og.hn', addr: '0xANA' },
  { nombre: 'Mariana', correo: 'mariana@og.hn', addr: '0xMARIANA' },
];

let pasan = 0;
const fallos = [];
function prueba(nombre, cond) {
  if (cond) { pasan += 1; return; }
  fallos.push(nombre);
}
const j = (x) => JSON.stringify(x);

// ── 1. los EJEMPLOS enseñados se entienden TODOS ─────────────────────────
for (const lang of ['es', 'en']) {
  for (const frase of EJEMPLOS[lang]) {
    const r = traducir(frase, LIB);
    prueba(`EJEMPLO ${lang} «${frase}» → ${j(r)}`, r && r.ruta && !r.falla);
  }
}

// ── 2. responde a su nombre: se lo quita antes de traducir ───────────────
{
  const r = traducir('Nexus, envía 15 a Juan', LIB);
  prueba('«Nexus, envía 15 a Juan» = envío de 15 a Juan',
    r && r.ruta === 'wallet/enviar' && r.params.amount === '15' && r.params.to === '0xJUAN');
  const r2 = traducir('nexus abre la billetera', LIB);
  prueba('«nexus abre la billetera» = wallet/abrir', r2 && r2.ruta === 'wallet/abrir');
  // el nombre puesto por la persona también manda (tercer argumento)
  const r3 = traducir('Auro, cóbrale 200', LIB, 'Auro');
  prueba('«Auro, cóbrale 200» con alias Auro = cobro de 200',
    r3 && r3.ruta === 'pay/cobrar' && r3.params.monto === '200');
  // el nombre a secas no es una orden
  prueba('«Nexus» a secas → null', traducir('Nexus', LIB) === null);
}

// ── 3. buscar negocios: al directorio FILTRADO, con etiqueta hablada ─────
{
  const r = traducir('quiero arroz chino', LIB);
  prueba('«quiero arroz chino» → pay/explorar q=china',
    r && r.ruta === 'pay/explorar' && r.params.q === 'china' && r.negocio && r.negocio.es);
  const r2 = traducir('una farmacia', LIB);
  prueba('«una farmacia» → pay/explorar cat=salud',
    r2 && r2.ruta === 'pay/explorar' && r2.params.cat === 'salud');
  const r3 = traducir('pizza', LIB);
  prueba('«pizza» → pay/explorar q=pizza', r3 && r3.ruta === 'pay/explorar' && r3.params.q === 'pizza');
  const r4 = traducir('dónde como', LIB);
  prueba('«dónde como» → pay/explorar cat=restaurantes',
    r4 && r4.ruta === 'pay/explorar' && r4.params.cat === 'restaurantes');
  const r5 = traducir('i want chinese food', LIB);
  prueba('«i want chinese food» → q=china', r5 && r5.ruta === 'pay/explorar' && r5.params.q === 'china');
  const r6 = traducir('quiero un café', LIB);
  prueba('«quiero un café» → cat=cafeterias', r6 && r6.ruta === 'pay/explorar' && r6.params.cat === 'cafeterias');
}

// ── 4. mensaje dictado: el texto viaja en params.txt, TAL CUAL ───────────
{
  const r = traducir('envíale un mensaje a Juan que diga llego en diez minutos', LIB);
  prueba('mensaje dictado → chat/abrir con Juan y el texto en txt',
    r && r.ruta === 'chat/abrir' && r.params.con === 'juan@og.hn' && r.params.txt === 'llego en diez minutos');
  // un nombre DENTRO del texto no roba el destinatario
  const r2 = traducir('envíale un mensaje a Ana que diga saluda a Mariana de mi parte', LIB);
  prueba('el nombre dentro del texto no cambia el destinatario',
    r2 && r2.params.con === 'ana@og.hn' && r2.params.txt === 'saluda a Mariana de mi parte');
  const r3 = traducir('send Juan a message saying on my way', LIB);
  prueba('mensaje dictado en inglés', r3 && r3.params.con === 'juan@og.hn' && r3.params.txt === 'on my way');
}

// ── 5. el contacto por bordes de palabra: Ana NO vive dentro de Mariana ──
{
  const r = traducir('mándale 50 a Mariana', LIB);
  prueba('«mándale 50 a Mariana» va a Mariana, no a Ana',
    r && r.ruta === 'wallet/enviar' && r.params.to === '0xMARIANA');
  const r2 = traducir('mándale 50 a Ana', LIB);
  prueba('«mándale 50 a Ana» sigue yendo a Ana', r2 && r2.params.to === '0xANA');
}

// ── 6. el monto anclado al verbo, y los millares son millares ────────────
{
  const r = traducir('envíale 1,000 a Juan', LIB);
  prueba('«envíale 1,000 a Juan» son MIL, no un peso', r && r.params.amount === '1000');
  const r2 = traducir('envía 1.000 a Juan', LIB);
  prueba('«envía 1.000 a Juan» también son mil', r2 && r2.params.amount === '1000');
  const r3 = traducir('envía 15,50 a Juan', LIB);
  prueba('«envía 15,50» son quince con cincuenta', r3 && r3.params.amount === '15.50');
  // el número lejos del verbo NO es un monto: se pide el número limpio
  const r4 = traducir('envía a Juan lo de la mesa 12', LIB);
  prueba('«envía a Juan lo de la mesa 12» → falla sinMonto', r4 && r4.falla === 'sinMonto');
}

// ── 7. cobrar con monto sembrado ─────────────────────────────────────────
{
  const r = traducir('cóbrale 200', LIB);
  prueba('«cóbrale 200» → pay/cobrar monto=200', r && r.ruta === 'pay/cobrar' && r.params.monto === '200');
}

// ── 8. swap, ajustes y ayuda: los huecos del mapa, tapados ───────────────
{
  const r = traducir('haz un swap de 20', LIB);
  prueba('«haz un swap de 20» → wallet/swap amount=20',
    r && r.ruta === 'wallet/swap' && r.params.amount === '20');
  const r2 = traducir('abre los ajustes', LIB);
  prueba('«abre los ajustes» → ajustes', r2 && r2.ruta === 'ajustes');
  const r3 = traducir('ayuda', LIB);
  prueba('«ayuda» → asistente/ayuda (los ejemplos, sin navegar)', r3 && r3.ruta === 'asistente/ayuda');
}

// ── 9. lo de siempre sigue ───────────────────────────────────────────────
{
  const r = traducir('hazme un reporte de mi billetera', LIB);
  prueba('reporte sigue', r && r.ruta === 'wallet/reporte');
  const r2 = traducir('quiero ver mi saldo', LIB);
  prueba('saldo sigue', r2 && r2.ruta === 'wallet/abrir');
  const r3 = traducir('envía 15 a Pedro', LIB);
  prueba('desconocido → sinContacto', r3 && r3.falla === 'sinContacto');
  prueba('sin sentido → null', traducir('el cielo es azul hoy', LIB) === null);
}

// ── 10. no entender no puede ser una puerta cerrada ──────────────────────
// Cuando el traductor devuelve null, la hoja enseña lo mas parecido de lo
// que SI entiende. Lo que se comprueba no es que acierte siempre —es tosco a
// proposito— sino las dos cosas que no puede fallar: que nunca devuelva una
// lista vacia, y que solo proponga frases que el traductor entiende de
// verdad. Proponer algo que luego no funciona es peor que no proponer nada.
{
  for (const lang of ['es', 'en']) {
    const casos = ['el cielo es azul hoy', 'quiero mandarle plata a alguien',
                   'necesito ver mis movimientos', '', 'zzzz'];
    let vacias = 0, rotas = [];
    for (const c of casos) {
      const s2 = masParecido(c, lang);
      if (!s2 || !s2.length) vacias++;
      for (const ej of s2) if (!EJEMPLOS[lang].includes(ej)) rotas.push(ej);
    }
    prueba(`[${lang}] nunca deja a nadie sin salida`, vacias === 0);
    prueba(`[${lang}] solo propone frases que el traductor entiende`, rotas.length === 0);
  }
  // y cuando SI hay algo parecido, lo encuentra
  const cerca = masParecido('quiero ver mi tarjeta ahora', 'es');
  prueba('«quiero ver mi tarjeta ahora» propone la de la tarjeta',
    cerca.some((x) => /tarjeta/.test(x)));
  const cercaEn = masParecido('i need to charge someone', 'en');
  prueba('«i need to charge someone» propone cobrar',
    cercaEn.some((x) => /charge/.test(x)));
}

// ── el veredicto ─────────────────────────────────────────────────────────
if (fallos.length) {
  console.log(`\n✗ ${fallos.length} fallo(s), ${pasan} en verde:`);
  for (const f of fallos) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log(`✓ ${pasan} pruebas en verde`);

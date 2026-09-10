/* Las piezas de la campaña, en datos.
 *
 * Doce piezas a mano habrían sido doce archivos que se separan en cuanto
 * alguien cambia el oro de la marca en uno solo. Aquí hay CUATRO maquetas y
 * doce contenidos: cambiar el color de la casa es una línea y salen las doce
 * iguales.
 *
 * ══ LAS CUATRO MAQUETAS ════════════════════════════════════════════════════
 *
 *   cartel  — una frase grande y nada más. Para lo que es marca.
 *   dato    — una cifra enorme con su pie. Para lo que se demuestra con un número.
 *   pasos   — tres pasos numerados. Para lo que hay que explicar.
 *   objeto  — un objeto dibujado (lingote, escudo, cadena) y una línea.
 *
 * Se alternan a propósito en el calendario: doce piezas con la misma maqueta
 * son un perfil que se ve monótono al entrar, y en Instagram el perfil es la
 * segunda impresión.
 *
 * ══ NI UN DATO INVENTADO, TAMBIÉN AQUÍ ═════════════════════════════════════
 *
 * Las cifras de estas piezas salen de lo que la casa ya publica en
 * app.vetawallet.com o de la cadena. Donde NO hay dato medido —la devaluación
 * de cada moneda, por ejemplo— la pieza pregunta en vez de afirmar, y el número
 * se deja para la calculadora, que lo saca con su fuente a la vista.
 */

const PIEZAS = [

  // ── MARCA · lo que la casa es ────────────────────────────────────────────
  {
    id: 'cinco-mil-anos',
    maqueta: 'cartel',
    rotulo: 'Orden Global',
    titulo: ['Cinco mil años', 'de tener razón.'],
    apoyo: 'Imperios enteros se apagaron y el oro siguió siendo dinero. '
         + 'Ahora cabe en tu teléfono.',
    pie: 'veta wallet',
  },
  {
    id: 'no-es-promesa',
    maqueta: 'cartel',
    rotulo: 'Qué guardás',
    titulo: ['Tu saldo no es', 'una promesa.'],
    apoyo: 'Es ORIGEN: oro real, certificado y guardado. No una cifra en la '
         + 'pantalla de alguien.',
    pie: 'veta wallet',
  },
  {
    id: 'comprobalo',
    maqueta: 'objeto',
    objeto: 'escudo',
    rotulo: 'Transparencia',
    titulo: ['Comprobalo', 'vos mismo.'],
    apoyo: 'Cada movimiento está en una cadena pública. No hace falta que nos '
         + 'creas: abrí ordenscan.com y mirá.',
    pie: 'ordenscan.com',
  },

  // ── PRODUCTO · lo que se puede hacer hoy ─────────────────────────────────
  {
    id: 'gramin',
    maqueta: 'dato',
    rotulo: 'El gramin',
    cifra: '1',
    unidad: 'GRAMIN',
    // La definición es la misma que está publicada en la portada de la wallet.
    apoyo: 'La división exacta del gramo de oro certificado. Para que guardar '
         + 'oro no empiece en una onza que nadie tiene.',
    pie: 'veta wallet',
  },
  {
    id: 'respaldo',
    maqueta: 'dato',
    rotulo: 'El respaldo',
    cifra: '1:1',
    unidad: 'EN ORO FÍSICO',
    apoyo: 'Por cada ORIGEN que existe hay oro guardado. No hay más ORIGEN que '
         + 'oro, y ese es el punto entero.',
    pie: 'veta wallet',
  },
  {
    id: 'cadena-propia',
    maqueta: 'dato',
    rotulo: 'La cadena',
    cifra: '8532',
    unidad: 'CADENA PROPIA',
    apoyo: 'No un contrato alquilado en la red de otro. Los validadores, el gas '
         + 'y las reglas son de la casa.',
    pie: 'ordenscan.com',
  },
  {
    id: 'veintiuna-monedas',
    maqueta: 'dato',
    rotulo: 'AuCorp',
    cifra: '21',
    unidad: 'MONEDAS',
    apoyo: 'Cuentas en moneda local para toda Latinoamérica, Canadá y el euro. '
         + 'De tu oro a tu banco, sin salir de la casa.',
    pie: 'aucorp · orden global',
  },

  // ── EDUCATIVO · cómo se usa ──────────────────────────────────────────────
  {
    id: 'tres-pasos',
    maqueta: 'pasos',
    rotulo: 'Cómo se empieza',
    titulo: ['Tres pasos.', 'Una sola vez.'],
    pasos: [
      ['Descargá', 'Veta Wallet, gratis, en tu teléfono.'],
      ['Verificate', 'con Genesis ID. Se hace una vez y sirve para todo.'],
      ['Guardá en oro', 'lo que hoy se te devalúa en el bolsillo.'],
    ],
    pie: 'veta wallet',
  },
  {
    id: 'una-identidad',
    maqueta: 'pasos',
    rotulo: 'Genesis ID',
    titulo: ['Una identidad', 'para todo.'],
    pasos: [
      ['Una vez', 'verificás quién sos, y ya está.'],
      ['En todas', 'la billetera, la casa de cambio, las cuentas.'],
      ['Tuya', 'no la tenés que volver a entregar en cada sitio.'],
    ],
    pie: 'genesis id · orden global',
  },
  {
    id: 'que-pierde-tu-moneda',
    maqueta: 'cartel',
    rotulo: 'La pregunta',
    titulo: ['¿Cuánto compraba', 'tu sueldo?'],
    // A propósito SIN cifra: no tenemos la inflación de cada país medida por
    // nosotros, y poner un número redondo «que suena bien» en un anuncio de
    // dinero es exactamente lo que no hace esta casa. El número sale en la
    // calculadora, con su fuente escrita al lado.
    apoyo: 'El de 2019, digamos. Hacé el número — y después mirá cuánto '
         + 'compraría hoy si lo hubieras guardado en oro.',
    pie: 'veta wallet',
  },

  // ── INSTITUCIONAL · lo que nadie puede copiar ────────────────────────────
  {
    id: 'la-mina',
    maqueta: 'objeto',
    objeto: 'lingote',
    rotulo: 'De dónde sale',
    titulo: ['El oro no', 'nace en una app.'],
    apoyo: 'Detrás de cada gramin hay una operación minera real. Esa es la '
         + 'diferencia entre respaldo y relato.',
    pie: 'orden global',
  },

  // ── RECURRENTE · la plantilla del post diario ────────────────────────────
  {
    id: 'precio-del-dia',
    maqueta: 'dato',
    rotulo: 'El oro hoy',
    // Estos dos campos los reemplaza el post diario con el dato del feed. Se
    // dejan con guion —y no con un número de ejemplo— para que nadie publique
    // por error una plantilla con un precio inventado dentro.
    cifra: '00.00',
    unidad: 'USD / GRAMO · PLANTILLA',
    apoyo: 'El precio de referencia del gramo de oro, todos los días, del mismo '
         + 'feed que usa la billetera.',
    pie: 'veta wallet',
    plantilla: true,
  },
];

if (typeof module !== 'undefined') module.exports = { PIEZAS };
if (typeof window !== 'undefined') window.PIEZAS = PIEZAS;

// Lectura de la MRZ con la cámara.
//
// POR QUE ESTO EXISTE
//
// La pantalla pedía teclear las dos líneas del pie del documento: 88 caracteres
// llenos de «<». Nadie lo hace. Es el sitio donde se abandona la verificación,
// y con razón.
//
// POR QUE EL RECONOCIMIENTO OCURRE EN EL TELEFONO
//
// Podría mandarse la foto al servidor y resolverlo allí con más potencia. No se
// hace, y no es por ahorrar: la pantalla promete «solo se envía el texto, nunca
// la foto de tu documento», y esa promesa es real precisamente porque la imagen
// no sale del teléfono. Mandarla rompería la propiedad más valiosa del diseño —
// que Genesis ID nunca llega a tener una foto de la cédula de nadie.
//
// EL TRUCO QUE HACE QUE ESTO FUNCIONE DE VERDAD
//
// Ningún OCR lee bien la MRZ a la primera: confunde O con 0, I con 1, S con 5,
// B con 8. Un lector normal se rendiría ahí.
//
// Pero la MRZ lleva sus propios dígitos de control. Eso permite algo mejor que
// adivinar: se prueban las combinaciones de los caracteres ambiguos y se
// escoge la única que satisface TODOS los dígitos de control a la vez. La
// probabilidad de que una lectura equivocada cuadre con todos ellos es
// despreciable, así que lo que sale de aquí o es correcto o se descarta.
//
// El resultado práctico: una foto torcida y con reflejos se convierte en una
// MRZ exacta, o en un «no se pudo leer, inténtalo otra vez» honesto.

import { NativeModules } from 'react-native';

const CARGA = { modulo: null, intentado: false };

/**
 * ML Kit se carga a la primera y en un try: si el binario no lo trae —Expo Go,
 * o un APK viejo— la pantalla tiene que seguir funcionando a mano en vez de
 * reventar al abrirse.
 *
 * PERO EL TRY NO ALCANZA, Y ESE ERA EL FALLO.
 *
 * En Expo Go el require() NO lanza. El paquete está escrito al estilo viejo de
 * React Native: cuando `NativeModules.TextRecognition` falta, en vez de fallar
 * deja un Proxy que solo lanza al llamar a un método. Así que `m.default`
 * seguía siendo un objeto de verdad, con su `recognize` puesto, y
 * `puedeEscanear()` contestaba que SÍ.
 *
 * Lo que se veía: salían los dos botones de escáner; el bucle automático
 * gastaba sus quince fotos sin decir palabra —cada `recognize` lanzaba y el
 * catch de leerDeFoto lo convertía en un «no se encontró» más—; y el escáner
 * manual acababa diciendo «prueba con más luz» a alguien cuyo problema no era
 * la luz sino que ahí no hay lector. Un cuarto de hora de fotos para nada.
 *
 * Lo único que distingue de verdad un caso del otro es el módulo nativo, así
 * que es lo que se comprueba. No es una heurística: es exactamente la misma
 * condición que usa el propio paquete para decidir si devuelve el módulo o el
 * Proxy de mentira, o sea que no puede dar un falso negativo en un binario
 * donde el escáner sí funcionaría.
 */
function reconocedor() {
  if (!CARGA.intentado) {
    CARGA.intentado = true;
    try {
      const m = require('@react-native-ml-kit/text-recognition');
      CARGA.modulo = NativeModules?.TextRecognition ? (m?.default || m) : null;
    } catch (e) {
      CARGA.modulo = null;
    }
  }
  return CARGA.modulo;
}

/**
 * Segunda línea de defensa: reconocer el error de enlazado cuando ya se llamó.
 *
 * La comprobación de arriba cubre el caso conocido, pero un binario a medio
 * hacer podría registrar el módulo y fallar igual al usarlo. Si eso pasa se
 * apaga el lector para el resto de la sesión —quince fotos dando el mismo
 * error de enlazado no ayudan a nadie— y quien llamó se entera con el motivo
 * 'sin-lector', que es el que la pantalla sabe traducir a «esta versión de la
 * app no puede escanear» en vez de a «prueba con más luz».
 */
function sinEnlace(e) {
  const msg = String(e?.message || e || '');
  if (!/seem to be linked|NativeModule|native module/i.test(msg)) return false;
  CARGA.modulo = null;
  return true;
}

export const puedeEscanear = () => Boolean(reconocedor());

// ---------------------------------------------------------------------------
// Aritmética de la MRZ (ICAO 9303)
// ---------------------------------------------------------------------------

const VALOR = (c) => {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
  return 0; // «<» vale cero
};

const PESOS = [7, 3, 1];

/** Dígito de control de la norma: suma ponderada 7-3-1, módulo 10. */
export function digitoControl(texto) {
  let suma = 0;
  for (let i = 0; i < texto.length; i++) suma += VALOR(texto[i]) * PESOS[i % 3];
  return String(suma % 10);
}

/**
 * Dónde está cada dígito de control y qué campo cubre, por formato.
 * `[inicioCampo, finCampo, posicionDelDigito]`, todos sobre la línea indicada.
 */
const CONTROLES = {
  TD3: [
    { linea: 1, campo: [0, 9], digito: 9 },    // número de documento
    { linea: 1, campo: [13, 19], digito: 19 }, // fecha de nacimiento
    { linea: 1, campo: [21, 27], digito: 27 }, // fecha de caducidad
  ],
  TD2: [
    { linea: 1, campo: [0, 9], digito: 9 },
    { linea: 1, campo: [13, 19], digito: 19 },
    { linea: 1, campo: [21, 27], digito: 27 },
  ],
  TD1: [
    { linea: 0, campo: [5, 14], digito: 14 },  // número de documento
    { linea: 1, campo: [0, 6], digito: 6 },    // fecha de nacimiento
    { linea: 1, campo: [8, 14], digito: 14 },  // fecha de caducidad
  ],
};

/** Cuántos dígitos de control cuadran, y cuántos se comprobaron. */
export function cuadranDigitos(lineas, formato) {
  const reglas = CONTROLES[formato] || [];
  let bien = 0;
  for (const r of reglas) {
    const l = lineas[r.linea];
    if (!l) continue;
    const esperado = digitoControl(l.slice(r.campo[0], r.campo[1]));
    if (l[r.digito] === esperado) bien++;
  }
  return { bien, total: reglas.length };
}

// ---------------------------------------------------------------------------
// Corrección
// ---------------------------------------------------------------------------

/**
 * Letras que un OCR pone donde había una cifra, sobre la tipografía OCR-B.
 *
 * La corrección va SOLO en este sentido —letra a cifra— y SOLO dentro de los
 * campos donde la norma no admite letras. Esa restricción es lo que separa
 * «arreglar una lectura» de «inventar un documento»: si en una fecha aparece
 * una «O», es con certeza un error de lectura, porque ahí no puede haber una
 * letra. En cambio, cambiar una cifra por otra cifra sería adivinar, y con
 * suficientes intentos se encuentra una combinación que cuadra por casualidad
 * y que corresponde al documento de otra persona.
 */
const LETRA_A_CIFRA = {
  O: ['0'], Q: ['0'], D: ['0'], U: ['0'],
  I: ['1'], L: ['1'],
  Z: ['2'], A: ['4'], S: ['5'], G: ['6'], T: ['7'], B: ['8'],
};

/**
 * Cifras que el OCR pone donde solo puede haber letras: los nombres.
 *
 * Es el reflejo exacto de la tabla de arriba. En una cédula real se leyó
 * «ENAMORAD0» con un cero: en un apellido no cabe una cifra, así que es con
 * certeza un error de lectura y se puede corregir sin adivinar nada.
 */
const CIFRA_A_LETRA = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 6: 'G', 8: 'B' };

/**
 * Arregla las cifras que aparezcan en la línea de nombres.
 *
 * Solo en esa línea —la tercera de una TD1, la primera de un pasaporte— y solo
 * después del tipo de documento y el país, que sí llevan cifras en otros
 * formatos. Es una corrección segura: la norma no admite dígitos en un nombre.
 */
export function arreglarNombres(lineas, formato) {
  const iNombres = formato === 'TD1' ? 2 : 0;
  const l = lineas[iNombres];
  if (!l) return lineas;
  // En TD3/TD2 los cinco primeros caracteres son tipo y país emisor.
  const desde = formato === 'TD1' ? 0 : 5;
  const arreglada = l.split('').map((c, i) =>
    (i >= desde && CIFRA_A_LETRA[c]) ? CIFRA_A_LETRA[c] : c).join('');
  const copia = [...lineas];
  copia[iNombres] = arreglada;
  return copia;
}

/** Posiciones donde la norma exige cifra: los dígitos de control y las fechas. */
function zonasNumericas(formato) {
  const reglas = CONTROLES[formato] || [];
  const mapa = new Map();
  for (const r of reglas) {
    const set = mapa.get(r.linea) || new Set();
    set.add(r.digito);
    // Las fechas son seis cifras. El número de documento puede llevar letras,
    // así que ahí solo se fuerza el propio dígito de control.
    if (r.campo[1] - r.campo[0] === 6) for (let i = r.campo[0]; i < r.campo[1]; i++) set.add(i);
    mapa.set(r.linea, set);
  }
  return mapa;
}

const aplicar = (lineas, cambios) => {
  const copia = [...lineas];
  for (const { linea, pos, a } of cambios) {
    copia[linea] = copia[linea].slice(0, pos) + a + copia[linea].slice(pos + 1);
  }
  return copia;
};

/**
 * Intenta arreglar la lectura.
 *
 * Dos salvaguardas, y las dos importan más que la tasa de acierto:
 *
 *   · se prueba primero con UN cambio, luego con dos, y así: la lectura buena
 *     es casi siempre la que está más cerca de lo que se vio;
 *   · si a esa distancia mínima hay más de una lectura que cuadra, se
 *     devuelve `null`. Dos respuestas posibles es no tener respuesta, y elegir
 *     una al azar significaría mandar el documento de otra persona.
 *
 * Cuando no sale, se le pide otra foto a la persona. Es más honesto que
 * entregar un documento que nadie escribió.
 */
export function corregirConDigitos(lineas, formato) {
  const inicial = cuadranDigitos(lineas, formato);
  if (inicial.total === 0) return null;
  if (inicial.bien === inicial.total) return lineas;

  const numericas = zonasNumericas(formato);
  const candidatas = [];
  lineas.forEach((linea, iL) => {
    const soloCifras = numericas.get(iL);
    if (!soloCifras) return;
    for (const i of soloCifras) {
      const alts = LETRA_A_CIFRA[linea[i]];
      if (alts) candidatas.push({ linea: iL, pos: i, alts });
    }
  });
  if (!candidatas.length || candidatas.length > 10) return null;

  // Por número de cambios, de menos a más.
  for (let k = 1; k <= candidatas.length; k++) {
    const encontradas = new Set();
    let ejemplo = null;

    const combinar = (desde, elegidas) => {
      if (elegidas.length === k) {
        const prueba = aplicar(lineas, elegidas);
        const r = cuadranDigitos(prueba, formato);
        if (r.bien === r.total) {
          const clave = prueba.join('\n');
          if (!encontradas.has(clave)) { encontradas.add(clave); ejemplo = prueba; }
        }
        return;
      }
      for (let i = desde; i < candidatas.length; i++) {
        for (const a of candidatas[i].alts) {
          combinar(i + 1, [...elegidas, { ...candidatas[i], a }]);
        }
      }
    };
    combinar(0, []);

    if (encontradas.size === 1) return ejemplo;
    if (encontradas.size > 1) return null; // ambiguo: mejor no responder
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extracción desde el texto que devuelve el OCR
// ---------------------------------------------------------------------------

const FORMATOS = [
  { largo: 44, formato: 'TD3', cuantas: 2 },
  { largo: 36, formato: 'TD2', cuantas: 2 },
  { largo: 30, formato: 'TD1', cuantas: 3 },
];

/**
 * ¿Esto tiene pinta de una línea de MRZ y no del resto del documento?
 *
 * La marca que las distingue es el «<»: los documentos rellenan con él los
 * campos hasta el largo fijo, y ningún texto impreso lo lleva. Sin esta
 * condición, «REPUBLICA DE HONDURAS» y «COMISIONADOS PROPIETARIOS» pasaban por
 * líneas de MRZ cortadas y la persona recibía un diagnóstico inventado.
 */
const pareceMrz = (l) =>
  l.length >= 12 && (l.includes('<<') || (l.includes('<') && /\d/.test(l)));

/**
 * Saca las líneas de MRZ de todo el texto que ve la cámara.
 *
 * Tres cosas que en el mundo real pasan siempre y la primera versión no
 * contemplaba:
 *
 *   · el OCR parte una línea en dos bloques cuando hay una sombra o un doblez,
 *     así que los trozos consecutivos se intentan unir antes de descartarlos;
 *   · el resto del documento —«COMISIONADOS PROPIETARIOS», el nombre impreso—
 *     también se lee, y hay que distinguirlo;
 *   · si el teléfono está demasiado cerca las líneas salen CORTADAS. Eso no es
 *     «no se distinguen»: es un encuadre que la persona puede arreglar en un
 *     segundo si se lo dicen. Se devuelve `cortadas` para poder decírselo.
 */
export function extraerLineas(textoOcr) {
  const trozos = String(textoOcr || '')
    .toUpperCase()
    .replace(/[«»‹›]/g, '<')
    .replace(/[ \t]/g, '')
    .split(/[\r\n]+/)
    .map((l) => l.replace(/[^A-Z0-9<]/g, ''))
    .filter(Boolean);

  for (const { largo, formato, cuantas } of FORMATOS) {
    const candidatas = [];
    for (let i = 0; i < trozos.length; i++) {
      // Tal cual, o unido con el trozo siguiente por si el OCR partió la línea.
      for (const l of [trozos[i], trozos[i] + (trozos[i + 1] || '')]) {
        if (!pareceMrz(l)) continue;
        if (Math.abs(l.length - largo) > 1) continue;
        candidatas.push(l.length > largo ? l.slice(0, largo) : l.padEnd(largo, '<'));
        break;
      }
    }
    if (candidatas.length >= cuantas) {
      return { formato, lineas: candidatas.slice(0, cuantas) };
    }
  }

  // No cuadró ningún formato. ¿Es porque salen cortadas?
  const parecidas = trozos.filter(pareceMrz);
  if (parecidas.length >= 2) {
    const masLarga = Math.max(...parecidas.map((l) => l.length));
    // Una MRZ empieza en 30 caracteres. Si lo más largo que se ve son 26, el
    // documento no cabe entero en el cuadro.
    if (masLarga < 30) return { cortadas: true, visto: masLarga, lineas: parecidas };
  }
  return null;
}

/**
 * Todo el texto que la cámara vea en una imagen, sin interpretarlo.
 *
 * Se usa para el anverso del documento: ahí no hay MRZ, hay el nombre completo
 * impreso y la fecha. El cotejo lo hace Genesis ID sobre estas palabras; la
 * imagen se queda en el teléfono.
 */
export async function leerTexto(uri) {
  const rec = reconocedor();
  if (!rec) return '';
  try {
    const r = await rec.recognize(uri);
    const porBloques = (r?.blocks || [])
      .flatMap((b) => (b.lines || []).map((l) => l.text) || [b.text])
      .filter(Boolean).join('\n');
    return (porBloques || r?.text || '').slice(0, 4000);
  } catch (e) {
    // Devuelve '' igual —el anverso no tiene motivos que contar, solo texto o
    // nada—, pero si el fallo fue de enlazado el lector queda apagado y la
    // siguiente foto ni se toma: `puedeEscanear()` ya dice que no.
    sinEnlace(e);
    return '';
  }
}

// ---------------------------------------------------------------------------
// El nombre impreso del anverso, y los datos que trae la MRZ
// ---------------------------------------------------------------------------

/**
 * Palabras que aparecen impresas en un documento y NUNCA son el nombre del
 * titular: membretes, etiquetas de campo, meses, estados civiles. Una línea
 * que traiga cualquiera se descarta como candidata a nombre.
 *
 * La lista peca de larga a propósito: descartar de más solo obliga a repetir
 * la foto; aceptar de menos manda «COMISIONADOS PROPIETARIOS» como nombre a
 * la revisión manual — pasó con documentos hondureños reales.
 */
const NO_ES_NOMBRE = new RegExp(
  '(REPUBLIC|HONDURAS|GUATEMALA|NICARAGUA|NACIONAL|IDENTIDAD|IDENTIFICACION' +
  '|REGISTRO|TRIBUNAL|INSTITUTO|DOCUMENTO|CEDULA|PASAPORTE|PASSPORT|TARJETA' +
  '|IDENTITY|FECHA|NACIMIENTO|BIRTH|LUGAR|SEXO|SANGRE|EXPEDICION|EMISION' +
  '|VENCIMIENTO|EXPIRA|DOMICILIO|DIRECCION|MUNICIPIO|DEPARTAMENTO|GOBIERNO' +
  '|ELECTORAL|CLAVE|CURP|FIRMA|NACIONALIDAD|COMISIONADO|PROPIETARIO|SUPLENTE' +
  '|MASCULINO|FEMENINO|SOLTER|CASAD|NOMBRE|APELLIDO|SURNAME|GIVEN' +
  '|ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE' +
  '|NOVIEMBRE|DICIEMBRE)'
);

/**
 * Saca el nombre impreso del ANVERSO del documento.
 *
 * Dos estrategias, por orden de confianza:
 *
 *   1. Etiquetas: «APELLIDOS» / «NOMBRES» (o SURNAME / GIVEN NAMES). El valor
 *      viene en la misma línea o en la de abajo. Es la vía fiable porque la
 *      propia cédula dice qué es cada cosa.
 *   2. Sin etiquetas, la línea con más pinta de nombre completo: solo letras,
 *      de 2 a 6 palabras, ninguna de membrete. Gana la de más palabras: un
 *      nombre centroamericano completo trae 3 o 4, un rótulo suelto trae 2.
 *
 * Devuelve el nombre en orden natural («JOSE ENAMORADO») o `null`. `null`
 * significa «repite la foto»: es preferible a precargar un membrete.
 */
export function nombreDeAnverso(textoOcr) {
  const lineas = String(textoOcr || '')
    .toUpperCase()
    .split(/[\r\n]+/)
    .map((l) => l.replace(/[^A-ZÁÉÍÓÚÜÑ ]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // ¿Vale esta cadena como valor de una etiqueta? Un apellido puede ser UNA
  // sola palabra («PEREZ»), así que aquí basta con una.
  const valorEtiqueta = (l) => {
    if (!l || NO_ES_NOMBRE.test(l)) return '';
    const palabras = l.split(' ').filter((w) => w.length >= 2 && /^[A-ZÁÉÍÓÚÜÑ]+$/.test(w));
    return palabras.length >= 1 && palabras.length <= 5 ? palabras.join(' ') : '';
  };

  const ETIQUETAS = [
    ['apellidos', /^APELLIDOS?\b/],
    ['nombres', /^NOMBRES?\b/],
    ['apellidos', /^SURNAMES?\b/],
    ['nombres', /^GIVEN ?NAMES?\b/],
  ];
  const partes = {};
  for (let i = 0; i < lineas.length; i++) {
    for (const [campo, re] of ETIQUETAS) {
      if (partes[campo] || !re.test(lineas[i])) continue;
      const v = valorEtiqueta(lineas[i].replace(re, '').trim()) || valorEtiqueta(lineas[i + 1]);
      if (v) partes[campo] = v;
    }
  }
  if (partes.apellidos && partes.nombres) return `${partes.nombres} ${partes.apellidos}`;
  // Cédulas con una sola etiqueta «NOMBRE» y el nombre completo debajo: vale
  // si trae al menos dos palabras — una sola no identifica a nadie.
  const suelto = partes.nombres || partes.apellidos || '';
  if (suelto.split(' ').length >= 2) return suelto;

  // Sin etiquetas: la mejor línea con pinta de nombre. Es un mejor-esfuerzo
  // honesto — lo que salga se enseña EDITABLE y se coteja contra lo declarado,
  // nunca se da por bueno a ciegas.
  let mejor = null;
  for (const l of lineas) {
    if (NO_ES_NOMBRE.test(l)) continue;
    const palabras = l.split(' ').filter((w) => w.length >= 2);
    if (palabras.length < 2 || palabras.length > 6) continue;
    if (!palabras.every((w) => /^[A-ZÁÉÍÓÚÜÑ]+$/.test(w))) continue;
    if (!mejor || palabras.length > mejor.cuenta) mejor = { nombre: palabras.join(' '), cuenta: palabras.length };
  }
  return mejor ? mejor.nombre : null;
}

/**
 * Los datos personales que trae una MRZ ya validada: nombre, fecha de
 * nacimiento y número de documento.
 *
 * Existe para el camino de rescate: cuando el anverso no se deja leer, el
 * reverso da estos tres datos con dígitos de control — más fiable que
 * cualquier OCR de texto impreso. OJO: la MRZ tiene ancho fijo y RECORTA los
 * nombres largos; por eso el resultado precarga campos editables y nunca se
 * declara a espaldas de la persona.
 */
export function datosDeMrz(mrzTexto) {
  const lineas = String(mrzTexto || '').toUpperCase().split(/[\r\n]+/)
    .map((l) => l.trim()).filter(Boolean);
  const formato =
    lineas.length === 2 && lineas.every((l) => l.length === 44) ? 'TD3'
      : lineas.length === 2 && lineas.every((l) => l.length === 36) ? 'TD2'
        : lineas.length === 3 && lineas.every((l) => l.length === 30) ? 'TD1'
          : null;
  if (!formato) return null;

  // La zona de nombres: toda la tercera línea en una cédula TD1; en pasaporte
  // y TD2, la primera línea tras tipo y país. «<<» separa apellidos de
  // nombres; «<» suelto es un espacio.
  const zona = formato === 'TD1' ? lineas[2] : lineas[0].slice(5);
  const [apRaw, noRaw = ''] = zona.split('<<');
  const limpiar = (s) => s.replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  const apellidos = limpiar(apRaw);
  const nombres = limpiar(noRaw);
  const nombre = [nombres, apellidos].filter(Boolean).join(' ');
  if (!nombre) return null;

  const numeroDocumento =
    (formato === 'TD1' ? lineas[0].slice(5, 14) : lineas[1].slice(0, 9))
      .replace(/</g, '').trim() || null;

  // YYMMDD sin siglo. La regla estándar: si el año de dos cifras es mayor que
  // el actual, es del siglo pasado. Falla con alguien de 100+ años — la
  // validación de edad de la pantalla ya acota ese caso.
  const f = formato === 'TD1' ? lineas[1].slice(0, 6) : lineas[1].slice(13, 19);
  let nacimiento = null;
  if (/^\d{6}$/.test(f)) {
    const yy = Number(f.slice(0, 2));
    const hoyYY = new Date().getFullYear() % 100;
    nacimiento = {
      anio: String(yy > hoyYY ? 1900 + yy : 2000 + yy),
      mes: f.slice(2, 4),
      dia: f.slice(4, 6),
    };
  }

  return { formato, nombre, apellidos, nombres, numeroDocumento, nacimiento };
}

// Partículas que van y vienen entre cómo se declara un nombre y cómo lo
// imprime el documento («DE LA CRUZ» vs «CRUZ»). Se ignoran en el cotejo.
const CONECTORES = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'DA', 'DO', 'DOS', 'DAS', 'VAN', 'VON', 'DER']);

/** Palabras comparables de un nombre: mayúsculas, sin tildes y con Ñ→N —
 *  exactamente como translitera la MRZ—, sin partículas. */
function palabrasDeNombre(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !CONECTORES.has(w));
}

/**
 * ¿El nombre que leyó el OCR y el declarado son la misma firma?
 *
 * Cotejo honesto, no adivino: palabras normalizadas SIN exigir el orden
 * —«PEREZ LOPEZ JUAN» y «JUAN PEREZ LOPEZ» son la misma persona; el orden de
 * apellidos baila entre formularios—. Se tolera que un lado traiga palabras
 * de más, porque la gente declara menos apellidos de los que imprime su
 * documento; pero TODAS las del lado corto deben estar en el largo, y deben
 * ser al menos dos.
 *
 * Esto NO aprueba nada. Decide si la solicitud puede llevar la marca de
 * cotejo automático; la comprobación que vale la hace el servidor Genesis.
 */
export function mismoNombre(a, b) {
  const A = palabrasDeNombre(a);
  const B = palabrasDeNombre(b);
  const [corto, largo] = A.length <= B.length ? [A, B] : [B, A];
  if (corto.length < 2) return false;
  const resto = [...largo];
  for (const w of corto) {
    const i = resto.indexOf(w);
    if (i === -1) return false;
    resto.splice(i, 1);
  }
  return true;
}

/**
 * Lee la MRZ de una imagen ya guardada en el teléfono.
 *
 * Devuelve `{ ok, mrz, formato, corregida }` o `{ ok:false, motivo }`. Nunca
 * lanza: un fallo del reconocedor tiene que dejar a la persona en la pantalla,
 * con el teclado disponible, no delante de un error.
 */
export async function leerDeFoto(uri) {
  const rec = reconocedor();
  if (!rec) return { ok: false, motivo: 'sin-lector' };
  try {
    const r = await rec.recognize(uri);
    // `blocks` conserva mejor la separación de renglones que el texto plano;
    // se usan los dos porque distintas versiones devuelven una u otra cosa.
    const porBloques = (r?.blocks || [])
      .flatMap((b) => (b.lines || []).map((l) => l.text) || [b.text])
      .filter(Boolean)
      .join('\n');
    const encontrado = extraerLineas(porBloques) || extraerLineas(r?.text || '');
    if (!encontrado) return { ok: false, motivo: 'no-encontrada' };

    // Se leyeron las líneas pero salen cortadas: hay que alejar el teléfono.
    if (encontrado.cortadas) {
      return { ok: false, motivo: 'cortadas', visto: encontrado.visto };
    }

    const { formato } = encontrado;
    // Las cifras que caigan en la línea del nombre son errores de lectura
    // seguros: ahí la norma no admite dígitos.
    const lineas = arreglarNombres(encontrado.lineas, formato);
    const yaCuadra = cuadranDigitos(lineas, formato);
    if (yaCuadra.bien === yaCuadra.total) {
      return { ok: true, mrz: lineas.join('\n'), formato, corregida: false };
    }

    const arregladas = corregirConDigitos(lineas, formato);
    if (arregladas) {
      return { ok: true, mrz: arregladas.join('\n'), formato, corregida: true };
    }

    // Se leyó algo con forma de MRZ pero los dígitos no cuadran ni corrigiendo.
    // Se devuelve igual, marcado, para que la persona lo revise en el cuadro de
    // texto en vez de tener que teclearlo entero desde cero.
    return {
      ok: false, motivo: 'digitos', mrz: lineas.join('\n'), formato,
      cuadran: yaCuadra,
    };
  } catch (e) {
    // Un fallo de enlazado no es «no se pudo leer»: es «aquí no hay lector».
    // Se distingue porque la pantalla dice cosas distintas — repetir la foto
    // frente a escribirlo a mano.
    if (sinEnlace(e)) return { ok: false, motivo: 'sin-lector' };
    return { ok: false, motivo: 'error' };
  }
}

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

const CARGA = { modulo: null, intentado: false };

/**
 * ML Kit se carga a la primera y en un try: si el binario no lo trae —Expo Go,
 * o un APK viejo— la pantalla tiene que seguir funcionando a mano en vez de
 * reventar al abrirse.
 */
function reconocedor() {
  if (!CARGA.intentado) {
    CARGA.intentado = true;
    try {
      const m = require('@react-native-ml-kit/text-recognition');
      CARGA.modulo = m?.default || m;
    } catch (e) {
      CARGA.modulo = null;
    }
  }
  return CARGA.modulo;
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
    return '';
  }
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

    const { formato, lineas } = encontrado;
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
    return { ok: false, motivo: 'error' };
  }
}

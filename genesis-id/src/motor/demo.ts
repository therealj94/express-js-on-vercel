/**
 * El recorrido de demostración: cómo se ve un Genesis ID y cómo llega la
 * información, sin tocar una sola identidad de verdad.
 *
 * ── PARA QUE ────────────────────────────────────────────────────────────────
 *
 * Enseñar el producto obliga hoy a una de dos cosas malas: abrir el expediente
 * de una persona real delante de quien mira, o describirlo con palabras. Lo
 * primero es enseñar el documento y la cara de alguien que no dio permiso para
 * eso; lo segundo no convence a nadie.
 *
 * Esto es la tercera: el camino entero con una persona que no existe.
 *
 * ── LO QUE ENSEÑA, Y POR QUE ESOS PASOS ─────────────────────────────────────
 *
 * Los siete estados por los que pasa una identidad de verdad, en el mismo orden
 * y con los mismos nombres que usa el motor (`EstadoIdentidad` en types.ts):
 *
 *   iniciada → datos → documento → biometria → en-revision → verificada
 *
 * y las dos salidas que no son la buena: `rechazada` y `suspendida`. Una demo
 * que solo enseña el camino feliz vende algo que no existe — lo que decide si
 * un sistema de cumplimiento sirve es qué hace cuando algo NO cuadra.
 *
 * ── LO QUE NO HACE, Y ES LO MAS IMPORTANTE ──────────────────────────────────
 *
 * No escribe nada. No crea identidades, no toca el almacén, no entra en la
 * bitácora y no cuenta para la analítica. Es una función pura que devuelve un
 * guion; llamarla mil veces deja el sistema exactamente igual.
 *
 * Eso no es prolijidad: una demo que crea registros de mentira ensucia las
 * cifras de cumplimiento, y unas cifras de cumplimiento con basura dentro no
 * valen para lo único que valen, que es responderle a un auditor.
 *
 * Y todo lo inventado va MARCADO. Los correos son `@ejemplo.invalid` —un
 * dominio que por norma no puede existir (RFC 2606)— y el número de documento
 * es imposible a propósito. Si algún dato de esta demo apareciera en una
 * pantalla de verdad, se reconoce al instante.
 */

export type PasoDemo = {
  estado: string
  titulo: string
  queHizoLaPersona: string
  queRecibeGenesis: string
  queVeElOperador: string
  /* Los segundos que suele tardar ESE paso en la vida real. Sin esto, una demo
     hace pensar que todo el trámite es instantáneo, y la primera pregunta que
     hace cualquiera es cuánto tarda. */
  duracionTipica: string
  automatico: boolean
}

export const PERSONA_DEMO = {
  nombreDeclarado: 'Ana María Ejemplo Muestra',
  email: 'ana.ejemplo@ejemplo.invalid',
  nacionalidad: 'HN',
  fechaNacimiento: '1991-04-17',
  documento: {
    tipo: 'Documento nacional de identificación',
    numero: '0000-0000-00000',      // imposible a propósito
    emisor: 'Honduras',
    vence: '2031-04-17',
  },
  gid: 'OG-DEMO01',
}

export const PASOS: PasoDemo[] = [
  {
    estado: 'iniciada',
    titulo: 'Abre su cuenta',
    queHizoLaPersona: 'Entró a Veta Wallet con su correo. Todavía no dio ningún dato.',
    queRecibeGenesis: 'El correo y qué app la manda. Nada más.',
    queVeElOperador: 'Una fila nueva en la cola, sin nombre todavía.',
    duracionTipica: 'inmediato',
    automatico: true,
  },
  {
    estado: 'datos',
    titulo: 'Declara quién dice ser',
    queHizoLaPersona: 'Escribió su nombre completo, su fecha de nacimiento y su país.',
    queRecibeGenesis: 'Nombre declarado, fecha de nacimiento y nacionalidad. Se tamiza '
      + 'contra las listas de sanciones y de personas expuestas ANTES de pedirle el documento.',
    queVeElOperador: 'El nombre, y si el tamizado devolvió alguna coincidencia.',
    duracionTipica: 'menos de un segundo',
    automatico: true,
  },
  {
    estado: 'documento',
    titulo: 'Sube su documento',
    queHizoLaPersona: 'Fotografió el anverso y el reverso de su identificación.',
    queRecibeGenesis: 'Las dos imágenes, cifradas. Se lee el documento, se comprueba que '
      + 'no esté vencido, que el nombre cuadre con lo declarado, y que la foto sea de un '
      + 'documento y no de una pantalla.',
    queVeElOperador: 'Las imágenes, lo leído del documento, y cada comprobación con su '
      + 'resultado — incluidas las que fallaron.',
    duracionTipica: 'de dos a cinco segundos',
    automatico: true,
  },
  {
    estado: 'biometria',
    titulo: 'Se hace la prueba de vida',
    queHizoLaPersona: 'Movió la cara siguiendo lo que le pidió la pantalla.',
    queRecibeGenesis: 'Varios fotogramas. Se comprueba que hay una persona viva delante '
      + '—no una foto ni un video— y que esa cara es la del documento.',
    queVeElOperador: 'El retrato, el porcentaje de parecido con el documento, y si la '
      + 'prueba de vida pasó.',
    duracionTipica: 'de tres a diez segundos',
    automatico: true,
  },
  {
    estado: 'en-revision',
    titulo: 'Espera a una persona',
    queHizoLaPersona: 'Nada. Ya terminó su parte.',
    queRecibeGenesis: 'El expediente entero, listo para que alguien lo mire.',
    queVeElOperador: 'La ficha completa: documento, retrato, comprobaciones, nivel de '
      + 'riesgo y coincidencias en listas. Y los dos botones que deciden.',
    duracionTipica: 'lo que tarde el equipo de cumplimiento',
    automatico: false,
  },
  {
    estado: 'verificada',
    titulo: 'Queda verificada',
    queHizoLaPersona: 'Nada. Recibe su Genesis ID.',
    queRecibeGenesis: 'La decisión de un operador, con su nombre, firmada en la bitácora.',
    queVeElOperador: 'La identidad con su GID emitido, y el asiento en la bitácora que '
      + 'dice quién la aprobó y cuándo.',
    duracionTipica: 'inmediato al aprobar',
    automatico: false,
  },
]

export const SALIDAS_QUE_NO_SON_LA_BUENA = [
  {
    estado: 'rechazada',
    titulo: 'Rechazada',
    porQuePasa: 'El documento no cuadra con lo declarado, está vencido, la cara no coincide, '
      + 'o la prueba de vida no pasó. La persona puede volver a intentarlo.',
    queQueda: 'El motivo, escrito, y el asiento en la bitácora con quién decidió.',
  },
  {
    estado: 'suspendida',
    titulo: 'Suspendida',
    porQuePasa: 'Estaba verificada y algo cambió después: apareció en una lista de '
      + 'sanciones, o un caso de monitoreo lo pidió.',
    queQueda: 'Deja de valer para entrar a las apps del ecosistema, y queda el motivo.',
  },
]

/** El guion entero. Función PURA: no lee ni escribe el almacén. */
export function recorrido() {
  return {
    aviso: 'DEMOSTRACION. Nada de esto es una persona real ni se guarda en ningún sitio. '
      + 'El correo usa el dominio ejemplo.invalid, que por norma no puede existir.',
    persona: PERSONA_DEMO,
    pasos: PASOS,
    salidas: SALIDAS_QUE_NO_SON_LA_BUENA,
    /* Lo que la app que la manda recibe de vuelta cuando ya está verificada.
       Es la mitad que nadie enseña —se enseña el trámite y no el resultado— y
       es justo lo que le importa a quien va a integrar. */
    loQueRecibeLaApp: {
      gid: PERSONA_DEMO.gid,
      verificada: true,
      nivel: 'completo',
      riesgo: 'bajo',
      pep: false,
      nacionalidad: PERSONA_DEMO.nacionalidad,
      /* Y lo que NO recibe, dicho con todas las letras: una app del ecosistema
         nunca ve el documento ni el retrato, tenga la clave que tenga. */
      noRecibe: ['el documento', 'el retrato', 'la fecha de nacimiento', 'el número de identificación'],
    },
  }
}

/* El guion de Genesis Core.
 *
 * ══ CADA LÍNEA TRAE SU GRABACIÓN ═══════════════════════════════════════════
 *
 * `audio` es el fichero del banco de voz de la casa —Piper, rendido en
 * nuestras máquinas— y `texto` es exactamente lo que dice ese fichero. Los dos
 * se sacaron a la vez del mismo sitio: se cargó el cerebro grande en un
 * navegador de verdad, se le preguntó por cada frase con su propia función
 * `conVoz()`, y se anotó el fichero que devolvió. No se copió el texto a un
 * lado y el nombre del fichero al otro.
 *
 * Los diez ficheros se comprobaron uno a uno contra
 * `cerebro.ordenscan.com/voz/`: los diez responden.
 *
 * SI SE TOCA UN `texto`, HAY QUE QUITAR SU `audio`. Un audio que diga algo
 * distinto del subtítulo es peor que no tener audio: el subtítulo se lee y la
 * voz dice otra cosa, y quien mira se da cuenta antes que quien presenta.
 * Sin `audio`, la frase la dice la voz del aparato — que suena peor, pero
 * dice lo que pone.
 *
 * ══ POR QUÉ ESTE GUION Y NO OTRO ═══════════════════════════════════════════
 *
 * Son frases que ya existían grabadas y que hablan del ECOSISTEMA ENTERO, que
 * es lo que esta pantalla enseña. No se inventaron frases nuevas para la
 * ocasión: una frase nueva no está grabada, y una presentación que alterna
 * voz grabada y voz de navegador se oye — ese corte es exactamente lo que en
 * su día se describió como «se vuelve robótico».
 */

export const PRESENTACION = [
  { audio: 'f517d89c.mp3',
    texto: 'Orden Global son dos cadenas, cinco servicios, diez máquinas y unos cuantos miles de cosas que pueden salir mal a las tres de la mañana. Yo soy el cerebro que las vigila.' },
  { audio: '60e2486a.mp3',
    texto: 'Orden Global es infraestructura financiera propia para América Latina: cadena, billetera, identidad verificada, pasarela de cobro y tarjeta.' },
  { audio: 'dacee7bd.mp3',
    texto: 'No es una aplicación sobre la cadena de otro. La capa base es nuestra, y por eso el coste, las reglas y el ritmo los ponemos nosotros.' },
  { audio: '2d20e163.mp3',
    texto: 'El corazón son dos cadenas: la vieja, la ocho cinco tres dos, congelada y cerrada; y la cinco cinco cinco cero, la nueva, con su génesis ya construido y juzgado.' },
  { audio: '49708189.mp3',
    texto: 'Encima viven los productos: Veta Wallet con cuatrocientos treinta y cinco usuarios, Genesis ID para la identidad, MyTokenPay para cobrar, veinticuatro tarjetas, y el explorador ordenscan.' },
  { audio: '92277b06.mp3',
    texto: 'Genesis ID es la pieza de identidad: verificación de personas, verificación de empresas, prevención de blanqueo y acceso único para todo el ecosistema.' },
  { audio: 'eed5f3eb.mp3',
    texto: 'Todo corre en diez máquinas de Amazon, y siete agentes automáticos lo revisan cada pocas horas y dejan su parte aquí.' },
  { audio: 'e8124c01.mp3',
    texto: 'Cuatrocientos treinta y cinco usuarios con saldo, veinticuatro tarjetas emitidas y ochenta y cinco contratos de token desplegados.' },
];

/* ══ LO QUE DICE AL TOCAR UNA REGIÓN ════════════════════════════════════════

   Estas frases NO están grabadas: son de esta pantalla y el banco no las
   tiene. Las dice la voz del aparato, y por eso van aparte y no dentro de la
   presentación — mezclarlas ahí metería el corte de voz en mitad del guion.

   Para grabarlas hace falta pasar Piper con los modelos (61 MB, no van en el
   repositorio) y desplegar el banco otra vez. Hasta entonces suenan con la
   voz del teléfono, que dice lo que pone.

   El recuento de piezas NO está escrito aquí: lo pone `cerebro-3d.js` con lo
   que hay en el mapa cuando la frase se arma. Escribirlo a mano sería una
   cifra que envejece en cuanto alguien añade una pieza. */
export const REGIONES = {
  cadena:    'La cadena es el registro propio: las reglas y el precio del gas los ponemos nosotros.',
  nodo:      'Los nodos son las máquinas que sostienen la cadena y firman los bloques.',
  token:     'Los tokens son lo que circula: el ORIGEN de la cadena y los contratos desplegados encima.',
  app:       'Las apps y las webs son la cara del ecosistema: por ahí entra y sale la gente.',
  backend:   'Los servidores son lo que responde detrás de cada app cuando alguien toca un botón.',
  identidad: 'Identidad es Genesis ID: verificación de personas y de empresas, y acceso único a todo.',
  infra:     'La infraestructura son las máquinas, las regiones y las direcciones fijas de la red.',
  dominio:   'Los dominios son las puertas públicas: cada nombre lleva a una pieza del ecosistema.',
  seguridad: 'Seguridad es lo que vigila las llaves, los permisos y lo que queda expuesto.',
  abierto:   'Sin resolver es lo que está identificado y todavía no está hecho. Se enseña, no se esconde.',
  decision:  'Tu decisión son las cosas que esperan una firma. Ninguna se toma sola.',
  agente:    'El equipo de agentes revisa cadenas, dinero, seguridad y coste, y deja su parte escrita.',
  repo:      'El código es el repositorio: lo que está escrito es lo que corre.',
};

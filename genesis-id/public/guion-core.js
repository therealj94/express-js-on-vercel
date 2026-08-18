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
 * Los ficheros se comprobaron uno a uno contra `cerebro.ordenscan.com/voz/`.
 *
 * SI SE TOCA UN `texto`, HAY QUE QUITAR SU `audio`. Un audio que diga algo
 * distinto del subtítulo es peor que no tener audio: el subtítulo se lee y la
 * voz dice otra cosa, y quien mira se da cuenta antes que quien presenta.
 * Sin `audio`, la frase la dice la voz del aparato — que suena peor, pero
 * dice lo que pone.
 *
 * ══ POR QUÉ ESTOS TEMAS ════════════════════════════════════════════════════
 *
 * Son las siete cosas por las que pregunta alguien que ve esto por primera
 * vez, y cada una está armada SOLO con frases ya grabadas. No se inventaron
 * frases nuevas para redondear un tema: una frase nueva no está grabada, y
 * una presentación que alterna voz de estudio y voz de navegador se oye — ese
 * corte es exactamente lo que en su día se describió como «se vuelve
 * robótico».
 *
 * Donde un tema queda corto, queda corto. Es preferible a rellenarlo.
 */

const F = (audio, texto) => ({ audio, texto });

export const TEMAS = [
  {
    id: 'todo',
    rot: 'El ecosistema',
    sub: 'qué es Orden Global, en dos minutos',
    lineas: [
      F('f517d89c.mp3', 'Orden Global son dos cadenas, cinco servicios, diez máquinas y unos cuantos miles de cosas que pueden salir mal a las tres de la mañana. Yo soy el cerebro que las vigila.'),
      F('60e2486a.mp3', 'Orden Global es infraestructura financiera propia para América Latina: cadena, billetera, identidad verificada, pasarela de cobro y tarjeta.'),
      F('dacee7bd.mp3', 'No es una aplicación sobre la cadena de otro. La capa base es nuestra, y por eso el coste, las reglas y el ritmo los ponemos nosotros.'),
      F('2d20e163.mp3', 'El corazón son dos cadenas: la vieja, la ocho cinco tres dos, congelada y cerrada; y la cinco cinco cinco cero, la nueva, con su génesis ya construido y juzgado.'),
      F('49708189.mp3', 'Encima viven los productos: Veta Wallet con cuatrocientos treinta y cinco usuarios, Genesis ID para la identidad, MyTokenPay para cobrar, veinticuatro tarjetas, y el explorador ordenscan.'),
      F('eed5f3eb.mp3', 'Todo corre en diez máquinas de Amazon, y siete agentes automáticos lo revisan cada pocas horas y dejan su parte aquí.'),
      F('e8124c01.mp3', 'Cuatrocientos treinta y cinco usuarios con saldo, veinticuatro tarjetas emitidas y ochenta y cinco contratos de token desplegados.'),
    ],
  },
  {
    id: 'cadenas',
    rot: 'Las cadenas',
    sub: 'la vieja, la de pruebas y la nueva',
    lineas: [
      F('41c50988.mp3', 'Orden Global es una cadena de capa uno. Eso quiere decir que la capa base es nuestra: el registro, las reglas y el precio del gas los ponemos nosotros, no los alquilamos.'),
      F('c0ec365e.mp3', 'Hay tres cadenas en juego. La ocho cinco tres dos es la vieja, congelada. La cinco cinco tres cuatro es la red de pruebas, viva. Y la cinco cinco cinco cero es la que la reemplaza.'),
      F('5beffdea.mp3', 'Cuatro millones ciento ochenta mil bloques de historia, dos años y un mes de cadena sin parar desde julio de dos mil veinticuatro.'),
      F('3a0c3db8.mp3', 'El génesis de la nueva ya está construido y comprobado contra la vieja con cero diferencias: trescientas treinta y una cuentas, ciento setenta y dos contratos y mil trescientas setenta y cinco ranuras de memoria. Cada saldo, exacto.'),
      F('01b5d018.mp3', 'Los nodos uno a seis, grandes, llevan la cadena vieja. Y dentro de los nodos tres a seis viven además los cuatro validadores de la red de pruebas: dos cadenas en la misma máquina.'),
    ],
  },
  {
    id: 'dinero',
    rot: 'El dinero',
    sub: 'ORIGEN, el tesoro y la comisión',
    lineas: [
      F('4fd6e5d8.mp3', 'El ORIGEN es la moneda de la cadena. La emisión total es de un billón, exacta, escrita en el bloque cero.'),
      F('91517a22.mp3', 'Y el respaldo: la fórmula del oro. Un ORIGEN es el gramo de oro entre cincuenta y cinco.'),
      F('aedf1e90.mp3', 'El tesoro guarda casi doscientos cincuenta mil millones de ORIGEN y no se mueve sin instrucción escrita de la Junta.'),
      F('2295ab55.mp3', 'La comisión prevista es de una milésima de ORIGEN por transacción, pero hoy no está configurada: cobra cero. Y no se enciende hasta decidir su destino, porque la dirección puesta no es la billetera única.'),
      F('7de650f0.mp3', 'Entra con dinero corriente --tarjeta o transferencia-- o con criptomoneda; hoy la puerta cripto es un depósito de USDT en la red Polygon. El backend lo convierte a ORIGEN al precio del oro del día.'),
      F('110b6ef2.mp3', 'Dentro, la billetera firma contra el nodo: envíos, canjes y pagos con MyTokenPay.'),
    ],
  },
  {
    id: 'mina',
    rot: 'La minería',
    sub: 'INDEXSA y el respaldo que se está construyendo',
    lineas: [
      F('59af8586.mp3', 'El brazo minero existe por una razón muy concreta: para que el respaldo del ORIGEN sea oro de verdad y no una promesa.'),
      F('c7c77cba.mp3', 'Orden Global tiene el sesenta por ciento de INDEXSA, una minera junior hondureña. Y lo que se compró ahí no es una mina: es una base de datos geológica de la que salen prospectos nuevos, que es lo que de verdad escasea.'),
      F('cafba704.mp3', 'Del portafolio hay tres proyectos ancla: Pantaleona, Buena Vista Monarka y Travesía. Entre los tres, un potencial mínimo cercano a dos millones y medio de onzas de oro.'),
      F('d6c37c94.mp3', 'Con esa base, INDEXSA midió ciento treinta y ocho vetas en la zona sur de Honduras, con un potencial de campo de treinta y cuatro millones de onzas.'),
      F('fa1a2af6.mp3', 'La segunda vía es más simple que la minería: comprar oro en el mercado y dejarlo en custodia. Las dos construyen la misma reserva.'),
    ],
  },
  {
    id: 'legal',
    rot: 'Lo legal',
    sub: 'lo que está hecho y lo que está abierto',
    lineas: [
      F('46f65e80.mp3', 'La parte de cumplimiento que está construida y funcionando es la identidad: Genesis ID verifica personas y empresas, con prevención de blanqueo y acceso único. Sin eso no hay conversación regulatoria posible, y está hecho.'),
      F('92277b06.mp3', 'Genesis ID es la pieza de identidad: verificación de personas, verificación de empresas, prevención de blanqueo y acceso único para todo el ecosistema.'),
      F('65b70027.mp3', 'La parte que está abierta es el encuadre jurídico: qué figura tiene el token en cada país, qué licencia hace falta para la pasarela y para la tarjeta, y bajo qué sociedad se emite.'),
      F('b616b55c.mp3', 'Lo que NO está cerrado es la figura jurídica del respaldo: quién custodia, bajo qué contrato, con qué auditoría y con qué derecho de canje. Eso está en manos de la Junta y del área legal, y hasta que no esté firmado yo no voy a decirte que la moneda está respaldada en oro.'),
      F('a20cd1d6.mp3', 'No hay una auditoría externa de contratos publicada. Te lo digo tal cual, porque es lo primero que verificaría cualquiera.'),
    ],
  },
  {
    id: 'infra',
    rot: 'La máquina',
    sub: 'dónde corre, qué cuesta y quién lo vigila',
    lineas: [
      F('9b40c6ea.mp3', 'El coste de operar esto es infraestructura, y está medido: diez máquinas de Amazon en dos regiones y cinco servicios en Heroku.'),
      F('89e91d85.mp3', 'Diez máquinas en Amazon, en dos regiones.'),
      F('7054533e.mp3', 'Tres máquinas pequeñas sirven el erre pe ce de pruebas; la segunda aloja también este cerebro y los bots.'),
      F('a97f7ecb.mp3', 'La red está repartida en diez máquinas y dos regiones de Amazon, con direcciones fijas y los nodos semilla reescritos, así que se rearma sola después de un reinicio.'),
      F('47f12f10.mp3', 'La factura ronda los quinientos veinticuatro dólares al mes; las seis máquinas viejas son cuatrocientos catorce de eso.'),
      F('c773a87f.mp3', 'Además siete agentes automáticos revisan cadenas, dinero, seguridad, despliegue y coste, y dejan su parte escrito. Si algo está mal, lo dicen sin adornarlo, y eso lo puedes ver aquí mismo.'),
    ],
  },
  {
    id: 'seguridad',
    rot: 'Seguridad',
    sub: 'lo que se encontró y lo que se arregló',
    lineas: [
      F('d0966227.mp3', 'Y hay cosas encontradas y arregladas, que es la prueba de que la revisión sirve: claves de sesión demasiado cortas, un endpoint que emitía identidad sin autenticación y un doble cobro en la billetera. Puedo enseñarte la lista.'),
      F('34244891.mp3', 'De lo encontrado y arreglado: las semillas y llaves privadas se cifraban con una contraseña de siete caracteres, y las sesiones de la billetera se firmaban con otra igual de corta. Las dos están corregidas.'),
      F('f3a1a710.mp3', 'Hay un agente dedicado solo a esto: lleva la cuenta, busca lo que se paga sin usar y sigue el plan de retirada de las máquinas de la cadena vieja. Su parte tiene la cifra del día, y te lo puedo leer entero.'),
    ],
  },
];

/** El tema por omisión: el que suena al pulsar PRESENTAR sin elegir nada. */
export const PRESENTACION = TEMAS[0].lineas;

/* ══ LO QUE DICE AL TOCAR UNA REGIÓN ════════════════════════════════════════

   Estas frases NO están grabadas: son de esta pantalla y el banco no las
   tiene. Las dice la voz del aparato, y por eso van aparte y no dentro de un
   tema — mezclarlas ahí metería el corte de voz en mitad del guion.

   Para grabarlas hace falta pasar Piper con los modelos (61 MB, no van en el
   repositorio) y desplegar el banco otra vez.

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
  legal:     'Legal es la sociedad, las licencias, la figura de los tokens y los contratos. Aquí está lo hecho y lo que falta, sin maquillar.',
  mina:      'Minería es INDEXSA y su portafolio: el respaldo del ORIGEN construyéndose con oro de verdad.',
  junta:     'La Junta es lo que espera una firma. Ninguna de estas se decide sola.',
};

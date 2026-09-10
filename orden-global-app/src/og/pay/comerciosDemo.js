// El directorio de comercios de MyTokenPay: UN SOLO sitio donde vive.
//
// Estos treinta comercios salen de mobile/src/lib/mockData.ts del
// mytokenpay-app, que su propia app sirve porque lib/api.ts declara
// USE_MOCK_API = true ("Simulated backend: lets the app run fully offline").
// O sea: MyTokenPay todavia NO tiene directorio real enchufado y estos
// negocios son SUS datos de ejemplo, copiados tal cual.
//
// POR QUÉ ESTE FICHERO EXISTE
// Al portar la ficha pública (NegocioDetalle) hacían falta exactamente los
// mismos comercios que ya pintaba ExplorarPay. Tener dos copias significaba
// que un día la ficha y el listado dirían cosas distintas del mismo negocio.
// Así que la lista se mudó aquí y ExplorarPay la importa: esa pantalla no
// cambió ni una línea de comportamiento, solo dejó de ser la dueña del dato.
// Toda pantalla que enseñe estos comercios TIENE que decir que son de
// ejemplo — presentarlos como negocios reales sería mentirle a quien busca
// dónde gastar su ORIGEN.

// Las etiquetas DERIVAN del catálogo único (./catalogo.js): antes este
// fichero llevaba su propia copia de categorías, países y ciudades, casi
// igual pero no igual a la de MiNegocio ('supermercados' y 'servicios' se
// podían elegir en el alta y no existían aquí). Derivar en vez de copiar
// garantiza que toda categoría del alta existe también en el directorio, y
// que el mismo comercio se etiqueta igual en todas las pantallas. La forma
// pública de CATS/PAISES/CIUDADES no cambió: nadie más tuvo que tocarse.
import { RUBROS, PAISES as PAISES_CATALOGO } from './catalogo';

export const CATS = RUBROS.reduce((a, r) => { a[r.slug] = { es: r.es, en: r.en }; return a; }, {});

export const PAISES = PAISES_CATALOGO.reduce((a, p) => {
  a[p.slug] = { et: p.label, bandera: p.bandera };
  return a;
}, {});

export const CIUDADES = PAISES_CATALOGO.reduce((a, p) => {
  for (const c of p.ciudades) a[c.slug] = c.label;
  return a;
}, {});

// El set de iconos de la casa es SVG propio y corto a propósito (ver
// src/icons.js: los iconos por fuente dejaban la pantalla en blanco cuando
// la fuente no cargaba). No hay un glifo por categoría, así que se reparte
// lo que hay y el resto cae en la tienda: la categoría se lee igual, escrita.
export const ICONO = {
  turismo: 'airplane', tecnologia: 'construct', salud: 'heart',
  educacion: 'document-text', 'vida-nocturna': 'star', gimnasios: 'pulse',
  belleza: 'star', automotriz: 'construct',
};
export const iconoDe = (cat) => ICONO[cat] || 'storefront';

// Los treinta comercios de ejemplo de mytokenpay-app (mockData.ts), tal cual.
export const COMERCIOS = [
  { id: 'mtp-hn-1', nom: 'Origen Coffee Lab', cat: 'cafeterias', pais: 'honduras', ciudad: 'tegucigalpa', ver: true,
    dir: 'Col. Palmira, Av. República de Chile',
    desc: 'Café de especialidad hondureño, tostado propio y ambiente para trabajar. Aceptamos ORIGEN en barra y para llevar.',
    serv: ['Café de especialidad', 'Repostería', 'Espacio de coworking'] },
  { id: 'mtp-hn-2', nom: 'Fuego Norte Parrilla', cat: 'restaurantes', pais: 'honduras', ciudad: 'san-pedro-sula', ver: true,
    dir: 'Blvd. Morazán, frente a Multiplaza',
    desc: 'Carnes a la parrilla y cocina hondureña contemporánea. Facturación automática en lempiras al pagar con ORIGEN.',
    serv: ['Carnes a la parrilla', 'Reservaciones', 'Eventos privados'] },
  { id: 'mtp-hn-3', nom: 'Roatán Dive & Stay', cat: 'hoteles', pais: 'honduras', ciudad: 'roatan', ver: true,
    dir: 'West Bay Beach Road',
    desc: 'Boutique hotel frente al mar con centro de buceo propio. Liquidación en ORIGEN o USDK disponible.',
    serv: ['Habitaciones frente al mar', 'Buceo certificado PADI', 'Traslados'] },
  { id: 'mtp-hn-4', nom: 'Catracho Fit Club', cat: 'gimnasios', pais: 'honduras', ciudad: 'tegucigalpa', ver: false,
    dir: 'Col. Lomas del Guijarro, Blvd. Suyapa',
    desc: 'Gimnasio funcional con clases de crossfit y entrenamiento personalizado.',
    serv: ['Membresías mensuales', 'Crossfit', 'Entrenamiento personal'] },
  { id: 'mtp-hn-5', nom: 'La Ceiba Beauty Studio', cat: 'belleza', pais: 'honduras', ciudad: 'la-ceiba', ver: true,
    dir: 'Av. San Isidro, Barrio El Iman',
    desc: 'Salón de belleza y spa con tratamientos capilares y faciales.',
    serv: ['Peinados y color', 'Tratamientos faciales', 'Uñas'] },
  { id: 'mtp-gt-1', nom: 'Pulso Fitness Club', cat: 'gimnasios', pais: 'guatemala', ciudad: 'ciudad-de-guatemala', ver: true,
    dir: 'Zona 10, Av. Las Américas',
    desc: 'Gimnasio full equipment con clases grupales todos los días. Membresías mensuales pagables en ORIGEN.',
    serv: ['Membresías', 'Entrenamiento personal', 'Clases grupales'] },
  { id: 'mtp-gt-2', nom: 'Antigua Colonial Suites', cat: 'hoteles', pais: 'guatemala', ciudad: 'antigua', ver: false,
    dir: '5a Avenida Norte, Casco Histórico',
    desc: 'Hotel boutique en una casona colonial restaurada, a media cuadra del parque central.',
    serv: ['Suites coloniales', 'Desayuno incluido', 'Tours culturales'] },
  { id: 'mtp-gt-3', nom: 'Xela Beauty Bar', cat: 'belleza', pais: 'guatemala', ciudad: 'quetzaltenango', ver: true,
    dir: 'Zona 1, Pasaje Enríquez',
    desc: 'Spa urbano y salón de belleza con tratamientos faciales y corporales.',
    serv: ['Manicure y pedicure', 'Tratamientos faciales', 'Masajes'] },
  { id: 'mtp-gt-4', nom: 'Chapín Tech Store', cat: 'tecnologia', pais: 'guatemala', ciudad: 'ciudad-de-guatemala', ver: true,
    dir: 'Zona 4, Cuatro Grados Norte',
    desc: 'Tienda de dispositivos electrónicos, accesorios y reparaciones express.',
    serv: ['Venta de celulares', 'Reparaciones', 'Accesorios'] },
  { id: 'mtp-gt-5', nom: 'Ruta Maya Tours', cat: 'turismo', pais: 'guatemala', ciudad: 'antigua', ver: true,
    dir: 'Calle del Arco, Antigua',
    desc: 'Tours guiados a volcanes, mercados locales y sitios arqueológicos mayas.',
    serv: ['Tour al volcán Acatenango', 'Tours culturales', 'Transporte privado'] },
  { id: 'mtp-sv-1', nom: 'Volcán Rooftop Lounge', cat: 'vida-nocturna', pais: 'el-salvador', ciudad: 'san-salvador', ver: true,
    dir: 'Zona Rosa, Torre Futura',
    desc: 'Rooftop bar con vista a la ciudad, coctelería de autor y DJ en vivo los fines de semana.',
    serv: ['Coctelería de autor', 'Música en vivo', 'Reservación de mesas VIP'] },
  { id: 'mtp-sv-2', nom: 'Mercadito Surf Shop', cat: 'moda', pais: 'el-salvador', ciudad: 'la-libertad', ver: false,
    dir: 'Calle Principal, El Tunco',
    desc: 'Tienda de ropa y tablas de surf de marcas locales, frente a la playa.',
    serv: ['Ropa de playa', 'Tablas de surf', 'Renta de equipo'] },
  { id: 'mtp-sv-3', nom: 'Nómada Coworking & Café', cat: 'cafeterias', pais: 'el-salvador', ciudad: 'santa-ana', ver: true,
    dir: 'Av. Independencia Sur',
    desc: 'Espacio de coworking con café de especialidad y salas de reunión por hora.',
    serv: ['Espacios de trabajo', 'Café y snacks', 'Salas de reunión'] },
  { id: 'mtp-sv-4', nom: 'Pupusería Doña Chayo', cat: 'restaurantes', pais: 'el-salvador', ciudad: 'san-salvador', ver: true,
    dir: 'Colonia Escalón, 71 Av. Norte',
    desc: 'Pupusas tradicionales salvadoreñas hechas al momento, con curtido casero.',
    serv: ['Pupusas revueltas', 'Curtido casero', 'Para llevar'] },
  { id: 'mtp-sv-5', nom: 'Clínica Bienestar SV', cat: 'salud', pais: 'el-salvador', ciudad: 'santa-ana', ver: true,
    dir: 'Av. Independencia Norte',
    desc: 'Clínica de medicina general y consultas de bienestar integral.',
    serv: ['Consulta general', 'Chequeos preventivos', 'Laboratorio clínico'] },
  { id: 'mtp-ni-1', nom: 'Granada Lakeside Hostal', cat: 'hoteles', pais: 'nicaragua', ciudad: 'granada', ver: true,
    dir: 'Calle La Calzada, frente al lago',
    desc: 'Hostal boutique junto al lago Cocibolca, con tours a las isletas incluidos.',
    serv: ['Habitaciones privadas y compartidas', 'Tours a isletas', 'Bar en terraza'] },
  { id: 'mtp-ni-2', nom: 'León Bike Rentals', cat: 'turismo', pais: 'nicaragua', ciudad: 'leon', ver: false,
    dir: 'Parque Central, costado sur',
    desc: 'Renta de bicicletas y tours guiados por el centro histórico de León.',
    serv: ['Renta de bicicletas', 'Tours guiados', 'Sandboard en el Cerro Negro'] },
  { id: 'mtp-ni-3', nom: 'Managua Tech Store', cat: 'tecnologia', pais: 'nicaragua', ciudad: 'managua', ver: true,
    dir: 'Metrocentro, Local 214',
    desc: 'Venta de accesorios y dispositivos electrónicos, con soporte técnico en tienda.',
    serv: ['Accesorios móviles', 'Reparaciones', 'Venta de dispositivos'] },
  { id: 'mtp-ni-4', nom: 'Café Colonial Granada', cat: 'cafeterias', pais: 'nicaragua', ciudad: 'granada', ver: true,
    dir: 'Calle Atravesada, Casco Colonial',
    desc: 'Café nicaragüense de origen, tostado local, en una casona colonial restaurada.',
    serv: ['Café de origen', 'Repostería local', 'Desayunos'] },
  { id: 'mtp-ni-5', nom: 'Academia Digital León', cat: 'educacion', pais: 'nicaragua', ciudad: 'leon', ver: true,
    dir: 'Barrio Sutiava, Calle Central',
    desc: 'Academia de cursos cortos en programación, diseño y marketing digital.',
    serv: ['Cursos de programación', 'Diseño digital', 'Marketing en redes'] },
  { id: 'mtp-cr-1', nom: 'Pura Vida Wellness Spa', cat: 'salud', pais: 'costa-rica', ciudad: 'san-jose', ver: true,
    dir: 'Escazú, Centro Comercial Momentum',
    desc: 'Centro de bienestar integral con yoga, masajes terapéuticos y nutrición.',
    serv: ['Yoga y meditación', 'Masajes terapéuticos', 'Consultas de nutrición'] },
  { id: 'mtp-cr-2', nom: 'Tamarindo Surf & Board', cat: 'turismo', pais: 'costa-rica', ciudad: 'tamarindo', ver: true,
    dir: 'Playa Tamarindo, frente al muelle',
    desc: 'Clases de surf, renta de equipo y tours de atardecer en catamarán.',
    serv: ['Clases de surf', 'Renta de tablas', 'Tours en catamarán'] },
  { id: 'mtp-cr-3', nom: 'Liberia AutoServicio Express', cat: 'automotriz', pais: 'costa-rica', ciudad: 'liberia', ver: false,
    dir: 'Carretera Interamericana Norte km 217',
    desc: 'Taller automotriz con servicio express de mantenimiento preventivo.',
    serv: ['Cambio de aceite', 'Diagnóstico computarizado', 'Llantas y frenos'] },
  { id: 'mtp-cr-4', nom: 'Soda Tica Central', cat: 'restaurantes', pais: 'costa-rica', ciudad: 'san-jose', ver: true,
    dir: 'Barrio Escalante, Calle 33',
    desc: 'Comida típica costarricense: casados, gallo pinto y batidos naturales.',
    serv: ['Casados', 'Gallo pinto', 'Batidos naturales'] },
  { id: 'mtp-cr-5', nom: 'Chepe Nightlife Bar', cat: 'vida-nocturna', pais: 'costa-rica', ciudad: 'san-jose', ver: true,
    dir: 'Barrio California, Calle 29',
    desc: 'Bar de cervezas artesanales costarricenses con música en vivo.',
    serv: ['Cervezas artesanales', 'Música en vivo', 'Tapas'] },
  { id: 'mtp-pa-1', nom: 'Casco Antiguo Rooftop', cat: 'vida-nocturna', pais: 'panama', ciudad: 'ciudad-de-panama', ver: true,
    dir: 'Casco Viejo, Calle 3ra',
    desc: 'Terraza con vista a la bahía, coctelería premium y música en vivo.',
    serv: ['Coctelería premium', 'Cenas privadas', 'Eventos corporativos'] },
  { id: 'mtp-pa-2', nom: 'Bocas Market & Convenience', cat: 'conveniencia', pais: 'panama', ciudad: 'bocas-del-toro', ver: true,
    dir: 'Calle 3ra, Isla Colón',
    desc: 'Minimarket con productos importados, snacks y esenciales para turistas y locales.',
    serv: ['Abarrotes', 'Snacks y bebidas', 'Productos importados'] },
  { id: 'mtp-pa-3', nom: 'Cevichería Casco Viejo', cat: 'restaurantes', pais: 'panama', ciudad: 'ciudad-de-panama', ver: false,
    dir: 'Casco Viejo, Av. Central',
    desc: 'Ceviches y mariscos frescos del Pacífico panameño, ambiente al aire libre.',
    serv: ['Ceviche mixto', 'Mariscos frescos', 'Reservaciones'] },
  { id: 'mtp-pa-4', nom: 'Panamá Digital Hub', cat: 'tecnologia', pais: 'panama', ciudad: 'ciudad-de-panama', ver: true,
    dir: 'Costa del Este, Torre Business Park',
    desc: 'Tienda y centro de soporte técnico para dispositivos móviles y laptops.',
    serv: ['Venta de laptops', 'Soporte técnico', 'Accesorios'] },
  { id: 'mtp-pa-5', nom: 'Bocas Beach Hostel', cat: 'hoteles', pais: 'panama', ciudad: 'bocas-del-toro', ver: true,
    dir: 'Playa Bluff, Isla Colón',
    desc: 'Hostal frente al mar con ambiente relajado, ideal para surfistas y mochileros.',
    serv: ['Dormitorios compartidos', 'Habitaciones privadas', 'Renta de tablas de surf'] },
];

// Categorías y países en el orden en que aparecen en los datos: así los
// filtros nunca ofrecen una casilla que no devuelve nada.
export const CATS_USADAS = COMERCIOS.reduce((a, c) => (a.includes(c.cat) ? a : a.concat(c.cat)), []);
export const PAISES_USADOS = COMERCIOS.reduce((a, c) => (a.includes(c.pais) ? a : a.concat(c.pais)), []);

// Sin tildes y en minúsculas: quien escribe "cafe" tiene que encontrar "Café".
// El rango \u0300-\u036f son las marcas diacriticas que deja NFD al separar
// la letra de su acento; escrito escapado para que el fichero no dependa de
// como guarde el editor esos combinantes sueltos.
export const pelado = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Buscar por id: así llegan desde la portada y desde la ficha pública
// (params { id }). Devuelve null en vez de undefined para que la pantalla
// distinga "no existe" de "todavía no lo he buscado".
export const comercioPorId = (id) => COMERCIOS.find((c) => c.id === id) || null;

// La etiqueta traducida de un diccionario { clave: { es, en } }. Si falta el
// idioma se cae al español, y si falta la clave se devuelve la clave: nunca
// un hueco en blanco en pantalla.
export const etiquetaDe = (dic, clave, lang) => (dic[clave] ? (dic[clave][lang] || dic[clave].es) : clave);

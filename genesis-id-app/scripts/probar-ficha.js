/* Renderiza DE VERDAD la ficha de identidad y comprueba que las imágenes salen.
 *
 * Existe por un fallo concreto: la pantalla pedía firmar «el rostro coincide»
 * sin enseñar ninguna cara. El servidor mandaba las tres imágenes y la app solo
 * dibujaba una, recortada. Nada de eso lo ve un parser —el archivo era JS
 * válido—, así que hace falta renderizar y mirar el árbol.
 *
 * ── POR QUÉ NO ESTÁ EN `npm run verificar` ─────────────────────────────────
 *
 * Necesita `react-test-renderer`, y meterlo como dependencia cambiaría
 * `package.json`, que SÍ entra en la huella de runtime. Con la huella cambiada
 * los updates por aire dejan de llegar a los teléfonos que ya tienen la app.
 * Así que se instala aparte, fuera del proyecto:
 *
 *     mkdir -p /tmp/rndr && cd /tmp/rndr
 *     npm i --no-save react@19.1.0 react-test-renderer@19.1.0
 *     APP=/ruta/a/genesis-id-app NODE_PATH=/tmp/rndr/node_modules \
 *       node $APP/scripts/probar-ficha.js
 *
 * En la próxima compilación de APK —cuando cambiar la huella no cueste nada—
 * se añade como devDependency y se engancha a `verificar`.
 *
 * react-native no se puede cargar fuera de un teléfono, así que se sustituye
 * por primitivas de mentira que solo anotan qué se dibujó. Es suficiente: lo
 * que se comprueba es qué elementos produce el componente y con qué props, no
 * cómo los pinta Android. */

const APP = process.env.APP || require('path').join(__dirname, '..');

const path = require('path');
const Module = require('module');

// De dónde sale el renderizador. Se resuelve ANTES de tocar nada para poder
// atar React a esa misma carpeta más abajo.
let RAIZ_RENDER;
try {
  RAIZ_RENDER = path.dirname(path.dirname(require.resolve('react-test-renderer/package.json')));
} catch (e) {
  console.error('Falta react-test-renderer. Está a propósito fuera del proyecto:\n' +
    '  mkdir -p /tmp/rndr && cd /tmp/rndr\n' +
    '  npm i --no-save react@19.1.0 react-test-renderer@19.1.0\n' +
    '  APP=' + (process.env.APP || '.') + ' NODE_PATH=/tmp/rndr/node_modules node ' + __filename +
    '\n(meterlo como dependencia cambiaría la huella de runtime y cortaría los updates por aire)');
  process.exit(2);
}

const React = require(require.resolve('react', { paths: [RAIZ_RENDER] }));
const TestRenderer = require('react-test-renderer');
const babel = require(APP + '/node_modules/@babel/core');

const APP_SRC = path.join(APP, 'src');

// ── primitivas de mentira ───────────────────────────────────────────────────
const stub = (nombre) => {
  const C = ({ children, ...props }) => React.createElement(nombre, props, children);
  C.displayName = nombre;
  return C;
};
const RN = {
  View: stub('View'), Text: stub('Text'), ScrollView: stub('ScrollView'),
  Image: stub('Image'), Pressable: stub('Pressable'), Modal: stub('Modal'),
  TextInput: stub('TextInput'), ActivityIndicator: stub('ActivityIndicator'),
  Animated: { View: stub('Animated.View'), Value: function () { this.setValue = () => {}; },
    timing: () => ({ start: (cb) => cb && cb() }), sequence: () => ({ start: (cb) => cb && cb() }) },
  StyleSheet: { create: (o) => o, flatten: (o) => o },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  Platform: { OS: 'android', select: (o) => o.android ?? o.default },
};

// react-native-svg exporta un montón de formas y no vale la pena listarlas:
// un Proxy devuelve una primitiva de mentira para cualquier nombre que pidan.
const svgFalso = new Proxy({}, {
  get: (destino, nombre) => {
    if (nombre === '__esModule') return true;
    if (nombre === 'default') return stub('Svg');
    if (typeof nombre !== 'string') return undefined;
    if (!destino[nombre]) destino[nombre] = stub(nombre);
    return destino[nombre];
  },
});

const falsos = {
  'react-native': RN,
  'react-native-svg': svgFalso,
  'react-native-safe-area-context': {
    SafeAreaProvider: stub('SafeAreaProvider'),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  },
  'expo-linear-gradient': { LinearGradient: stub('LinearGradient') },
  'expo-haptics': { impactAsync: () => {}, ImpactFeedbackStyle: { Light: 1 } },
  '@expo/vector-icons': { Ionicons: stub('Ionicons') },
  'expo-constants': { default: { expoConfig: {} } },
  'react-native-webview': { WebView: stub('WebView') },
  'expo-updates': { checkForUpdateAsync: async () => ({}), fetchUpdateAsync: async () => ({}) },
  'expo-secure-store': { getItemAsync: async () => null, setItemAsync: async () => {} },
};

const resolverOriginal = Module._resolveFilename;
Module._resolveFilename = function (pedido, ...resto) {
  if (falsos[pedido]) return 'FALSO:' + pedido;
  try { return resolverOriginal.call(this, pedido, ...resto); }
  catch (e) { return resolverOriginal.call(this, path.join(APP, 'node_modules', pedido), ...resto); }
};
const cargarOriginal = Module._load;
Module._load = function (pedido, ...resto) {
  if (falsos[pedido]) return falsos[pedido];
  /* UNA sola copia de React. Con dos —la de la app y la del renderizador— los
     hooks revientan («Invalid hook call»), porque cada copia lleva su propio
     despachador y el componente acaba preguntando por el de la copia
     equivocada.

     Se ata a la copia que usa react-test-renderer, no a la primera que
     aparezca: este guion vive DENTRO de la app, así que una resolución normal
     encontraría la de la app —la equivocada— y el fallo vuelve. */
  if (pedido === 'react' || pedido.startsWith('react/')) {
    return cargarOriginal.call(this, require.resolve(pedido, { paths: [RAIZ_RENDER] }), ...resto.slice(1));
  }
  return cargarOriginal.call(this, pedido, ...resto);
};

// react-test-renderer exige que se declare que esto es un entorno de act().
global.IS_REACT_ACT_ENVIRONMENT = true;

// JSX al vuelo
require.extensions['.js'] = function (mod, archivo) {
  const fuente = require('fs').readFileSync(archivo, 'utf8');
  if (!archivo.startsWith(APP_SRC)) return mod._compile(fuente, archivo);
  const { code } = babel.transformSync(fuente, {
    filename: archivo, presets: [require.resolve('babel-preset-expo', { paths: [APP] })],
    babelrc: false, configFile: false,
  });
  mod._compile(code, archivo);
};

// ── el expediente de prueba ─────────────────────────────────────────────────
// Imita lo que devuelve GET /panel/identidades/:id — incluidas las tres
// imágenes, una con prefijo `data:` y dos en base64 pelado, que es como llegan
// realmente según por qué almacén hayan pasado.
const PIX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const FICHA = {
  id: 'idn_prueba', gid: 'GID-HN-000123', estado: 'en-revision',
  nombreDeclarado: 'María Fernanda Pérez', nombreLegal: 'PEREZ MARIA FERNANDA',
  email: 'mf@ejemplo.hn', telefono: '+504 9999-0000',
  nacionalidad: 'HND', paisResidencia: 'HND',
  nacionalidadNombre: { codigo: 'HND', nombre: 'Honduras' },
  paisResidenciaNombre: { codigo: 'HND', nombre: 'Honduras' },
  fotoCredencial: 'data:image/png;base64,' + PIX,          // ya con prefijo
  documento: { imagenes: { anverso: PIX, reverso: PIX },   // base64 pelado
    hallazgos: [{ gravedad: 'aviso', detalle: 'La firma está borrosa' }] },
  riesgo: { nivel: 'medio', puntuacion: 42, recomendacion: 'revisar',
    factores: [{ puntos: 12, detalle: 'País de riesgo medio' }], bloqueos: [] },
  biometria: { estado: 'sin-proveedor', parecido: null },
  tamiz: { coincidencias: [] }, vinculos: [], volumenEsperadoUsd: 5000,
  pepDeclarado: false,
};

// La API se sustituye para no salir a la red.
const rutaApi = require.resolve(path.join(APP_SRC, 'api.js'));
require(rutaApi);
require.cache[rutaApi].exports.identidad = async () => ({ identidad: FICHA });

const { FichaIdentidad } = require(path.join(APP_SRC, 'screens', 'FichaIdentidad.js'));
const { ToastCtx } = require(path.join(APP_SRC, 'ui.js'));

(async () => {
  let arbol;
  await TestRenderer.act(async () => {
    arbol = TestRenderer.create(
      React.createElement(ToastCtx.Provider, { value: () => {} },
        React.createElement(FichaIdentidad, {
          id: 'idn_prueba', volver: () => {},
          operador: { rol: 'cumplimiento', permisos: ['*'] },
        })));
  });
  await TestRenderer.act(async () => {});

  const raiz = arbol.root;
  const fallos = [];
  const ok = (c, m) => { if (!c) fallos.push(m); else console.log('  ✓ ' + m); };

  const textos = raiz.findAllByType('Text')
    .map((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
      .filter((x) => typeof x === 'string').join(''))
    .filter(Boolean);
  const imgs = raiz.findAllByType('Image');
  const uris = imgs.map((i) => i.props.source?.uri).filter(Boolean);

  console.log(`\n  imágenes dibujadas: ${imgs.length}`);
  ok(uris.length >= 3, `las 3 tomas tienen imagen (hay ${uris.length})`);
  ok(uris.every((u) => u.startsWith('data:')),
    'todas las uri llevan esquema data: (una sin esquema no carga y no avisa)');
  ok(uris.filter((u) => u.startsWith('data:image/jpeg;base64,' + PIX)).length === 2,
    'el base64 pelado se normalizó a data: en anverso y reverso');
  ok(imgs.every((i) => i.props.resizeMode !== 'cover'),
    'ninguna toma recorta con «cover» (cover le corta la cara a un retrato)');

  for (const rot of ['Rostro del documento', 'Anverso', 'Reverso'])
    ok(textos.some((t) => t.includes(rot)), `se rotula «${rot}»`);
  ok(textos.some((t) => t.includes('Honduras · HND')),
    'el país sale con nombre y código, no «HND» a secas');
  ok(textos.some((t) => t.includes('no se guarda')),
    'se dice que el selfie en vivo no se guarda');

  // El visor: se toca la primera toma y tiene que abrirse el Modal.
  ok(raiz.findAllByType('Modal').every((m) => !m.props.visible), 'el visor arranca cerrado');
  const tocable = raiz.findAllByType('Pressable').find((p) => p.props.accessibilityLabel?.startsWith('Ampliar'));
  ok(!!tocable, 'la toma es tocable y se anuncia como «Ampliar…»');
  if (tocable) {
    await TestRenderer.act(async () => { tocable.props.onPress(); });
    ok(raiz.findAllByType('Modal').some((m) => m.props.visible), 'al tocar, el visor se abre');
  }

  // Y el hueco cuando falta una imagen.
  FICHA.documento.imagenes = { anverso: null, reverso: null };
  let a2;
  await TestRenderer.act(async () => {
    a2 = TestRenderer.create(
      React.createElement(ToastCtx.Provider, { value: () => {} },
        React.createElement(FichaIdentidad, {
          id: 'idn_prueba', volver: () => {}, operador: { rol: 'cumplimiento', permisos: ['*'] },
        })));
  });
  await TestRenderer.act(async () => {});
  const t2 = a2.root.findAllByType('Text')
    .map((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
      .filter((x) => typeof x === 'string').join(''));
  // Se cuentan las IMÁGENES, no las veces que sale el texto: el Expediente
  // tiene otra línea «Anverso: no aportado» que habla de si el OCR confirmó el
  // nombre —otro dato distinto— y contarla mezclaría dos cosas.
  const imgs2 = a2.root.findAllByType('Image').filter((i) => i.props.source?.uri);
  ok(imgs2.length === 1,
    `faltando anverso y reverso solo queda una imagen, el retrato (hay ${imgs2.length})`);
  ok(t2.filter((t) => t === 'no aportado').length >= 2,
    'los dos huecos «no aportado» se dibujan en lugar de las fotos que faltan');

  if (fallos.length) {
    console.error('\n' + fallos.map((f) => '  ✗ ' + f).join('\n'));
    process.exit(1);
  }
  console.log('\nLa ficha renderiza y las tres imágenes salen.');
})().catch((e) => { console.error('\n✗ reventó:', e.stack); process.exit(1); });

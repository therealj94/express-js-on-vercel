import React from 'react';
import Svg, { Path } from 'react-native-svg';

// ============================================================
// Iconos de Veta Wallet en SVG puro.
//
// Antes se usaba @expo/vector-icons (iconos por fuente). Ese componente
// hace `Font.loadAsync` al montarse y, si la carga falla, renderiza un
// <Text /> vacío PARA SIEMPRE — por eso no se veía ningún icono en el
// teléfono. Dibujarlos con react-native-svg elimina esa dependencia:
// no hay fuentes que cargar, funcionan igual en Expo Go y en el APK,
// y el paquete pesa varios MB menos.
//
// Uso idéntico al anterior:  <Icon name="wallet" size={22} color="#C9A961" />
// ============================================================

// Círculo como path, para que todo el set sea uniforme.
const circle = (cx, cy, r) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;

// Todos los trazos están dibujados sobre una rejilla de 24×24.
const PATHS = {
  'arrow-up': ['M12 20V4', 'M5 11l7-7 7 7'],
  'arrow-down': ['M12 4v16', 'M5 13l7 7 7-7'],
  'arrow-forward': ['M4 12h15', 'M13 5l7 7-7 7'],
  'chevron-back': ['M15 4.5L8 12l7 7.5'],
  'chevron-forward': ['M9 4.5L16 12l-7 7.5'],
  'chevron-down': ['M4.5 9L12 16l7.5-7'],

  // Linterna: apagada (contorno) y encendida (con rayos de luz).
  'flashlight-outline': ['M9 3h6v4l-2 3v11h-2V10L9 7z', 'M11 13h2'],
  flashlight: ['M9 3h6v4l-2 3v11h-2V10L9 7z', 'M11 13h2', 'M5 3l2 2', 'M19 3l-2 2', 'M12 0v2'],

  wallet: [
    'M3 8.5A2.5 2.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2',
    'M3 8.5v9A2.5 2.5 0 0 0 5.5 20h13a2.5 2.5 0 0 0 2.5-2.5v-6A2.5 2.5 0 0 0 18.5 9h-13A2.5 2.5 0 0 1 3 8.5z',
    circle(17, 14.2, 1.15),
  ],
  card: ['M2.5 6.5A2 2 0 0 1 4.5 4.5h15a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z', 'M2.5 10h19', 'M6 15h4'],
  cash: [
    'M2.5 7.5A1.5 1.5 0 0 1 4 6h16a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 18H4a1.5 1.5 0 0 1-1.5-1.5z',
    circle(12, 12, 2.6),
    'M6 9.5v5', 'M18 9.5v5',
  ],

  'swap-horizontal': ['M4 8.5h15', 'M15.5 5l3.5 3.5-3.5 3.5', 'M20 15.5H5', 'M8.5 12L5 15.5 8.5 19'],
  'swap-vertical': ['M8.5 4v15', 'M5 15.5L8.5 19l3.5-3.5', 'M15.5 20V5', 'M12 8.5L15.5 5 19 8.5'],

  pulse: ['M2.5 12h4.2l2.6-6.5 4.4 13 2.6-6.5h5.2'],
  'settings-sharp': [
    circle(12, 12, 3),
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  ],

  checkmark: ['M4.5 12.5l5 5 10-11'],
  'checkmark-circle': [circle(12, 12, 9), 'M7.8 12.3l2.9 2.9 5.5-6'],
  'shield-checkmark': ['M12 2.6l7.5 3v5.9c0 4.9-3.1 8.2-7.5 9.9-4.4-1.7-7.5-5-7.5-9.9V5.6z', 'M8.7 11.9l2.4 2.4 4.4-4.8'],
  warning: ['M12 3.2L22 20H2z', 'M12 9.5v4.6', circle(12, 17.2, 0.6)],
  'information-circle': [circle(12, 12, 9), 'M12 11v6', circle(12, 7.6, 0.6)],
  time: [circle(12, 12, 9), 'M12 6.8v5.5l3.6 2.2'],

  copy: ['M8.5 8.5A2 2 0 0 1 10.5 6.5h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z', 'M16 6.5v-1a2 2 0 0 0-2-2h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h1'],
  create: ['M16.8 3.2a2.6 2.6 0 0 1 3.7 3.7L8 19.4 3 21l1.6-5z', 'M14.6 5.4l4 4'],
  refresh: ['M20.5 12a8.5 8.5 0 1 1-2.5-6', 'M20.5 3.5v5.5H15'],
  sync: ['M20.5 12a8.5 8.5 0 0 1-14.5 6', 'M3.5 12A8.5 8.5 0 0 1 18 6', 'M18 2.5V6h-3.5', 'M6 21.5V18h3.5'],

  eye: ['M2 12s3.7-6.8 10-6.8S22 12 22 12s-3.7 6.8-10 6.8S2 12 2 12z', circle(12, 12, 3)],
  'eye-off': ['M9.6 5.5A10.6 10.6 0 0 1 12 5.2c6.3 0 10 6.8 10 6.8a19 19 0 0 1-3.4 4.3', 'M6.3 7.7A18.5 18.5 0 0 0 2 12s3.7 6.8 10 6.8a10.7 10.7 0 0 0 4-.75', 'M10 10a2.8 2.8 0 0 0 4 4', 'M3 3l18 18'],
  'lock-closed': ['M4.5 11.5A1.5 1.5 0 0 1 6 10h12a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5z', 'M8 10V7a4 4 0 0 1 8 0v3'],
  key: [circle(8, 15.4, 3.4), 'M10.4 13L20 3.4', 'M17.2 6.2l2.4 2.4', 'M14.6 8.8l2.4 2.4'],
  'finger-print': [
    'M12 4.6A7.4 7.4 0 0 1 19.4 12v2.2',
    'M4.6 12A7.4 7.4 0 0 1 12 4.6',
    'M8.4 12a3.6 3.6 0 0 1 7.2 0v4.4',
    'M12 12v7',
    'M4.6 15.4V12',
    'M8.4 17.6V16',
  ],
  power: ['M12 3v9', 'M6.7 6.7a7.5 7.5 0 1 0 10.6 0'],

  'qr-code': [
    'M3.5 3.5h6.5v6.5H3.5z', 'M14 3.5h6.5v6.5H14z', 'M3.5 14h6.5v6.5H3.5z',
    'M14 14h2.8v2.8H14z', 'M17.7 17.7h2.8v2.8h-2.8z', 'M14 20.5h1.4', 'M20.5 14h-1.4',
  ],
  storefront: ['M3.5 9.5h17v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z', 'M3.5 9.5L5.4 4h13.2l1.9 5.5', 'M9.5 20.5V15h5v5.5'],
  globe: [circle(12, 12, 9), 'M3 12h18', 'M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18'],
  link: ['M10.2 13.8a4.6 4.6 0 0 0 6.8 0l2.6-2.6a4.6 4.6 0 0 0-6.5-6.5l-1 1', 'M13.8 10.2a4.6 4.6 0 0 0-6.8 0L4.4 12.8a4.6 4.6 0 0 0 6.5 6.5l1-1'],
  'open-outline': ['M14 3.5h6.5V10', 'M20.5 3.5L11 13', 'M18.5 14v5.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V7.5A1.5 1.5 0 0 1 5 6h5.5'],
  'share-social': [circle(18, 5.2, 2.8), circle(6, 12, 2.8), circle(18, 18.8, 2.8), 'M8.5 10.6l7 -3.9', 'M8.5 13.4l7 3.9'],

  notifications: ['M6 10a6 6 0 0 1 12 0c0 5.2 2.2 6.6 2.2 6.6H3.8S6 15.2 6 10z', 'M10 20a2.2 2.2 0 0 0 4 0'],
  'person-remove': [circle(10, 8, 3.8), 'M2.8 20.5a7.2 7.2 0 0 1 14.4 0', 'M17.5 8.5h4.5'],
  'person-add': [circle(10, 8, 3.8), 'M2.8 20.5a7.2 7.2 0 0 1 14.4 0', 'M19.7 6.2v4.6', 'M17.4 8.5h4.6'],
  person: [circle(12, 8, 3.9), 'M4.8 20.5a7.2 7.2 0 0 1 14.4 0'],
  people: [circle(9, 8.2, 3.4), 'M2.4 20.2a6.7 6.7 0 0 1 13.2 0', 'M16.4 5.2a3.4 3.4 0 0 1 0 6.6', 'M17.6 14.4a6 6 0 0 1 4 5.8'],
  star: ['M12 3.4l2.7 5.6 6.1.85-4.4 4.3 1.05 6.1L12 17.4l-5.45 2.85L7.6 14.15 3.2 9.85l6.1-.85z'],
  trash: ['M4 6.5h16', 'M9.5 6.5V4.6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.9', 'M6 6.5l1 13.1a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4l1-13.1', 'M10 10.5v6.5', 'M14 10.5v6.5'],
  'document-text': ['M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z', 'M13.5 3v5.5H19', 'M8.5 13h7', 'M8.5 16.5h5'],
  'cloud-upload': ['M6.8 18.5a4.3 4.3 0 0 1-.4-8.6 5.6 5.6 0 0 1 10.8-1.3 3.9 3.9 0 0 1 .5 7.7', 'M12 21v-9', 'M8.8 15.2L12 12l3.2 3.2'],
  image: ['M3.5 5.5A1.5 1.5 0 0 1 5 4h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5z', circle(8.6, 9.2, 1.7), 'M3.6 16.6l4.6-4 4 3.4 3.2-2.8 4.1 3.6'],
  snow: ['M12 2.5v19', 'M3.8 7.2l16.4 9.6', 'M20.2 7.2L3.8 16.8', 'M9.6 4.4L12 2.5l2.4 1.9', 'M9.6 19.6L12 21.5l2.4-1.9'],
  language: ['M3 6h10', 'M8 4v2', 'M11.5 6c0 4.5-3.2 8.3-8 10', 'M6 9.5c.8 2.6 2.9 4.9 5.6 6', 'M12.8 20.5L17 9.5l4.2 11', 'M14.3 16.8h5.4'],

  // Iconos añadidos en 1.10: sin ellos el centro de ayuda y varios avisos
  // salían con un hueco en blanco (Icon devuelve un SVG vacío si el nombre
  // no existe). El set completo evita ese silencio visual.
  add: ['M12 5v14', 'M5 12h14'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  'close-circle': [circle(12, 12, 9), 'M9 9l6 6', 'M15 9l-6 6'],
  mail: [
    'M3.5 6.5A1.5 1.5 0 0 1 5 5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z',
    'M3.5 6.9L12 13l8.5-6.1',
  ],
  chatbubbles: [
    'M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v6A2.5 2.5 0 0 1 17.5 16H11l-4 3.5V16H6.5A2.5 2.5 0 0 1 4 13.5z',
    circle(9, 10.5, 0.8), circle(12, 10.5, 0.8), circle(15, 10.5, 0.8),
  ],
  'alert-circle': [circle(12, 12, 9), 'M12 7.2v6', circle(12, 16.6, 0.7)],
  'cloud-offline': [
    'M6.8 18.5a4.3 4.3 0 0 1-.4-8.6 5.6 5.6 0 0 1 10.8-1.3 3.9 3.9 0 0 1 .5 7.7',
    'M3 3l18 18',
  ],
  construct: [
    'M13.5 8.5l7 -3.5-3-3-3.5 7z',
    'M11.5 10.5L4 18l2 2 7.5-7.5',
    'M12.2 11.8l1.6 1.6',
  ],
  'help-buoy': [
    circle(12, 12, 9),
    circle(12, 12, 3.4),
    'M12 3v5.4', 'M12 15.6V21', 'M3 12h5.4', 'M15.6 12H21',
  ],
  // Avión de papel — usado como remesa/enviar-al-extranjero.
  send: ['M21 3L2 12l7 3 3 7z', 'M9 15l12-12'],
  airplane: ['M21 3L2 12l7 3 3 7z', 'M9 15l12-12'],
  'paper-plane': ['M21 3L2 12l7 3 3 7z', 'M9 15l12-12'],
  heart: ['M12 21s-8-5.3-8-11.3a4.7 4.7 0 0 1 8-3.3 4.7 4.7 0 0 1 8 3.3c0 6-8 11.3-8 11.3z'],
  earth: [circle(12, 12, 9), 'M3 12h18', 'M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18'],
  'trending-up': ['M3 17l6-6 4 4 8-8', 'M15 7h5v5'],

  // Estos cinco los citaban pantallas ya entregadas (la barra de pestañas de
  // App.js pide 'planet', 'scan', 'compass' y 'home'; el panel y la portada de
  // MyTokenPay pedían 'gift' para los bonos) y NO existían en el set: Icon
  // devuelve un <Svg/> vacío cuando no encuentra el nombre, así que esos
  // botones se veían como un hueco. Dibujados sobre la misma rejilla de 24×24
  // y con el mismo trazo que el resto.
  home: ['M3.5 10.6L12 3.6l8.5 7', 'M5.5 9.4V20h13V9.4', 'M9.8 20v-5.6h4.4V20'],
  // El clip y la cámara de video entraron cuando PULSE CHAT dejó los emojis
  // (📎🖼🎬📄⌖) como iconos de botón: en Android salen a color y rompen la
  // paleta oro/verde. Mismo trazo y rejilla 24×24 que el resto del set.
  attach: ['M21.2 11.2l-8.9 8.9a5.7 5.7 0 0 1-8.1-8.1l8.9-8.9a3.8 3.8 0 0 1 5.4 5.4l-8.9 8.9a1.9 1.9 0 0 1-2.7-2.7l8.2-8.2'],
  videocam: ['M2.5 7.5A1.5 1.5 0 0 1 4 6h9a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 13 18H4a1.5 1.5 0 0 1-1.5-1.5z', 'M14.5 10.2l7-3.7v11l-7-3.7'],
  planet: [circle(12, 12, 6.4), 'M4.6 16.4c-2.2 1.5-3.4 2.9-3 3.6.7 1.2 5.2-.3 10-3.3s8.2-6.4 7.5-7.6c-.4-.7-2.2-.5-4.6.4'],
  compass: [circle(12, 12, 8.6), 'M15.4 8.6l-2 4.8-4.8 2 2-4.8z'],
  scan: ['M3.5 8.6V5.6a2 2 0 0 1 2-2h3', 'M15.5 3.6h3a2 2 0 0 1 2 2v3', 'M20.5 15.4v3a2 2 0 0 1-2 2h-3', 'M8.5 20.4h-3a2 2 0 0 1-2-2v-3', 'M3.5 12h17'],
  gift: ['M3.6 11.4h16.8v3H3.6z', 'M5.2 14.4V20h13.6v-5.6', 'M12 11.4V20', 'M12 11.4C10.4 8.6 9 7.2 7.6 7.2a2.2 2.2 0 0 0 0 4.2h8.8a2.2 2.2 0 0 0 0-4.2c-1.4 0-2.8 1.4-4.4 4.2z'],
};

// Alias: mismos nombres que usábamos antes.
PATHS['time-outline'] = PATHS.time;
PATHS['settings'] = PATHS['settings-sharp'];
// Reproducir y pausar, para las notas de voz del chat. No estaban en el set y
// <Icon> pinta un hueco vacío cuando el nombre no existe — lo avisa sólo en
// desarrollo, así que en producción el botón habría salido sin nada dentro.
PATHS.play = ['M8 5v14l11-7z'];
PATHS.pause = ['M6 5h4v14H6z', 'M14 5h4v14h-4z'];

// Iconos que se ven mejor rellenos (badges pequeños).
const FILLED = new Set(['star']);

export function Icon({ name, size = 24, color = '#F3ECD9', style }) {
  const d = PATHS[name];
  if (!d) {
    if (__DEV__ && name) console.warn(`[Icon] "${name}" no existe en el set`);
    return <Svg width={size} height={size} style={style} />;
  }
  const filled = FILLED.has(name);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      {d.map((p, i) => (
        <Path
          key={i}
          d={p}
          fill={filled ? color : 'none'}
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

export default Icon;

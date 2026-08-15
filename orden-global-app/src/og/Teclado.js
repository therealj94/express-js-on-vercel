// ═══ EL TECLADO ════════════════════════════════════════════════════════
// Queja de José, textual: «el teclado se abre y no me deja ver lo que
// escribo». Pasaba en el chat, en las contraseñas y en todos lados, y no
// era casualidad: la MISMA línea estaba copiada en catorce pantallas.
//
//     <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
//
// Ese `undefined` en Android no significa «el comportamiento por defecto»:
// significa APAGADO. Sin `behavior`, KeyboardAvoidingView cae en el `default`
// de su switch y devuelve una View pelada que no mueve absolutamente nada
// (react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js). Antes
// colaba porque Android encogía la ventana él solo con adjustResize y el
// campo subía sin ayuda de nadie. Desde que la app se dibuja de borde a borde
// —Android 15, Expo SDK 54 lo trae puesto— la ventana YA NO SE ENCOGE: la app
// sigue ocupando la pantalla entera y el teclado se pinta ENCIMA. De ahí que
// el campo quede debajo y José escriba a ciegas. En Android el behavior que
// sirve es 'height'; en iOS, 'padding'.
//
// El segundo fallo es más fino y también estaba en todas partes. El
// KeyboardAvoidingView compara la altura del teclado —que le llega en
// coordenadas de PANTALLA— con su propio marco, que mide con onLayout y por
// tanto viene RELATIVO A SU PADRE. Dentro de App.js cada pantalla cuelga de
// un SafeAreaView con paddingTop, así que el marco va desplazado hacia abajo
// esa cantidad y el hueco calculado se queda corto justo en esos píxeles.
// En vez de adivinar el número a mano pantalla por pantalla —que es lo que
// obliga a hacer `keyboardVerticalOffset` y lo que nadie mantiene—, aquí se
// MIDE: el contenedor pregunta su propia Y dentro de la ventana y se la pasa
// como offset. La cuenta sale exacta igual bajo la cabecera que a pantalla
// completa, y sigue saliendo exacta cuando mañana cambie el alto del
// encabezado.
import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import {
  View, ScrollView, KeyboardAvoidingView, Keyboard, Platform,
} from 'react-native';

const iOS = Platform.OS === 'ios';

// El canal por el que un campo cualquiera —esté a la profundidad que esté—
// avisa a su pantalla de que acaba de recibir el foco. Va por contexto y no
// por props para no tener que enhebrar una referencia a mano por cada uno de
// los cuarenta y tantos TextInput de la app: se envuelve la pantalla una vez
// y todos los campos de dentro quedan atendidos.
export const TecladoCtx = createContext(null);

// El único behavior que de verdad aparta el contenido en cada sistema.
export const COMPORTAMIENTO = iOS ? 'padding' : 'height';

// Alto del teclado y la Y donde empieza su borde superior. iOS avisa ANTES
// de abrirlo ('will…'), y por eso allí el contenido acompaña la animación en
// lugar de dar un salto al final. Android solo emite 'did…', cuando ya está
// abierto: es lo único que hay y con eso se trabaja.
export function useTeclado() {
  const [tec, setTec] = useState({ alto: 0, cima: 0 });
  useEffect(() => {
    const abrir = (e) => {
      const c = e && e.endCoordinates;
      if (!c) return;
      setTec({ alto: c.height || 0, cima: c.screenY || 0 });
    };
    const cerrar = () => setTec({ alto: 0, cima: 0 });
    const subs = [
      Keyboard.addListener(iOS ? 'keyboardWillShow' : 'keyboardDidShow', abrir),
      Keyboard.addListener(iOS ? 'keyboardWillHide' : 'keyboardDidHide', cerrar),
    ];
    return () => subs.forEach((s) => { try { s.remove(); } catch (e) {} });
  }, []);
  return tec;
}

// Dónde empieza esta pantalla dentro de la ventana. Es el «offset de la
// cabecera» del que habla la documentación de KeyboardAvoidingView, pero
// medido en lugar de escrito a mano. `collapsable={false}` no es adorno: sin
// él Android funde la View en su padre por optimización y measureInWindow se
// queda sin nodo al que preguntar.
function useDesplazamiento() {
  const caja = useRef(null);
  const [y, setY] = useState(0);
  const medir = useCallback(() => {
    const n = caja.current;
    if (!n || typeof n.measureInWindow !== 'function') return;
    try {
      n.measureInWindow((_x, py) => {
        if (typeof py !== 'number' || !isFinite(py)) return;
        // El umbral evita repintar por medio píxel de redondeo.
        setY((v) => (Math.abs(v - py) > 1 ? py : v));
      });
    } catch (e) {}
  }, []);
  return { caja, y, medir };
}

// Formularios largos: que el campo ENFOCADO quede visible, no solo que el
// teclado deje de taparlo todo. Se mide dónde ha quedado el campo en la
// pantalla, se compara con el borde del teclado y se desplaza la diferencia.
//
// El orden de los avisos obliga a intentarlo dos veces: el foco llega ANTES
// de que el teclado exista, así que la primera pasada sirve solo cuando ya
// estaba abierto de otro campo, y el efecto de abajo repite en cuanto el
// teclado da su altura definitiva.
export function useCampoVisible(margen = 26) {
  const refScroll = useRef(null);
  const desplaz = useRef(0);   // desplazamiento actual del ScrollView
  const ultimo = useRef(null); // último campo que pidió verse
  const tec = useTeclado();

  const alDesplazar = useCallback((e) => {
    const y = e && e.nativeEvent && e.nativeEvent.contentOffset && e.nativeEvent.contentOffset.y;
    if (typeof y === 'number') desplaz.current = y;
  }, []);

  const traer = useCallback((ref) => {
    const campo = ref && ref.current;
    const sv = refScroll.current;
    if (!campo || !sv || typeof campo.measureInWindow !== 'function') return;
    let cima = 0;
    try {
      const m = Keyboard.metrics && Keyboard.metrics();
      if (m && m.screenY) cima = m.screenY;
    } catch (e) {}
    if (!cima) return; // sin teclado abierto no hay nada de lo que apartarse
    try {
      campo.measureInWindow((_x, y, _w, alto) => {
        if (typeof y !== 'number' || !isFinite(y)) return;
        // Cuánto del campo se come el teclado, con un margen para que no
        // quede pegado al borde y se lea la línea de abajo.
        const sobra = (y + (alto || 0) + margen) - cima;
        if (sobra <= 0) return;
        const destino = Math.max(0, desplaz.current + sobra);
        try { sv.scrollTo({ y: destino, animated: true }); } catch (e) {}
      });
    } catch (e) {}
  }, [margen]);

  const alEnfocar = useCallback((ref) => {
    ultimo.current = ref;
    const id = setTimeout(() => traer(ref), 60);
    return () => clearTimeout(id);
  }, [traer]);

  useEffect(() => {
    if (!tec.alto) return undefined;
    const id = setTimeout(() => traer(ultimo.current), 40);
    return () => clearTimeout(id);
  }, [tec.alto, tec.cima, traer]);

  return { refScroll, alDesplazar, alEnfocar };
}

// Lo que hay que colgar de un TextInput para que, al enfocarlo, su pantalla
// lo suba por encima del teclado. Si el campo NO vive dentro de una
// <PantallaConTeclado> devuelve un onFocus que no hace nada, así que
// engancharlo nunca puede romper una pantalla que no lo use.
export function useCampoAuto() {
  const ref = useRef(null);
  const ctx = useContext(TecladoCtx);
  const onFocus = useCallback(() => {
    if (ctx && typeof ctx.alEnfocar === 'function') ctx.alEnfocar(ref);
  }, [ctx]);
  return { ref, onFocus };
}

// El envoltorio de raíz. Sustituye al par KeyboardAvoidingView + ScrollView
// que cada pantalla se montaba por su cuenta (y montaba mal).
//
//   desplaza=true  (por defecto) → formularios y listas: ScrollView dentro.
//   desplaza=false               → pantallas que ya mandan en su alto y solo
//                                  necesitan que el pie suba, como el hilo
//                                  del chat.
export function PantallaConTeclado({
  children,
  style,
  contentContainerStyle,
  refScroll,
  desplaza = true,
  offsetExtra = 0,
  ...resto
}) {
  const { caja, y, medir } = useDesplazamiento();
  const { refScroll: propio, alDesplazar, alEnfocar } = useCampoVisible();
  const compensa = y + offsetExtra;

  // El contexto se comparte con TODOS los campos de dentro. Se memoriza
  // porque un objeto nuevo en cada render obligaría a repintar cada TextInput
  // de un formulario largo con cada tecla que se pulsa.
  // `iosAutoInset` le dice al cuerpo desplazable si le toca a ÉL meter el
  // hueco en iOS. Solo cuando el KeyboardAvoidingView de aquí arriba está
  // apagado; si empujaran los dos, el hueco se contaría dos veces.
  const canal = React.useMemo(
    () => ({ alEnfocar, refScroll: propio, alDesplazar, iosAutoInset: desplaza }),
    [alEnfocar, propio, alDesplazar, desplaza],
  );

  // La pantalla se queda con la referencia del ScrollView para desplazarlo, y
  // si además quien la usa pidió la suya —para llevar a alguien a un sitio
  // concreto— se le entrega el MISMO nodo, no una copia.
  const enlazar = useCallback((nodo) => {
    propio.current = nodo;
    if (typeof refScroll === 'function') refScroll(nodo);
    else if (refScroll && typeof refScroll === 'object') refScroll.current = nodo;
  }, [propio, refScroll]);

  if (!desplaza) {
    return (
      <TecladoCtx.Provider value={canal}>
        <View ref={caja} onLayout={medir} collapsable={false} style={[{ flex: 1 }, style]}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={COMPORTAMIENTO}
            keyboardVerticalOffset={compensa}>
            {children}
          </KeyboardAvoidingView>
        </View>
      </TecladoCtx.Provider>
    );
  }

  return (
    <TecladoCtx.Provider value={canal}>
    <View ref={caja} onLayout={medir} collapsable={false} style={[{ flex: 1 }, style]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={COMPORTAMIENTO}
        keyboardVerticalOffset={compensa}
        // En iOS el trabajo lo hace `automaticallyAdjustKeyboardInsets` del
        // ScrollView de abajo: mete el hueco Y ADEMÁS arrastra el campo
        // enfocado a la vista, cosa que el KeyboardAvoidingView no sabe
        // hacer. Si además éste empujara, el hueco se contaría DOS VECES y
        // el formulario pegaría un salto de medio teclado. Por eso en iOS
        // queda de mero contenedor y solo trabaja en Android.
        enabled={!iOS}>
        <ScrollView
          ref={enlazar}
          onScroll={alDesplazar}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          contentContainerStyle={contentContainerStyle}
          // Sin esto el primer toque solo cierra el teclado y hay que tocar
          // dos veces cada botón mientras se escribe.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={iOS ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={iOS}
          showsVerticalScrollIndicator={false}
          {...resto}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
    </TecladoCtx.Provider>
  );
}

// El trozo desplazable de una pantalla que además lleva cabecera fija arriba
// y/o botonera abajo —el alta de Mi Negocio, la ficha, el cobro—. Ahí el
// contenido no puede ser TODO el hijo de la PantallaConTeclado, solo el
// tramo de en medio: la cabecera tiene que quedarse quieta y el botón de
// guardar tiene que subir con el teclado en vez de irse con el desplazamiento.
// Se registra solo en el contexto, así que los campos de dentro siguen
// subiendo al enfocarse sin que la pantalla enhebre una sola referencia.
export function CuerpoDesplazable({ children, style, contentContainerStyle, ...resto }) {
  const ctx = useContext(TecladoCtx);
  const enlazar = useCallback((nodo) => {
    if (ctx && ctx.refScroll) ctx.refScroll.current = nodo;
  }, [ctx]);
  return (
    <ScrollView
      ref={enlazar}
      onScroll={ctx ? ctx.alDesplazar : undefined}
      scrollEventThrottle={16}
      style={[{ flex: 1 }, style]}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={iOS ? 'interactive' : 'on-drag'}
      automaticallyAdjustKeyboardInsets={iOS && !!(ctx && ctx.iosAutoInset)}
      showsVerticalScrollIndicator={false}
      {...resto}>
      {children}
    </ScrollView>
  );
}

export default PantallaConTeclado;

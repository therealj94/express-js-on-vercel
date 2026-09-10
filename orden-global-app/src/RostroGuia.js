import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Ellipse, G } from 'react-native-svg';
import { C } from './theme';

// ---------------------------------------------------------------------------
// La guía visual de la prueba de vida.
//
// POR QUE HACE FALTA
//
// Antes solo había una frase: «Gire la cabeza hacia un lado». Una frase no
// enseña un movimiento. La persona no sabe cuánto girar, ni cuándo, ni si lo
// está haciendo bien, y cuando falla tampoco entiende por qué. Con los ojos
// cerrados, además, no puede leer nada.
//
// Aquí hay tres cosas, y las tres resuelven un problema distinto:
//
//   · un ÓVALO que dice dónde poner la cara. Sin él, la gente se pone lejos o
//     descentrada y el rostro sale demasiado pequeño para analizarlo;
//   · un DIBUJO ANIMADO del gesto, que se mueve como hay que moverse. Se
//     entiende sin leer, y funciona igual para alguien que no lee bien;
//   · un ANILLO que se va llenando con la cuenta atrás, para saber cuánto
//     falta sin tener que mirar un número.
//
// Todo con `react-native-svg`, que ya está en la app. Nada de esto decide nada:
// la comprobación la hace el servidor sobre las fotos.
// ---------------------------------------------------------------------------

const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * Una cabeza esquemática que hace el gesto que se está pidiendo.
 *
 * El giro es una rotación de verdad sobre el eje vertical —achatando el óvalo
 * mientras gira, como haría una cara real— y no una flecha al lado: así se ve
 * cuánto hay que girar, que era justo lo que nadie sabía.
 */
export function SenaGesto({ gesto, tamano = 92 }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    t.setValue(0);
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [gesto]);

  // Giro de la cabeza: rota y se estrecha, que es lo que hace una cara de verdad.
  const rotar = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '32deg'] });
  const estrechar = t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] });

  const abrir = t.interpolate({ inputRange: [0, 1], outputRange: [1, 3.4] });   // boca
  const sonreir = t.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const parpado = t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.08] }); // ojos

  const cara = (extra) => (
    <Svg width={tamano} height={tamano} viewBox="0 0 100 100">
      <Ellipse cx="50" cy="50" rx="30" ry="38" stroke={C.gold} strokeWidth="2.5" fill="none" />
      {extra}
    </Svg>
  );

  const ojosNormales = (
    <>
      <Circle cx="39" cy="44" r="3" fill={C.gold} />
      <Circle cx="61" cy="44" r="3" fill={C.gold} />
    </>
  );

  if (gesto === 'girar-cabeza') {
    return (
      <Animated.View style={{ transform: [{ rotate: rotar }, { scaleX: estrechar }] }}>
        {cara(<>
          {ojosNormales}
          <Path d="M40 64 Q50 68 60 64" stroke={C.gold} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>)}
      </Animated.View>
    );
  }

  if (gesto === 'boca-abierta') {
    return (
      <Svg width={tamano} height={tamano} viewBox="0 0 100 100">
        <Ellipse cx="50" cy="50" rx="30" ry="38" stroke={C.gold} strokeWidth="2.5" fill="none" />
        {ojosNormales}
        <AnimatedG style={{ transform: [{ scaleY: abrir }] }} originY={64}>
          <Ellipse cx="50" cy="64" rx="10" ry="3" fill={C.gold} />
        </AnimatedG>
      </Svg>
    );
  }

  if (gesto === 'ojos-cerrados') {
    return (
      <Svg width={tamano} height={tamano} viewBox="0 0 100 100">
        <Ellipse cx="50" cy="50" rx="30" ry="38" stroke={C.gold} strokeWidth="2.5" fill="none" />
        <AnimatedG style={{ transform: [{ scaleY: parpado }] }} originY={44}>
          <Circle cx="39" cy="44" r="3.5" fill={C.gold} />
          <Circle cx="61" cy="44" r="3.5" fill={C.gold} />
        </AnimatedG>
        <Path d="M33 44 h12 M55 44 h12" stroke={C.gold} strokeWidth="2" strokeLinecap="round" opacity="0.45" />
        <Path d="M40 64 Q50 67 60 64" stroke={C.gold} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </Svg>
    );
  }

  if (gesto === 'sonreir') {
    // La boca pasa de recta a curvada. Se dibujan las dos y se cruza la opacidad.
    return (
      <Svg width={tamano} height={tamano} viewBox="0 0 100 100">
        <Ellipse cx="50" cy="50" rx="30" ry="38" stroke={C.gold} strokeWidth="2.5" fill="none" />
        {ojosNormales}
        <AnimatedG style={{ opacity: sonreir.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
          <Path d="M40 64 h20" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" />
        </AnimatedG>
        <AnimatedG style={{ opacity: sonreir }}>
          <Path d="M38 61 Q50 72 62 61" stroke={C.gold} strokeWidth="2.8" fill="none" strokeLinecap="round" />
        </AnimatedG>
      </Svg>
    );
  }

  if (gesto === 'acercarse') {
    // La cara crece: es exactamente el movimiento que se pide y que el servidor
    // mide comparando con el fotograma de frente.
    return (
      <Animated.View style={{ transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.12] }) }] }}>
        {cara(<>
          {ojosNormales}
          <Path d="M40 64 Q50 68 60 64" stroke={C.gold} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>)}
      </Animated.View>
    );
  }

  // 'frente' y cualquier otro: cara neutra mirando al frente, latiendo apenas.
  return (
    <Animated.View style={{ transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }}>
      {cara(<>
        {ojosNormales}
        <Path d="M40 64 h20" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" />
      </>)}
    </Animated.View>
  );
}

/**
 * Óvalo de encuadre sobre la cámara, con el anillo de la cuenta atrás.
 *
 * `cuenta` va de 3 a 0; `null` cuando no hay cuenta corriendo. El anillo se
 * llena en sentido horario para que se vea el avance sin mirar el número — que
 * es imprescindible en el gesto de cerrar los ojos.
 */
export function OvaloRostro({ cuenta, listo = false }) {
  const TOTAL = 3;
  const avance = cuenta === null ? 0 : (TOTAL - cuenta) / TOTAL;
  // Perímetro aproximado de la elipse (Ramanujan), para el guion del trazo.
  const rx = 96, ry = 128;
  const h = ((rx - ry) ** 2) / ((rx + ry) ** 2);
  const perimetro = Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));

  return (
    <View style={est.capa} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 260 320">
        <Ellipse cx="130" cy="160" rx={rx} ry={ry}
          stroke="rgba(255,255,255,0.28)" strokeWidth="3" fill="none" />
        {cuenta !== null && (
          <Ellipse cx="130" cy="160" rx={rx} ry={ry}
            stroke={listo ? C.up || '#3ED9A0' : C.gold} strokeWidth="5" fill="none"
            strokeDasharray={`${perimetro}`}
            strokeDashoffset={`${perimetro * (1 - avance)}`}
            strokeLinecap="round"
            transform="rotate(-90 130 160)" />
        )}
      </Svg>
      {cuenta !== null && (
        <View style={est.centro}>
          <Text style={est.numero}>{cuenta > 0 ? cuenta : '✓'}</Text>
        </View>
      )}
    </View>
  );
}

const est = StyleSheet.create({
  capa: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  centro: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  numero: { color: C.gold, fontSize: 76, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 },
});

// La marca de Genesis ID, en vectores.
//
// Es la misma recreación del logotipo oficial que usa el panel web (el marco
// hexagonal en G, la i de identidad y la huella que se vuelve mano), con los
// mismos trazos. Vive como componente y no como PNG por dos razones: se pinta
// nítida a cualquier tamaño, y llega por aire — un asset nuevo también viaja
// en la actualización, pero el vector además se puede animar y teñir.
//
// `latiendo` la hace respirar: es el estado de espera de la casa (entrando,
// cargando), no un adorno permanente.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

export function Marca({ size = 96, color = '#F5B32B', latiendo = false, style }) {
  const pulso = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!latiendo) { pulso.setValue(1); return; }
    const ciclo = Animated.loop(Animated.sequence([
      Animated.timing(pulso, { toValue: 0.93, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulso, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    ciclo.start();
    return () => ciclo.stop();
  }, [latiendo, pulso]);

  return (
    <Animated.View style={[{ width: size, height: size, transform: [{ scale: pulso }], opacity: latiendo ? pulso : 1 }, style]}>
      <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
        <Path
          d="M 251.3 75.2 L 261.4 81 Q 232 64 202.6 81 L 100.4 140 Q 70.9 157 70.9 191 L 70.9 309 Q 70.9 343 100.4 360 L 202.6 419 Q 232 436 261.4 419 L 238.4 432.3"
          stroke={color} strokeWidth={58} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M 354 124 Q 416 150 424 216 L 424 240" stroke={color} strokeWidth={54} strokeLinecap="round" />
        <Circle cx={272} cy={158} r={40} fill={color} />
        <Rect x={236} y={212} width={70} height={122} rx={32} fill={color} />
        <Circle cx={374} cy={302} r={15} fill={color} />
        <G stroke={color} strokeWidth={15} strokeLinecap="round" fill="none">
          <Path d="M 342.8 284.0 A 36 36 0 1 1 338.8 309.5" />
          <Path d="M 333.0 261.0 A 58 58 0 1 1 316.6 310.1" />
          <Path d="M 331.6 234.2 A 80 80 0 1 1 294.2 307.6" />
          <Path d="M 377.9 413.9 A 112 112 0 0 1 272.5 349.3" />
          <Path d="M 369.3 437.9 A 136 136 0 0 1 251.8 361.6" />
          <Path d="M 360.1 461.4 A 160 160 0 0 1 232.7 377.1" />
          <Path d="M 348.4 484.2 A 184 184 0 0 1 214.7 394.0" />
        </G>
      </Svg>
    </Animated.View>
  );
}

// La tipografía de DISPLAY del lockup «ORDEN GLOBAL» (splash y login).
// Cinzel Bold: un trazo lapidario que casa con el dorado de la marca; el
// archivo viaja dentro del bundle (assets/fonts), así que no depende de red.
//
// REGLA DEL AIRE ── expo-font es un módulo nativo. Está en package.json y los
// íconos ya lo ejercitan, pero un APK viejo que reciba esto por aire podría
// no traerlo: el require va en try/catch y, si falta o la carga falla, el
// lockup se queda con la fuente del sistema — la app arranca exactamente
// igual y nadie ve un error por una letra.
import { useEffect, useState } from 'react';

let promesa = null;
let cargada = false;

function cargar() {
  if (promesa) return promesa;
  promesa = (async () => {
    try {
      const Font = require('expo-font');
      await Font.loadAsync({
        'Cinzel-Bold': require('../assets/fonts/Cinzel-Bold.ttf'),
      });
      cargada = true;
    } catch (e) {
      cargada = false;
    }
    return cargada;
  })();
  return promesa;
}

// true cuando la fuente de display quedó lista; false mientras tanto (y para
// siempre si el módulo no está). Las pantallas la aplican solo si es true.
export function useFuenteDisplay() {
  const [lista, setLista] = useState(cargada);
  useEffect(() => {
    let vivo = true;
    cargar().then((ok) => { if (vivo && ok) setLista(true); });
    return () => { vivo = false; };
  }, []);
  return lista;
}

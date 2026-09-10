/* EL SUELO DE AZAR, ANTES QUE NADA. `@noble` se queda con lo que haya en
   `globalThis.crypto` en el instante en que se carga, y en Android no hay
   nada. Este import va PRIMERO, delante de `App`, para que cualquier cosa que
   arrastre a @noble lo encuentre ya puesto. Ver `src/og/azar.js`. */
import './src/og/azar.js';

import { registerRootComponent } from 'expo';
import App from './App';

// Punto de entrada estándar de Expo SDK 53.
registerRootComponent(App);

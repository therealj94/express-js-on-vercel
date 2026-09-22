/* Trabajador de la prueba T-CONC-01.
 *
 * Corre en un hilo aparte, con su PROPIA conexión al mismo archivo. Es lo que
 * hace que la carrera sea real y no una simulación: dos hilos del sistema
 * operativo peleando por el mismo índice único, no dos llamadas intercaladas a
 * mano desde un solo hilo.
 *
 * El generador de números se fuerza a sacar de una bolsa pequeña para que las
 * colisiones ocurran de verdad. Con doce dígitos al azar, la rama que resuelve
 * una colisión no se ejercitaría nunca. */

import { parentPort, workerData } from 'node:worker_threads';
import { DirectorioDurable } from '../durable/directorioDurable.js';
import { formatear } from '../numeroCuenta.js';

interface Encargo {
  ruta: string;
  altas: number;
  /** Cuántos números distintos hay en la bolsa. Menos bolsa, más colisiones. */
  tamanoDeLaBolsa: number;
  semilla: number;
}

const encargo = workerData as Encargo;

let s = encargo.semilla >>> 0;
let sorteos = 0;
const siguiente = (): string => {
  s = (s * 1664525 + 1013904223) >>> 0;
  sorteos++;
  const n = s % encargo.tamanoDeLaBolsa;
  return formatear(String(n).padStart(12, '0'));
};

const directorio = new DirectorioDurable({ ruta: encargo.ruta, generarNumero: siguiente });

const numeros: string[] = [];
let agotados = 0;

for (let i = 0; i < encargo.altas; i++) {
  try {
    const cuenta = directorio.crearCuenta({
      genesisSubjectRef: `gsr_${encargo.semilla}_${i}`,
      custodyProfile: 'MANAGED',
      policyVersion: 'prueba',
    });
    numeros.push(cuenta.accountNumber);
  } catch {
    /* Agotar los reintentos con una bolsa pequeña es legítimo: significa que la
       base rechazó tantas veces como hizo falta. Lo que no puede pasar es que
       entregue un número repetido. */
    agotados++;
  }
}

directorio.cerrar();
parentPort?.postMessage({ numeros, sorteos, agotados });

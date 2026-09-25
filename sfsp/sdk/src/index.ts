/* Punto de entrada del SDK de referencia de SFSP.
 *
 * Sin dependencias de ejecución: todo lo que hay aquí funciona con Node a
 * secas, sin red, sin base de datos y sin nodo. Es deliberado, porque esta
 * biblioteca se va a ejecutar en sitios donde una dependencia de más es una
 * superficie de ataque de más. */

export * from './tipos.js';
export * from './codigos.js';
export * from './ids.js';
export * from './keccak.js';
export * from './autorizacion.js';
export * from './direccion.js';
export * from './numeroCuenta.js';
export * from './alias.js';
export * from './binding.js';
export * from './custodia.js';
export * from './directorio.js';
export * from './migracionCuentas.js';
export * from './reconciliacion.js';
export * from './reservas.js';
export * from './supply.js';
export * from './decisiones.js';
export * from './rutas.js';
export * from './maquinas.js';

export * from './durable/esquema.js';
export * from './durable/directorioDurable.js';

export * from './operador/ecosistema.js';
export * from './operador/servicios.js';
export * from './operador/separacion.js';
export * from './operador/cumplimiento.js';

export * from './web5/index.js';

export const VERSION_SFSP = 'draft-0.3';

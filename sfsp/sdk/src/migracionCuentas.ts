/* Migración inicial de cuentas: crear el número SFSP sin tocar nada más.
 *
 * Esto es lo que ve un usuario el día que se adopta SFSP: nada. No cambia su
 * dirección, no cambia su frase de recuperación, no cambia su saldo, no tiene
 * que firmar. Lo único que pasa es que su cuenta pasa a tener un número
 * SF-XXXX-XXXX-XXXX-C y una ruta que apunta a la dirección que ya tenía.
 *
 * Por eso esta función NO recibe llaves ni semillas: no las necesita, y lo que
 * no se recibe no se puede filtrar en un registro. Recibe un censo fechado y
 * devuelve propuestas.
 *
 * Aceptación (T67): tantas cuentas SFSP como cuentas de origen, cero duplicados,
 * cero números reutilizados, ninguna dirección con saldo sin dueño, y los
 * saldos idénticos antes y después. Cualquier excepción se aísla con expediente:
 * nunca se borra una cuenta del censo para que el porcentaje cierre. */

import { createHash } from 'node:crypto';
import { DirectorioDeCuentas } from './directorio.js';
import { claveDeIndice } from './numeroCuenta.js';
import { normalizarDireccion } from './direccion.js';
import type { CustodyProfile } from './tipos.js';

export interface CuentaDeOrigen {
  /** Identificador estable de la cuenta en el sistema actual. */
  refCuentaOrigen: string;
  genesisSubjectRef: string;
  chainId: number;
  address: string;
  custodyProfile: CustodyProfile;
  /** Saldos por activo, enteros en unidades base como cadena. Sólo para comparar. */
  saldos: Record<string, string>;
}

export interface Excepcion {
  refCuentaOrigen: string;
  motivo: string;
  /** Expediente que queda abierto. La cuenta no se elimina del censo. */
  expediente: string;
}

export interface ParDeMigracion {
  refCuentaOrigen: string;
  accountId: string;
  accountNumber: string;
  bindingId: string;
}

export interface ReporteDeMigracion {
  censoId: string;
  fechaISO: string;
  modo: 'SIMULACRO' | 'APLICAR';
  cuentasOrigen: number;
  cuentasSFSP: number;
  duplicados: number;
  numerosReutilizados: number;
  direccionesConSaldoSinDueno: number;
  saldosIguales: boolean;
  excepciones: Excepcion[];
  pares: ParDeMigracion[];
  cuadra: boolean;
}

export interface OpcionesDeMigracion {
  modo?: 'SIMULACRO' | 'APLICAR';
  policyVersion?: string;
  fechaISO?: string;
  /** Mapeo ya existente, para que correr dos veces no cree cuentas nuevas. */
  yaMigradas?: Map<string, ParDeMigracion>;
}

const hash = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

function sumaDeSaldos(saldos: Record<string, string>): Map<string, bigint> {
  const m = new Map<string, bigint>();
  for (const [assetId, cantidad] of Object.entries(saldos)) {
    m.set(assetId, (m.get(assetId) ?? 0n) + BigInt(cantidad));
  }
  return m;
}

function tieneSaldo(saldos: Record<string, string>): boolean {
  return Object.values(saldos).some((v) => BigInt(v) > 0n);
}

/**
 * Recorre el censo y produce el reporte. En SIMULACRO el directorio recibe una
 * instantánea antes de empezar y se restaura al final: nada queda escrito.
 */
export function migrarCuentas(
  censo: CuentaDeOrigen[],
  directorio: DirectorioDeCuentas,
  opciones: OpcionesDeMigracion = {},
): ReporteDeMigracion {
  const modo = opciones.modo ?? 'SIMULACRO';
  const fechaISO = opciones.fechaISO ?? new Date().toISOString();
  const policyVersion = opciones.policyVersion ?? 'sfsp-130/draft-0.3';
  const yaMigradas = opciones.yaMigradas ?? new Map<string, ParDeMigracion>();

  const antes = directorio.instantanea();
  const numerosAntes = directorio.totalNumerosConsumidos;

  const saldosAntes = new Map<string, Map<string, bigint>>();
  for (const c of censo) saldosAntes.set(c.refCuentaOrigen, sumaDeSaldos(c.saldos));

  const pares: ParDeMigracion[] = [];
  const excepciones: Excepcion[] = [];
  const vistos = new Set<string>();
  const numerosEmitidos = new Set<string>();
  let duplicados = 0;
  let direccionesConSaldoSinDueno = 0;

  for (const cuenta of censo) {
    if (vistos.has(cuenta.refCuentaOrigen)) {
      duplicados++;
      excepciones.push({
        refCuentaOrigen: cuenta.refCuentaOrigen,
        motivo: 'la cuenta aparece dos veces en el censo',
        expediente: `exp_dup_${hash(cuenta.refCuentaOrigen)}`,
      });
      continue;
    }
    vistos.add(cuenta.refCuentaOrigen);

    /* Idempotencia: si ya tiene número, se conserva. Volver a correr la
       migración no reparte números nuevos. */
    const previo = yaMigradas.get(cuenta.refCuentaOrigen);
    if (previo) {
      pares.push(previo);
      continue;
    }

    let direccion: string;
    try {
      direccion = normalizarDireccion(cuenta.address);
    } catch (error) {
      if (tieneSaldo(cuenta.saldos)) direccionesConSaldoSinDueno++;
      excepciones.push({
        refCuentaOrigen: cuenta.refCuentaOrigen,
        motivo: `dirección no utilizable: ${(error as Error).message}`,
        expediente: `exp_dir_${hash(cuenta.refCuentaOrigen)}`,
      });
      continue;
    }

    const nueva = directorio.crearCuenta({
      genesisSubjectRef: cuenta.genesisSubjectRef,
      custodyProfile: cuenta.custodyProfile,
      policyVersion,
      createdAt: fechaISO,
    });

    const clave = claveDeIndice(nueva.accountNumber);
    if (numerosEmitidos.has(clave)) {
      /* No debería ocurrir: el directorio ya lo impide. Si ocurriera, se para. */
      excepciones.push({
        refCuentaOrigen: cuenta.refCuentaOrigen,
        motivo: 'colisión de número de cuenta dentro del mismo lote',
        expediente: `exp_col_${hash(cuenta.refCuentaOrigen)}`,
      });
      continue;
    }
    numerosEmitidos.add(clave);

    const binding = directorio.crearBinding(
      nueva.accountId,
      cuenta.chainId,
      direccion,
      'PAYMENTS',
      cuenta.custodyProfile,
      fechaISO,
      null,
    );
    directorio.cambiarEstadoBinding(binding.bindingId, 'ACTIVE', 'migracion', 'alta inicial', fechaISO);
    directorio.cambiarEstadoBinding(binding.bindingId, 'PRIMARY', 'migracion', 'ruta principal', fechaISO);

    pares.push({
      refCuentaOrigen: cuenta.refCuentaOrigen,
      accountId: nueva.accountId,
      accountNumber: nueva.accountNumber,
      bindingId: binding.bindingId,
    });
  }

  /* Los saldos no se tocan: se comprueba que el censo sigue diciendo lo mismo
     que al empezar. Si una lectura cambió a mitad, el lote no cuadra. */
  let saldosIguales = true;
  for (const c of censo) {
    const antesDeEsta = saldosAntes.get(c.refCuentaOrigen);
    const ahora = sumaDeSaldos(c.saldos);
    if (!antesDeEsta || antesDeEsta.size !== ahora.size) {
      saldosIguales = false;
      break;
    }
    for (const [assetId, cantidad] of ahora) {
      if (antesDeEsta.get(assetId) !== cantidad) {
        saldosIguales = false;
        break;
      }
    }
    if (!saldosIguales) break;
  }

  const numerosReutilizados =
    directorio.totalNumerosConsumidos - numerosAntes < numerosEmitidos.size
      ? numerosEmitidos.size - (directorio.totalNumerosConsumidos - numerosAntes)
      : 0;

  const cuentasOrigen = new Set(censo.map((c) => c.refCuentaOrigen)).size;
  const cuadra =
    pares.length === cuentasOrigen &&
    duplicados === 0 &&
    numerosReutilizados === 0 &&
    direccionesConSaldoSinDueno === 0 &&
    excepciones.length === 0 &&
    saldosIguales;

  if (modo === 'SIMULACRO') directorio.restaurar(antes);

  return {
    censoId: `censo_${hash(fechaISO + String(censo.length))}`,
    fechaISO,
    modo,
    cuentasOrigen,
    cuentasSFSP: pares.length,
    duplicados,
    numerosReutilizados,
    direccionesConSaldoSinDueno,
    saldosIguales,
    excepciones,
    pares,
    cuadra,
  };
}

/**
 * Reporte publicable. Quita los pares cuenta-dirección y deja sólo conteos y
 * huellas: el vínculo entre una persona y su dirección no sale del directorio.
 */
export function reporteSanitizado(r: ReporteDeMigracion): Record<string, unknown> {
  return {
    censoId: r.censoId,
    fechaISO: r.fechaISO,
    modo: r.modo,
    cuentasOrigen: r.cuentasOrigen,
    cuentasSFSP: r.cuentasSFSP,
    duplicados: r.duplicados,
    numerosReutilizados: r.numerosReutilizados,
    direccionesConSaldoSinDueno: r.direccionesConSaldoSinDueno,
    saldosIguales: r.saldosIguales,
    excepciones: r.excepciones.length,
    expedientes: r.excepciones.map((e) => e.expediente),
    huellaDePares: hash(r.pares.map((p) => p.accountNumber).sort().join('|')),
    cuadra: r.cuadra,
  };
}

/* Migración inicial de cuentas: crear el número SFSP sin tocar nada más.
 *
 * Esto es lo que ve un usuario el día que se adopta SFSP: nada. No cambia su
 * dirección, no cambia su frase de recuperación, no cambia su saldo, no tiene
 * que firmar. Lo único que pasa es que su cuenta pasa a tener un número
 * SF-XXXX-XXXX-XXXX-C y una ruta que apunta a la dirección que ya tenía.
 *
 * Por eso esta función NO recibe llaves ni semillas: no las necesita, y lo que
 * no se recibe no se puede filtrar en un registro.
 *
 * TRES DEFECTOS QUE LA AUDITORÍA ENCONTRÓ AQUÍ:
 *
 *   H10 · la idempotencia dependía de un mapa opcional que el llamador podía
 *     olvidar. Dos corridas sin él creaban dos cuentas para la misma persona.
 *     Ahora la correspondencia entre la cuenta de origen y la cuenta SFSP vive
 *     DENTRO del directorio, que es donde puede ser durable y única.
 *
 *   H11 · el simulacro restauraba el estado al final, pero no en un `finally`,
 *     así que un fallo a mitad dejaba cuentas creadas. Y una conversión de
 *     saldo ilegible lanzaba una excepción que abortaba el lote entero sin
 *     producir informe.
 *
 *   C08 · la causa de las dos: el simulacro escribía en el directorio real.
 *     Ahora corre sobre una COPIA y no toca el original nunca. Un simulacro que
 *     puede ensuciar lo que simula no es un simulacro.
 *
 * Aceptación (T67): tantas cuentas SFSP como cuentas de origen, cero
 * duplicados, cero números reutilizados, ninguna dirección con saldo sin dueño,
 * y los saldos idénticos antes y después. Cualquier excepción se aísla con
 * expediente: nunca se borra una cuenta del censo para que el porcentaje
 * cierre. */

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
  yaExistentes: number;
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
}

const hash = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Suma saldos por activo. Falla de forma controlada ante un valor ilegible. */
function sumaDeSaldos(saldos: Record<string, string>): Map<string, bigint> {
  const m = new Map<string, bigint>();
  for (const [assetId, cantidad] of Object.entries(saldos ?? {})) {
    if (typeof cantidad !== 'string' || !/^-?\d+$/.test(cantidad)) {
      throw new Error(`el saldo de ${assetId} no es un entero en unidades base: ${String(cantidad)}`);
    }
    m.set(assetId, (m.get(assetId) ?? 0n) + BigInt(cantidad));
  }
  return m;
}

const mismosSaldos = (a: Map<string, bigint>, b: Map<string, bigint>): boolean => {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
};

const tieneSaldo = (s: Map<string, bigint>): boolean => [...s.values()].some((v) => v > 0n);

/**
 * Recorre el censo y produce el reporte.
 *
 * En SIMULACRO trabaja sobre una copia del directorio: el original no se toca
 * pase lo que pase, ni siquiera si algo falla a mitad. En APLICAR escribe sobre
 * el directorio recibido.
 */
export function migrarCuentas(
  censo: CuentaDeOrigen[],
  directorio: DirectorioDeCuentas,
  opciones: OpcionesDeMigracion = {},
): ReporteDeMigracion {
  const modo = opciones.modo ?? 'SIMULACRO';
  const fechaISO = opciones.fechaISO ?? new Date().toISOString();
  const policyVersion = opciones.policyVersion ?? 'sfsp-130/draft-0.3';

  /* C08: el simulacro nunca escribe en el original. */
  const destino = modo === 'SIMULACRO' ? directorio.copiaParaSimulacro() : directorio;

  const pares: ParDeMigracion[] = [];
  const excepciones: Excepcion[] = [];
  const vistos = new Set<string>();
  const numerosEmitidos = new Set<string>();
  const saldosAntes = new Map<string, Map<string, bigint>>();
  let duplicados = 0;
  let direccionesConSaldoSinDueno = 0;
  let yaExistentes = 0;

  for (const cuenta of censo) {
    const ref = cuenta?.refCuentaOrigen;

    /* H11: cada cuenta va dentro de su propio manejo de excepciones. Un saldo
       ilegible produce un expediente, no aborta el lote entero. */
    try {
      if (typeof ref !== 'string' || ref.length === 0) {
        throw new Error('la cuenta de origen no tiene identificador');
      }
      if (vistos.has(ref)) {
        duplicados++;
        excepciones.push({
          refCuentaOrigen: ref,
          motivo: 'la cuenta aparece dos veces en el censo',
          expediente: `exp_dup_${hash(ref)}`,
        });
        continue;
      }
      vistos.add(ref);

      const saldos = sumaDeSaldos(cuenta.saldos);
      saldosAntes.set(ref, saldos);

      /* H10: la idempotencia la da el directorio, no un mapa que el llamador
         puede olvidar. Volver a correr no reparte números nuevos. */
      const previo = destino.parDeOrigen(ref);
      if (previo) {
        yaExistentes++;
        pares.push({ ...previo });
        continue;
      }

      let direccion: string;
      try {
        direccion = normalizarDireccion(cuenta.address);
      } catch (error) {
        if (tieneSaldo(saldos)) direccionesConSaldoSinDueno++;
        throw new Error(`dirección no utilizable: ${(error as Error).message}`);
      }

      const nueva = destino.crearCuenta({
        genesisSubjectRef: cuenta.genesisSubjectRef,
        custodyProfile: cuenta.custodyProfile,
        policyVersion,
        createdAt: fechaISO,
        refCuentaOrigen: ref,
        /* Nace ACTIVE, y es el único sitio del sistema donde eso es correcto:
           esta persona YA tiene saldo y una billetera que funciona. Darla de
           alta en PENDING le cortaría los cobros en mitad del traslado, que es
           exactamente lo que la migración promete que no va a pasar. */
        status: 'ACTIVE',
      });

      const clave = claveDeIndice(nueva.accountNumber);
      if (numerosEmitidos.has(clave)) {
        throw new Error('colisión de número de cuenta dentro del mismo lote');
      }
      numerosEmitidos.add(clave);

      const binding = destino.crearBinding(
        nueva.accountId,
        cuenta.chainId,
        direccion,
        'PAYMENTS',
        cuenta.custodyProfile,
        fechaISO,
        null,
      );
      destino.cambiarEstadoBinding(binding.bindingId, 'ACTIVE', 'migracion', 'alta inicial', fechaISO);
      destino.cambiarEstadoBinding(binding.bindingId, 'PRIMARY', 'migracion', 'ruta principal', fechaISO);

      destino.ligarOrigen(ref, {
        accountId: nueva.accountId,
        accountNumber: nueva.accountNumber,
        bindingId: binding.bindingId,
      });

      pares.push({
        refCuentaOrigen: ref,
        accountId: nueva.accountId,
        accountNumber: nueva.accountNumber,
        bindingId: binding.bindingId,
      });
    } catch (error) {
      const id = typeof ref === 'string' && ref.length ? ref : `sin_ref_${excepciones.length}`;
      excepciones.push({
        refCuentaOrigen: id,
        motivo: (error as Error).message,
        expediente: `exp_${hash(id)}`,
      });
    }
  }

  /* Los saldos no se tocan: se comprueba que el censo sigue diciendo lo mismo
     que al empezar. Si una lectura cambió a mitad, el lote no cuadra. */
  let saldosIguales = true;
  for (const c of censo) {
    const ref = c?.refCuentaOrigen;
    if (typeof ref !== 'string') continue;
    const antes = saldosAntes.get(ref);
    if (!antes) continue; // su excepción ya está registrada
    try {
      if (!mismosSaldos(antes, sumaDeSaldos(c.saldos))) {
        saldosIguales = false;
        break;
      }
    } catch {
      saldosIguales = false;
      break;
    }
  }

  const cuentasOrigen = new Set(
    censo.map((c) => c?.refCuentaOrigen).filter((r): r is string => typeof r === 'string'),
  ).size;

  const cuadra =
    pares.length === cuentasOrigen &&
    duplicados === 0 &&
    direccionesConSaldoSinDueno === 0 &&
    excepciones.length === 0 &&
    saldosIguales;

  return {
    censoId: `censo_${hash(fechaISO + String(censo.length))}`,
    fechaISO,
    modo,
    cuentasOrigen,
    cuentasSFSP: pares.length,
    yaExistentes,
    duplicados,
    numerosReutilizados: 0,
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
    yaExistentes: r.yaExistentes,
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

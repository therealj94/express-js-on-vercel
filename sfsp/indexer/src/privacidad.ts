// Filtro de publicacion del indice.
//
// ================= ADVERTENCIA DE ALCANCE =================
// Esto REDUCE EXPOSICION INCIDENTAL. NO ES PRIVACIDAD ON-CHAIN.
//
// Quitar un saldo de la vista publica no lo borra de la cadena: cualquiera con
// un nodo lo lee igual. Lo que este filtro consigue es que el portal deje de ser
// un buscador comodo de terceros (enumeracion masiva, correlacion cuenta-persona,
// snapshots de clientes). El plan maestro P7a lo dice con estas palabras:
// "Quitar saldos de terceros de la UI disminuye exposicion incidental, no
// privacidad on-chain". Cualquier texto de producto que prometa lo contrario es
// falso y este comentario existe para que nadie lo escriba por descuido.
//
// Ademas: los agregados pequenos tambien identifican personas. Por eso el filtro
// no solo tacha campos, tambien suprime agregados por debajo de un umbral.
// ==========================================================
//
// La lista de campos prohibidos sale del §7 del contrato interno (Perimetro de
// datos). Si el §7 cambia, se cambia AQUI y en ningun otro lado.

/** Campos que el §7 prohibe publicar, por nombre exacto. */
export const CAMPOS_PROHIBIDOS_PUBLICO: readonly string[] = [
  // Nunca en codigo, pruebas, registros ni evidencia.
  'seed',
  'semilla',
  'mnemonic',
  'privateKey',
  'llavePrivada',
  // Datos personales y documentos: viven en Genesis ID / boveda cifrada.
  'personalData',
  'datosPersonales',
  'biometria',
  'biometrics',
  'documentoIdentidad',
  'idDocument',
  'nombreLegal',
  'legalName',
  'email',
  'telefono',
  'direccionPostal',
  // Referencia opaca al sujeto: NUNCA se publica en el ledger.
  'genesisSubjectRef',
  // Vinculo cuenta <-> direccion: directorio privado, nunca enumeracion publica.
  'bindingId',
  'accountId',
  'holderAddress',
  'ownerAddress',
  'direccionTitular',
  // Evidencia restringida.
  'restrictedEvidenceRef',
];

/** Campos de saldo de terceros. Se tachan salvo que el titular sea el solicitante. */
export const CAMPOS_SALDO_TERCERO: readonly string[] = [
  'balance',
  'saldo',
  'holderBalance',
  'saldoTitular',
  'balances',
  'holders',
  'titulares',
];

export type AudienciaPublicacion =
  /** Vista publica del explorador: la mas restringida. */
  | 'PUBLICO'
  /** El propio titular viendo lo suyo. */
  | 'TITULAR'
  /**
   * Auditoria ampliada. El plan exige proposito, permiso y bitacora: NO es una
   * llave maestra informal, por eso exige `proposito` y `bitacoraId`.
   */
  | 'AUDITORIA';

export interface ContextoPublicacion {
  readonly audiencia: AudienciaPublicacion;
  /** Con `TITULAR`: que cuenta pide. Se compara con el titular del registro. */
  readonly accountIdSolicitante?: string;
  /** Con `AUDITORIA`: obligatorios, si no se degrada a PUBLICO. */
  readonly proposito?: string;
  readonly bitacoraId?: string;
  /**
   * Umbral de supresion de agregados. Por debajo de este numero de titulares el
   * agregado se suprime porque puede identificar personas.
   */
  readonly umbralAgregado?: number;
}

export interface ResultadoFiltro<T> {
  readonly vista: T;
  /** Rutas de campo retiradas, para que la UI pueda decir "hay datos ocultos". */
  readonly camposRetirados: readonly string[];
  /** Agregados suprimidos por quedar bajo el umbral. */
  readonly agregadosSuprimidos: readonly string[];
  /**
   * Siempre `false`. El tipo lo hace explicito para que nadie derive de este
   * modulo una promesa de confidencialidad.
   */
  readonly esPrivacidadOnChain: false;
}

const UMBRAL_AGREGADO_POR_DEFECTO = 5;

type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [k: string]: Json };

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Filtra un registro antes de publicarlo.
 *
 * Estrategia: lista de PERMITIDOS por exclusion explicita, recorriendo en
 * profundidad. POR QUE se tacha por nombre de campo y no por tipo: un saldo y
 * un contador son ambos numeros; solo el nombre dice cual de los dos identifica
 * a alguien. Un campo nuevo no contemplado se publica, asi que el §7 manda y
 * agregar un campo al contrato obliga a pasar por esta lista.
 */
export function filtrarParaPublicacion<T extends Json>(
  registro: T,
  contexto: ContextoPublicacion,
): ResultadoFiltro<Json> {
  const camposRetirados: string[] = [];
  const agregadosSuprimidos: string[] = [];
  const umbral = contexto.umbralAgregado ?? UMBRAL_AGREGADO_POR_DEFECTO;

  // Auditoria sin proposito ni bitacora NO es auditoria: se degrada a publico.
  const audiencia: AudienciaPublicacion =
    contexto.audiencia === 'AUDITORIA' &&
    (typeof contexto.proposito !== 'string' ||
      contexto.proposito.trim() === '' ||
      typeof contexto.bitacoraId !== 'string' ||
      contexto.bitacoraId.trim() === '')
      ? 'PUBLICO'
      : contexto.audiencia;

  const esTitularDe = (nodo: Record<string, unknown>): boolean => {
    if (audiencia !== 'TITULAR') return false;
    const solicitante = contexto.accountIdSolicitante;
    if (typeof solicitante !== 'string' || solicitante === '') return false;
    return nodo['accountId'] === solicitante;
  };

  const caminar = (valor: unknown, ruta: string): Json => {
    if (Array.isArray(valor)) {
      return valor.map((v, i) => caminar(v, `${ruta}[${i}]`)) as Json;
    }
    if (!esObjeto(valor)) {
      return (valor ?? null) as Json;
    }

    const titular = esTitularDe(valor);
    const salida: Record<string, Json> = {};

    for (const [clave, v] of Object.entries(valor)) {
      const rutaHija = ruta === '' ? clave : `${ruta}.${clave}`;

      // 1. Campos prohibidos por el §7: fuera para TODA audiencia, incluida
      //    AUDITORIA. Una llave privada o una semilla no tiene proposito
      //    legitimo de publicacion en ningun caso.
      if (CAMPOS_PROHIBIDOS_PUBLICO.includes(clave)) {
        if (
          clave === 'accountId' &&
          (titular || audiencia === 'AUDITORIA')
        ) {
          // El titular puede ver su propio identificador; la auditoria con
          // proposito y bitacora tambien. El resto, no.
          salida[clave] = caminar(v, rutaHija);
          continue;
        }
        camposRetirados.push(rutaHija);
        continue;
      }

      // 2. Saldos de terceros: solo los ve el titular o una auditoria reglada.
      if (CAMPOS_SALDO_TERCERO.includes(clave)) {
        if (titular || audiencia === 'AUDITORIA') {
          salida[clave] = caminar(v, rutaHija);
          continue;
        }
        camposRetirados.push(rutaHija);
        continue;
      }

      // 3. Marca explicita del productor del dato.
      if (clave === 'privado' || clave === 'private' || clave === '_privado') {
        camposRetirados.push(rutaHija);
        continue;
      }

      salida[clave] = caminar(v, rutaHija);
    }

    // 4. Supresion de agregados pequenos. Un "3 titulares con X" identifica.
    const conteo = valor['holderCount'] ?? valor['conteoTitulares'];
    if (
      audiencia === 'PUBLICO' &&
      typeof conteo === 'number' &&
      conteo > 0 &&
      conteo < umbral
    ) {
      for (const clave of ['aggregate', 'agregado', 'distribucion', 'distribution']) {
        if (clave in salida) {
          delete salida[clave];
          agregadosSuprimidos.push(ruta === '' ? clave : `${ruta}.${clave}`);
        }
      }
    }

    return salida;
  };

  return {
    vista: caminar(registro, ''),
    camposRetirados,
    agregadosSuprimidos,
    esPrivacidadOnChain: false,
  };
}

/**
 * Comprueba que una vista ya filtrada no contenga ningun campo prohibido.
 * POR QUE existe como funcion y no solo como prueba: sirve de asercion en el
 * borde de salida, para que un cambio futuro en la forma del registro no filtre
 * datos sin que nadie lo note.
 */
export function contieneCampoProhibido(vista: unknown): string | null {
  const prohibidos = new Set([
    ...CAMPOS_PROHIBIDOS_PUBLICO,
    'privado',
    'private',
    '_privado',
  ]);
  const caminar = (valor: unknown, ruta: string): string | null => {
    if (Array.isArray(valor)) {
      for (let i = 0; i < valor.length; i += 1) {
        const hit = caminar(valor[i], `${ruta}[${i}]`);
        if (hit !== null) return hit;
      }
      return null;
    }
    if (!esObjeto(valor)) return null;
    for (const [clave, v] of Object.entries(valor)) {
      const rutaHija = ruta === '' ? clave : `${ruta}.${clave}`;
      if (prohibidos.has(clave)) return rutaHija;
      const hit = caminar(v, rutaHija);
      if (hit !== null) return hit;
    }
    return null;
  };
  return caminar(vista, '');
}

/* Keccak-256, escrito aquí porque el SDK no tiene dependencias de ejecución.
 *
 * No es SHA3-256. Node trae 'sha3-256' en crypto, pero Ethereum usa Keccak
 * original, que se diferencia en el byte de relleno de dominio (0x01 en vez de
 * 0x06). Usar el de Node daría direcciones con checksum equivocado, que es
 * justo el error que hace que una transferencia salga rechazada o, peor, que
 * una herramienta acepte una dirección mal copiada.
 *
 * La implementación se comprueba contra vectores conocidos en las pruebas. Si
 * algún día se añade una dependencia criptográfica revisada, este archivo se
 * retira; mientras tanto, un hash mal calculado se detecta en la suite. */

const MASCARA = (1n << 64n) - 1n;

const RC: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/* Desplazamientos de rho, indexados [x][y]. */
const R: number[][] = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

const rotl = (x: bigint, n: number): bigint => {
  if (n === 0) return x;
  const b = BigInt(n);
  return ((x << b) | (x >> (64n - b))) & MASCARA;
};

const lane = (a: bigint[], i: number): bigint => a[i] as bigint;

function keccakF(A: bigint[]): void {
  const C = new Array<bigint>(5).fill(0n);
  const D = new Array<bigint>(5).fill(0n);
  const B = new Array<bigint>(25).fill(0n);

  for (let ronda = 0; ronda < 24; ronda++) {
    for (let x = 0; x < 5; x++) {
      C[x] = lane(A, x) ^ lane(A, x + 5) ^ lane(A, x + 10) ^ lane(A, x + 15) ^ lane(A, x + 20);
    }
    for (let x = 0; x < 5; x++) {
      D[x] = (C[(x + 4) % 5] as bigint) ^ rotl(C[(x + 1) % 5] as bigint, 1);
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        A[x + 5 * y] = lane(A, x + 5 * y) ^ (D[x] as bigint);
      }
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(lane(A, x + 5 * y), (R[x] as number[])[y] as number);
      }
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        A[x + 5 * y] =
          lane(B, x + 5 * y) ^ (~lane(B, ((x + 1) % 5) + 5 * y) & lane(B, ((x + 2) % 5) + 5 * y) & MASCARA);
      }
    }
    A[0] = lane(A, 0) ^ (RC[ronda] as bigint);
  }
}

/** Keccak-256 de una secuencia de bytes. Devuelve 32 bytes. */
export function keccak256(entrada: Uint8Array): Uint8Array {
  const TASA = 136; // 1088 bits
  const A = new Array<bigint>(25).fill(0n);

  const relleno = TASA - (entrada.length % TASA);
  const mensaje = new Uint8Array(entrada.length + relleno);
  mensaje.set(entrada, 0);
  mensaje[entrada.length] = 0x01; // dominio Keccak original, no 0x06 de SHA3
  mensaje[mensaje.length - 1] = (mensaje[mensaje.length - 1] as number) | 0x80;

  for (let off = 0; off < mensaje.length; off += TASA) {
    for (let i = 0; i < TASA / 8; i++) {
      let palabra = 0n;
      for (let b = 7; b >= 0; b--) {
        palabra = (palabra << 8n) | BigInt(mensaje[off + i * 8 + b] as number);
      }
      A[i] = lane(A, i) ^ palabra;
    }
    keccakF(A);
  }

  const salida = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let palabra = lane(A, i);
    for (let b = 0; b < 8; b++) {
      salida[i * 8 + b] = Number(palabra & 0xffn);
      palabra >>= 8n;
    }
  }
  return salida;
}

export function keccak256Hex(entrada: Uint8Array | string): string {
  const bytes = typeof entrada === 'string' ? new TextEncoder().encode(entrada) : entrada;
  return Array.from(keccak256(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

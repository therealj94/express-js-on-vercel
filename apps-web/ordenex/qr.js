// Copiado tal cual de apps-web/veta-wallet/qr.js, el codificador de la casa.
// No se adapta ni se recorta: dos codificadores "parecidos" en dos apps
// hermanas es como nacen los QR que un telefono lee y el otro no. Si alla se
// corrige un bit, aqui se vuelve a copiar el archivo entero.
// Codificador de QR, en modo byte.
//
// Va escrito a mano y no traido de una libreria porque las dos aplicaciones se
// sirven como un unico archivo sin dependencias: un <script src> a un CDN es una
// peticion mas que puede fallar, y una billetera que no puede mostrar la
// direccion de cobro no sirve de nada.
//
// Se valida modulo a modulo contra la implementacion de referencia (ver
// qr.prueba.mjs). No basta con que "parezca un QR": un solo bit mal puesto en
// los datos hace que el telefono no lo lea, y eso no se ve mirando.

const QR = (() => {
  // Numero de bloques y de bytes de correccion por version, para el nivel M.
  // [total de palabras, correccion por bloque, bloques grupo1, bloques grupo2]
  const VER = {
    1:  [26,   10, 1, 0],  2:  [44,   16, 1, 0],  3:  [70,   26, 1, 0],
    4:  [100,  18, 2, 0],  5:  [134,  24, 2, 0],  6:  [172,  16, 4, 0],
    7:  [196,  18, 4, 0],  8:  [242,  22, 2, 2],  9:  [292,  22, 3, 2],
    10: [346,  26, 4, 1],  11: [404,  30, 1, 4],  12: [466,  22, 6, 2],
    13: [532,  22, 8, 1],  14: [581,  24, 4, 5],  15: [655,  24, 5, 5],
  };
  // Donde van los patrones de alineacion en cada version.
  const ALIN = {
    1: [], 2: [6,18], 3: [6,22], 4: [6,26], 5: [6,30], 6: [6,34],
    7: [6,22,38], 8: [6,24,42], 9: [6,26,46], 10: [6,28,50],
    11: [6,30,54], 12: [6,32,58], 13: [6,34,62], 14: [6,26,46,66], 15: [6,26,48,70],
  };

  // ── Aritmetica del cuerpo de Galois GF(256) ────────────────────────────────
  // La correccion de errores de Reed-Solomon vive aqui: multiplicar es sumar
  // logaritmos, y por eso se precalculan las dos tablas.
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11d;      // polinomio primitivo del estandar
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  function generador(grado) {
    let g = [1];
    for (let i = 0; i < grado; i++) {
      const n = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        n[j] ^= g[j];
        n[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = n;
    }
    return g;
  }

  function correccion(datos, n) {
    const g = generador(n);
    const r = new Array(datos.length + n).fill(0);
    datos.forEach((d, i) => { r[i] = d; });
    for (let i = 0; i < datos.length; i++) {
      const c = r[i];
      if (!c) continue;
      for (let j = 0; j < g.length; j++) r[i + j] ^= mul(g[j], c);
    }
    return r.slice(datos.length);
  }

  // ── Los datos ──────────────────────────────────────────────────────────────
  function bits(texto, version) {
    const bytes = new TextEncoder().encode(texto);
    const [total, ecc, g1, g2] = VER[version];
    const capacidad = total - ecc * (g1 + g2);
    const cuenta = version < 10 ? 8 : 16;      // el contador crece con la version
    const b = [];
    const empujar = (v, n) => { for (let i = n - 1; i >= 0; i--) b.push((v >> i) & 1); };
    empujar(0b0100, 4);                        // modo byte
    empujar(bytes.length, cuenta);
    bytes.forEach(x => empujar(x, 8));
    // Terminador y relleno hasta llenar la capacidad.
    for (let i = 0; i < 4 && b.length < capacidad * 8; i++) b.push(0);
    while (b.length % 8) b.push(0);
    const pal = [];
    for (let i = 0; i < b.length; i += 8) pal.push(parseInt(b.slice(i, i + 8).join(''), 2));
    const RELLENO = [0xec, 0x11];
    for (let i = 0; pal.length < capacidad; i++) pal.push(RELLENO[i % 2]);
    return pal;
  }

  function entrelazar(pal, version) {
    const [total, ecc, g1, g2] = VER[version];
    const bloques = g1 + g2;
    const capacidad = total - ecc * bloques;
    const corto = Math.floor(capacidad / bloques);
    // Los bloques largos llevan un byte mas y van al final: es lo que permite
    // repartir datos que no dividen exacto entre los bloques.
    const datos = [], codigos = [];
    let p = 0;
    for (let i = 0; i < bloques; i++) {
      const largo = i < g1 ? corto : corto + 1;
      const d = pal.slice(p, p + largo); p += largo;
      datos.push(d); codigos.push(correccion(d, ecc));
    }
    const salida = [];
    for (let i = 0; i < corto + 1; i++)
      for (const d of datos) if (i < d.length) salida.push(d[i]);
    for (let i = 0; i < ecc; i++)
      for (const c of codigos) salida.push(c[i]);
    return salida;
  }

  // ── La retícula ────────────────────────────────────────────────────────────
  function armar(version, palabras, mascara) {
    const n = version * 4 + 17;
    const m = Array.from({ length: n }, () => new Array(n).fill(null));
    const fijo = Array.from({ length: n }, () => new Array(n).fill(false));
    const poner = (y, x, v) => { if (y >= 0 && y < n && x >= 0 && x < n) { m[y][x] = v; fijo[y][x] = true; } };

    // Los tres ojos de las esquinas, con su marco blanco.
    for (const [oy, ox] of [[0, 0], [0, n - 7], [n - 7, 0]])
      for (let y = -1; y <= 7; y++)
        for (let x = -1; x <= 7; x++) {
          const dentro = y >= 0 && y < 7 && x >= 0 && x < 7;
          const anillo = dentro && (y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4));
          poner(oy + y, ox + x, dentro ? (anillo ? 1 : 0) : 0);
        }

    // Los cuadrados de alineacion, salvo donde chocan con los ojos.
    const al = ALIN[version];
    for (const cy of al) for (const cx of al) {
      if ((cy < 8 && cx < 8) || (cy < 8 && cx > n - 9) || (cy > n - 9 && cx < 8)) continue;
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++)
        poner(cy + y, cx + x, (Math.abs(y) === 2 || Math.abs(x) === 2 || (y === 0 && x === 0)) ? 1 : 0);
    }

    // Las dos reglas punteadas que dan la escala.
    for (let i = 8; i < n - 8; i++) { poner(6, i, i % 2 === 0 ? 1 : 0); poner(i, 6, i % 2 === 0 ? 1 : 0); }
    poner(n - 8, 8, 1);                        // el modulo que siempre esta oscuro

    // A partir de la version 7 el codigo lleva ademas su propio numero de
    // version escrito dos veces, en dos bloques de 3×6. Sin esto el area queda
    // libre y los datos se meten dentro: la prueba lo enseño como un corte
    // limpio — de la 1 a la 6 todo exacto, de la 7 en adelante nada.
    if (version >= 7) {
      let d = version << 12;
      for (let i = 5; i >= 0; i--) if (d & (1 << (i + 12))) d ^= 0b1111100100101 << i;
      const vi = (version << 12) | d;
      for (let i = 0; i < 18; i++) {
        const bit = (vi >> i) & 1;
        poner(Math.floor(i / 3), n - 11 + (i % 3), bit);
        poner(n - 11 + (i % 3), Math.floor(i / 3), bit);
      }
    }

    // Sitio reservado para el formato (se rellena al final).
    for (let i = 0; i < 9; i++) { if (m[8][i] === null) poner(8, i, 0); if (m[i][8] === null) poner(i, 8, 0); }
    for (let i = 0; i < 8; i++) { poner(8, n - 1 - i, 0); poner(n - 1 - i, 8, 0); }

    // Los datos, en zigzag desde abajo a la derecha, saltando lo ya ocupado.
    let bit = 0, arriba = true;
    const flujo = [];
    palabras.forEach(p => { for (let i = 7; i >= 0; i--) flujo.push((p >> i) & 1); });
    for (let col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;                    // la columna de la regla no cuenta
      for (let f = 0; f < n; f++) {
        const y = arriba ? n - 1 - f : f;
        for (const x of [col, col - 1]) {
          if (fijo[y][x]) continue;
          let v = bit < flujo.length ? flujo[bit++] : 0;
          if (enmascarar(mascara, y, x)) v ^= 1;
          m[y][x] = v;
        }
      }
      arriba = !arriba;
    }

    formato(m, n, mascara);
    return m;
  }

  function enmascarar(k, y, x) {
    switch (k) {
      case 0: return (y + x) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (y + x) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return ((y * x) % 2) + ((y * x) % 3) === 0;
      case 6: return (((y * x) % 2) + ((y * x) % 3)) % 2 === 0;
      default: return (((y + x) % 2) + ((y * x) % 3)) % 2 === 0;
    }
  }

  function formato(m, n, mascara) {
    // Nivel M = 00, seguido de los tres bits de la mascara, con su correccion
    // BCH y un XOR fijo que evita que un codigo valido quede todo en blanco.
    const v = (0b00 << 3) | mascara;
    let d = v << 10;
    for (let i = 4; i >= 0; i--) if (d & (1 << (i + 10))) d ^= 0b10100110111 << i;
    const f = ((v << 10) | d) ^ 0b101010000010010;

    // Las quince posiciones de cada copia, en orden del bit mas significativo
    // al menos. Van escritas a mano y no calculadas con bucles porque la
    // secuencia salta el modulo de la regla y el que siempre esta oscuro: los
    // bucles "casi" aciertan, y aqui casi significa ocho modulos mal puestos.
    const copia1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
                    [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    const copia2 = [[n-1,8],[n-2,8],[n-3,8],[n-4,8],[n-5,8],[n-6,8],[n-7,8],
                    [8,n-8],[8,n-7],[8,n-6],[8,n-5],[8,n-4],[8,n-3],[8,n-2],[8,n-1]];
    for (let i = 0; i < 15; i++) {
      const bit = (f >> (14 - i)) & 1;
      m[copia1[i][0]][copia1[i][1]] = bit;
      m[copia2[i][0]][copia2[i][1]] = bit;
    }
    m[n - 8][8] = 1;                           // el modulo que siempre esta oscuro
  }


  // La mascara se elige midiendo: el estandar puntua cuatro defectos y gana la
  // que menos suma. Elegir una fija funciona casi siempre, y "casi" es
  // exactamente lo que no se quiere en el codigo que cobra.
  function castigo(m) {
    const n = m.length; let p = 0;
    for (let y = 0; y < n; y++) for (const eje of [0, 1]) {
      let run = 1;
      for (let x = 1; x < n; x++) {
        const a = eje ? m[x][y] : m[y][x], b = eje ? m[x - 1][y] : m[y][x - 1];
        if (a === b) { run++; } else { if (run >= 5) p += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) p += 3 + (run - 5);
    }
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
      const s = m[y][x] + m[y][x + 1] + m[y + 1][x] + m[y + 1][x + 1];
      if (s === 0 || s === 4) p += 3;
    }
    const PAT = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], REV = PAT.slice().reverse();
    for (let y = 0; y < n; y++) for (let x = 0; x <= n - 11; x++) {
      let h = true, hr = true, v = true, vr = true;
      for (let i = 0; i < 11; i++) {
        if (m[y][x + i] !== PAT[i]) h = false;
        if (m[y][x + i] !== REV[i]) hr = false;
        if (m[x + i][y] !== PAT[i]) v = false;
        if (m[x + i][y] !== REV[i]) vr = false;
      }
      if (h) p += 40; if (hr) p += 40; if (v) p += 40; if (vr) p += 40;
    }
    let osc = 0; for (const f of m) for (const c of f) osc += c;
    p += Math.floor(Math.abs(osc * 100 / (n * n) - 50) / 5) * 10;
    return p;
  }

  function matriz(texto) {
    const bytes = new TextEncoder().encode(texto).length;
    let version = 0;
    for (let v = 1; v <= 15; v++) {
      const [total, ecc, g1, g2] = VER[v];
      const cabecera = 4 + (v < 10 ? 8 : 16);          // modo + contador
      const cap = Math.floor(((total - ecc * (g1 + g2)) * 8 - cabecera) / 8);
      if (bytes <= cap) { version = v; break; }
    }
    if (!version) throw new Error('el texto no cabe en un QR');
    const palabras = entrelazar(bits(texto, version), version);
    let mejor = null, mejorP = Infinity;
    for (let k = 0; k < 8; k++) {
      const m = armar(version, palabras, k), p = castigo(m);
      if (p < mejorP) { mejorP = p; mejor = m; }
    }
    return mejor;
  }

  /** Dibuja el QR como un SVG. Sin imagenes ni canvas: escala a cualquier tamaño. */
  function svg(texto, { claro = '#fff', oscuro = '#000', margen = 4, radio = 0 } = {}) {
    const m = matriz(texto), n = m.length, lado = n + margen * 2;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
      if (m[y][x]) d += `M${x + margen} ${y + margen}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges" width="100%" height="100%" style="display:block;aspect-ratio:1">`
      + `<rect width="${lado}" height="${lado}" fill="${claro}"${radio ? ` rx="${radio}"` : ''}/>`
      + `<path d="${d}" fill="${oscuro}"/></svg>`;
  }

  // Las piezas internas quedan expuestas para que la prueba pueda comparar
  // mascara por mascara contra la referencia: sin eso solo se sabe QUE falla.
  return { matriz, svg, _piezas: { armar, entrelazar, bits, castigo } };
})();

if (typeof module !== 'undefined') module.exports = QR;

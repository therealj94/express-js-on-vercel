/**
 * Generador de códigos QR, lo justo para el segundo factor.
 *
 * POR QUE ESTA ESCRITO Y NO TRAIDO
 *
 * El panel no puede cargar nada de un CDN, y meter un paquete de terceros en la
 * pagina donde un operador escribe su contrasena tiene un coste que no compensa
 * para dibujar unos cuadrados. Ademas hace falta UN solo caso: modo byte,
 * correccion M, que es lo que esperan todas las aplicaciones de autenticacion.
 *
 * COMO SE COMPROBO QUE ESTA BIEN
 *
 * Un QR mal hecho es peor que ninguno: no falla, simplemente el telefono no lee
 * nada y nadie sabe por que. Asi que no se dio por bueno mirandolo. La prueba
 * `qr.test.mjs` genera la matriz con esto y la compara CUADRO POR CUADRO contra
 * la que produce la biblioteca `qrcode` de Python, que es una implementacion
 * independiente. Si difiere un solo modulo, la prueba se pone en rojo.
 *
 * Cubre versiones 1 a 10 con correccion M, de sobra para una direccion
 * `otpauth://` (la nuestra ocupa version 8).
 */

;(function (raiz) {
  'use strict'

  // ───────────────────────────────────────────────────────────────────────────
  // Aritmetica del cuerpo de Galois GF(256), que es donde vive la correccion
  // de errores Reed-Solomon del QR.
  // ───────────────────────────────────────────────────────────────────────────

  var EXP = new Uint8Array(512)
  var LOG = new Uint8Array(256)
  ;(function () {
    var x = 1
    for (var i = 0; i < 255; i++) {
      EXP[i] = x
      LOG[x] = i
      x <<= 1
      // 0x11d es el polinomio que fija la norma para el QR.
      if (x & 0x100) x ^= 0x11d
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255]
  })()

  function mul(a, b) {
    if (a === 0 || b === 0) return 0
    return EXP[LOG[a] + LOG[b]]
  }

  /** El polinomio generador para `grado` bytes de correccion. */
  function generador(grado) {
    var p = [1]
    for (var i = 0; i < grado; i++) {
      var q = new Array(p.length + 1).fill(0)
      for (var j = 0; j < p.length; j++) {
        q[j] ^= p[j]
        q[j + 1] ^= mul(p[j], EXP[i])
      }
      p = q
    }
    return p
  }

  /** Los bytes de correccion de un bloque de datos. */
  function correccion(datos, grado) {
    var g = generador(grado)
    var resto = new Array(datos.length + grado).fill(0)
    for (var i = 0; i < datos.length; i++) resto[i] = datos[i]
    for (var k = 0; k < datos.length; k++) {
      var coef = resto[k]
      if (coef === 0) continue
      for (var j = 0; j < g.length; j++) resto[k + j] ^= mul(g[j], coef)
    }
    return resto.slice(datos.length)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tablas de la norma, para correccion M y versiones 1 a 10
  // ───────────────────────────────────────────────────────────────────────────

  /** Cuantos bytes de datos caben, por version. */
  var CAPACIDAD_M = [0, 16, 28, 44, 64, 86, 108, 124, 154, 182, 216]

  /** [bytes de correccion por bloque, bloques grupo 1, bloques grupo 2]. */
  var BLOQUES_M = [
    null,
    [10, 1, 0], [16, 1, 0], [26, 1, 0], [18, 2, 0], [24, 2, 0],
    [16, 4, 0], [18, 4, 0], [22, 2, 2], [22, 3, 2], [26, 4, 1],
  ]

  /** Donde van los patrones de alineacion, por version. */
  var ALINEACION = [
    [], [], [6, 18], [6, 22], [6, 26], [6, 30],
    [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  ]

  // ───────────────────────────────────────────────────────────────────────────
  // El dibujo
  // ───────────────────────────────────────────────────────────────────────────

  function nuevaMatriz(lado) {
    var m = []
    for (var i = 0; i < lado; i++) m.push(new Array(lado).fill(null))
    return m
  }

  function ponerBuscador(m, fila, col) {
    for (var r = -1; r <= 7; r++) {
      for (var c = -1; c <= 7; c++) {
        var y = fila + r, x = col + c
        if (y < 0 || y >= m.length || x < 0 || x >= m.length) continue
        var dentro = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        m[y][x] = dentro ? 1 : 0
      }
    }
  }

  function ponerAlineacion(m, version) {
    var pts = ALINEACION[version]
    for (var a = 0; a < pts.length; a++) {
      for (var b = 0; b < pts.length; b++) {
        var fila = pts[a], col = pts[b]
        // Los tres que chocan con los buscadores no se dibujan.
        if (m[fila][col] !== null) continue
        for (var r = -2; r <= 2; r++) {
          for (var c = -2; c <= 2; c++) {
            m[fila + r][col + c] =
              (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) ? 1 : 0
          }
        }
      }
    }
  }

  function ponerTiempo(m) {
    for (var i = 8; i < m.length - 8; i++) {
      var v = i % 2 === 0 ? 1 : 0
      if (m[6][i] === null) m[6][i] = v
      if (m[i][6] === null) m[i][6] = v
    }
  }

  /** Los quince bits que dicen nivel de correccion y mascara. */
  function bitsFormato(mascara) {
    // 0b00 es el nivel M en la codificacion de la norma.
    var datos = (0 << 3) | mascara
    var v = datos << 10
    for (var i = 14; i >= 10; i--) {
      if ((v >> i) & 1) v ^= 0x537 << (i - 10)
    }
    return ((datos << 10) | v) ^ 0x5412
  }

  function ponerFormato(m, mascara) {
    var bits = bitsFormato(mascara)
    var n = m.length
    for (var i = 0; i < 15; i++) {
      var bit = (bits >> i) & 1
      // Copia de arriba a la izquierda.
      if (i < 6) m[i][8] = bit
      else if (i < 8) m[i + 1][8] = bit
      else if (i === 8) m[8][7] = bit
      else m[8][14 - i] = bit
      // Copia repartida entre las otras dos esquinas.
      if (i < 8) m[8][n - 1 - i] = bit
      else m[n - 7 + (i - 8)][8] = bit
    }
    // El modulo oscuro, que siempre esta encendido.
    m[n - 8][8] = 1
  }

  /** Los dieciocho bits de version, solo a partir de la 7. */
  function ponerVersion(m, version) {
    if (version < 7) return
    var v = version << 12
    for (var i = 17; i >= 12; i--) {
      if ((v >> i) & 1) v ^= 0x1f25 << (i - 12)
    }
    var bits = (version << 12) | v
    var n = m.length
    for (var i2 = 0; i2 < 18; i2++) {
      var bit = (bits >> i2) & 1
      m[Math.floor(i2 / 3)][n - 11 + (i2 % 3)] = bit
      m[n - 11 + (i2 % 3)][Math.floor(i2 / 3)] = bit
    }
  }

  function mascaraDe(patron, fila, col) {
    switch (patron) {
      case 0: return (fila + col) % 2 === 0
      case 1: return fila % 2 === 0
      case 2: return col % 3 === 0
      case 3: return (fila + col) % 3 === 0
      case 4: return (Math.floor(fila / 2) + Math.floor(col / 3)) % 2 === 0
      case 5: return ((fila * col) % 2) + ((fila * col) % 3) === 0
      case 6: return (((fila * col) % 2) + ((fila * col) % 3)) % 2 === 0
      default: return (((fila + col) % 2) + ((fila * col) % 3)) % 2 === 0
    }
  }

  /** La penalizacion de la norma. La mascara buena es la que saca menos. */
  function castigo(m) {
    var n = m.length, total = 0, i, j

    // Regla 1: rachas de cinco o mas del mismo color.
    for (i = 0; i < n; i++) {
      for (var eje = 0; eje < 2; eje++) {
        var racha = 1
        for (j = 1; j < n; j++) {
          var a = eje ? m[j][i] : m[i][j]
          var b = eje ? m[j - 1][i] : m[i][j - 1]
          if (a === b) { racha++ } else {
            if (racha >= 5) total += 3 + (racha - 5)
            racha = 1
          }
        }
        if (racha >= 5) total += 3 + (racha - 5)
      }
    }

    // Regla 2: cuadrados de dos por dos del mismo color.
    for (i = 0; i < n - 1; i++) {
      for (j = 0; j < n - 1; j++) {
        var v = m[i][j]
        if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) total += 3
      }
    }

    // Regla 3: el patron que se confunde con un buscador.
    var p1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]
    var p2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
    for (i = 0; i < n; i++) {
      for (j = 0; j + 11 <= n; j++) {
        var iguales1 = true, iguales2 = true, iguales3 = true, iguales4 = true
        for (var k = 0; k < 11; k++) {
          if (m[i][j + k] !== p1[k]) iguales1 = false
          if (m[i][j + k] !== p2[k]) iguales2 = false
          if (m[j + k][i] !== p1[k]) iguales3 = false
          if (m[j + k][i] !== p2[k]) iguales4 = false
        }
        if (iguales1) total += 40
        if (iguales2) total += 40
        if (iguales3) total += 40
        if (iguales4) total += 40
      }
    }

    // Regla 4: lo lejos que queda del cincuenta por ciento de oscuros.
    var oscuros = 0
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) if (m[i][j]) oscuros++
    var porciento = (oscuros * 100) / (n * n)
    total += Math.floor(Math.abs(porciento - 50) / 5) * 10

    return total
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Lo que se usa desde fuera
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * La matriz de un QR: `matriz[fila][columna]`, 1 oscuro y 0 claro.
   * Sin margen: el margen lo pone quien dibuja.
   */
  function matriz(texto) {
    // A bytes en UTF-8.
    var bytes = []
    var cod = unescape(encodeURIComponent(String(texto)))
    for (var i = 0; i < cod.length; i++) bytes.push(cod.charCodeAt(i))

    // La version mas chica donde quepa. El contador de longitud ocupa un byte
    // hasta la version 9 y dos desde la 10, y eso cambia lo que cabe.
    var version = 0
    for (var v = 1; v <= 10; v++) {
      /* En BITS, no en bytes: son 4 de modo mas 8 de contador (16 desde la
         version 10). Calcularlo en bytes redondeaba hacia arriba y elegia una
         version mas grande de la cuenta, que sigue siendo un QR legible pero
         no es el que produce cualquier otra implementacion. */
      var cabecera = 4 + (v < 10 ? 8 : 16)
      if (cabecera + bytes.length * 8 <= CAPACIDAD_M[v] * 8) { version = v; break }
    }
    if (!version) throw new Error('El texto no cabe en un QR de version 10')

    var lado = 17 + version * 4
    var bloque = BLOQUES_M[version]
    var porBloque = bloque[0], g1 = bloque[1], g2 = bloque[2]
    var totalDatos = CAPACIDAD_M[version]

    // ── Los bits: modo byte (0100), longitud, datos, relleno.
    var bits = []
    function meter(valor, cuantos) {
      for (var b = cuantos - 1; b >= 0; b--) bits.push((valor >> b) & 1)
    }
    meter(4, 4)
    meter(bytes.length, version < 10 ? 8 : 16)
    for (var k = 0; k < bytes.length; k++) meter(bytes[k], 8)

    // Terminador de hasta cuatro ceros, y despues hasta completar el byte.
    var faltan = totalDatos * 8 - bits.length
    meter(0, Math.min(4, faltan))
    while (bits.length % 8 !== 0) bits.push(0)

    var datos = []
    for (var b2 = 0; b2 < bits.length; b2 += 8) {
      var byte = 0
      for (var q = 0; q < 8; q++) byte = (byte << 1) | bits[b2 + q]
      datos.push(byte)
    }
    // Relleno de la norma: 0xEC y 0x11 alternados.
    var relleno = [0xec, 0x11], r = 0
    while (datos.length < totalDatos) datos.push(relleno[r++ % 2])

    // ── Repartir en bloques. El segundo grupo lleva un byte mas por bloque.
    var totalBloques = g1 + g2
    var porBloqueG1 = Math.floor(totalDatos / totalBloques)
    var bloquesDatos = [], bloquesEcc = [], pos = 0
    for (var nb = 0; nb < totalBloques; nb++) {
      var cuantos = porBloqueG1 + (nb >= g1 ? 1 : 0)
      var trozo = datos.slice(pos, pos + cuantos)
      pos += cuantos
      bloquesDatos.push(trozo)
      bloquesEcc.push(correccion(trozo, porBloque))
    }

    // ── Entrelazar, que es como la norma reparte los bytes.
    var finales = []
    var masLargo = Math.max.apply(null, bloquesDatos.map(function (x) { return x.length }))
    for (var c = 0; c < masLargo; c++) {
      for (var nb2 = 0; nb2 < totalBloques; nb2++) {
        if (c < bloquesDatos[nb2].length) finales.push(bloquesDatos[nb2][c])
      }
    }
    for (var c2 = 0; c2 < porBloque; c2++) {
      for (var nb3 = 0; nb3 < totalBloques; nb3++) finales.push(bloquesEcc[nb3][c2])
    }

    // ── El dibujo: primero lo fijo, despues los datos en zigzag.
    var base = nuevaMatriz(lado)
    ponerBuscador(base, 0, 0)
    ponerBuscador(base, 0, lado - 7)
    ponerBuscador(base, lado - 7, 0)
    ponerAlineacion(base, version)
    ponerTiempo(base)
    // Se reserva el sitio del formato y de la version antes de soltar los datos.
    var reservada = nuevaMatriz(lado)
    for (var y = 0; y < lado; y++) for (var x = 0; x < lado; x++) reservada[y][x] = base[y][x]
    ponerFormato(reservada, 0)
    ponerVersion(reservada, version)

    var flujo = []
    for (var f = 0; f < finales.length; f++) {
      for (var bb = 7; bb >= 0; bb--) flujo.push((finales[f] >> bb) & 1)
    }

    var idx = 0, arriba = true
    for (var col = lado - 1; col > 0; col -= 2) {
      if (col === 6) col-- // la columna de tiempo se salta
      for (var paso = 0; paso < lado; paso++) {
        var fila = arriba ? lado - 1 - paso : paso
        for (var dc = 0; dc < 2; dc++) {
          var cx = col - dc
          if (reservada[fila][cx] !== null) continue
          base[fila][cx] = idx < flujo.length ? flujo[idx] : 0
          idx++
        }
      }
      arriba = !arriba
    }

    // ── La mascara: se prueban las ocho y gana la de menos castigo.
    var mejor = null, mejorCastigo = Infinity
    for (var mk = 0; mk < 8; mk++) {
      var prueba = nuevaMatriz(lado)
      for (var y2 = 0; y2 < lado; y2++) {
        for (var x2 = 0; x2 < lado; x2++) {
          var fijo = reservada[y2][x2] !== null
          prueba[y2][x2] = fijo
            ? base[y2][x2]
            : (base[y2][x2] ^ (mascaraDe(mk, y2, x2) ? 1 : 0))
        }
      }
      ponerFormato(prueba, mk)
      ponerVersion(prueba, version)
      var c3 = castigo(prueba)
      if (c3 < mejorCastigo) { mejorCastigo = c3; mejor = prueba }
    }

    return mejor
  }

  /** El QR como SVG, listo para meter en la pagina. Margen de cuatro, como manda. */
  function svg(texto, tam) {
    var m = matriz(texto)
    var n = m.length, margen = 4, total = n + margen * 2
    var d = ''
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (m[y][x]) d += 'M' + (x + margen) + ' ' + (y + margen) + 'h1v1h-1z'
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (tam || 220) +
      '" height="' + (tam || 220) + '" viewBox="0 0 ' + total + ' ' + total +
      '" shape-rendering="crispEdges" role="img" aria-label="Código QR">' +
      '<rect width="' + total + '" height="' + total + '" fill="#fff"/>' +
      '<path d="' + d + '" fill="#000"/></svg>'
  }

  raiz.QR = { matriz: matriz, svg: svg }
})(typeof globalThis !== 'undefined' ? globalThis : this)

// Las cuentas en moneda local y sus saldos.
//
// ══ QUÉ ES ESTO Y QUÉ NO ES ════════════════════════════════════════════════
//
// AuCorp no es un banco con licencia bancaria: es una FinTech bajo Regulación
// A de Próspera. La diferencia importa y no es de marketing —un banco tiene
// seguro de depósitos y ventanilla de último recurso, y esto no—, así que en
// toda la casa se dice «cuenta en moneda local», nunca «cuenta bancaria», y
// nunca «depósito asegurado». Llamarlo banco en la pantalla sería la clase de
// promesa que después no se puede cumplir.
//
// ══ POR QUÉ HAY QUE ESTAR VERIFICADO ═══════════════════════════════════════
//
// Entrar se puede sin KYC: se ve la casa, se ven las monedas, se arranca la
// verificación. Mover dinero no. No es una traba nuestra —es lo que exige
// cualquier régimen de prevención de lavado— y ponerla en la puerta del dinero
// y no en la del sitio es lo que permite que alguien mire antes de entregar
// sus papeles.

const { CuentaFiat, Usuario } = require('../models');
const { MONEDAS, moneda, aTexto, REFERENCIA } = require('../lib/monedas');
const { saldosDe, saldoDe } = require('../lib/asientos');
const { cotizar, convertir } = require('../lib/cambio');
const { limites } = require('../lib/tarifas');
const { movidoPor } = require('../lib/consumo');

/** El nombre de la cuenta de un cliente en el libro. Uno solo, en un sitio. */
const cuentaDe = (gid) => `cliente:${gid}`;

/** Enseña el saldo con las dos caras: la exacta y la de pantalla. */
const pintar = (min, cod) => ({
  minimas: min,
  texto: aTexto(min, cod),
  moneda: cod,
});

// ── GET /monedas ────────────────────────────────────────────────────────────
// Abierta: la lista de monedas no es un secreto y la web la necesita antes de
// que nadie inicie sesión.
async function monedas(req, res) {
  return res.json({
    monedas: MONEDAS.map((m) => ({
      codigo: m.c, nombre: m.n, pais: m.pais, simbolo: m.simbolo, decimales: m.dec,
    })),
    // Que esté en la lista quiere decir que el sistema sabe CONTARLA, no que
    // AuCorp pueda liquidarla en un banco de ese país. Se dice aquí para que
    // la web no lo pueda confundir sin querer.
    aviso: 'Que una moneda figure aquí significa que la plataforma la maneja; la liquidación en cada país depende del corresponsal de esa plaza.',
  });
}

// ── GET /cuentas ────────────────────────────────────────────────────────────
// Las cuentas abiertas del usuario, con su saldo derivado del libro.
async function listar(req, res) {
  try {
    const { gid } = req.usuario;
    const abiertas = await CuentaFiat.find({ gid });
    const saldos = await saldosDe(cuentaDe(gid));

    /* El total en dólares. Se calcula AQUÍ, con las tasas del servidor, y si
       a alguna moneda le falta tasa devuelve null — la pantalla pinta un guion
       en vez de un total a medias. Un total que se queda corto porque una tasa
       no llegó es peor que no enseñar total: parece un número y no lo es. */
    let total = 0n;
    let sePudo = true;
    for (const c of abiertas) {
      const min = saldos[c.moneda] || '0';
      if (min === '0') continue;
      if (c.moneda === REFERENCIA) { total += BigInt(min); continue; }
      const q = await cotizar(c.moneda, REFERENCIA);
      if (!q) { sePudo = false; break; }
      total += BigInt(convertir(min, c.moneda, REFERENCIA, q.media));
    }

    return res.json({
      cuentas: abiertas.map((c) => ({
        moneda: c.moneda,
        alias: c.alias || '',
        activa: c.activa !== false,
        creada: c.creada,
        saldo: pintar(saldos[c.moneda] || '0', c.moneda),
      })),
      // null significa «no se sabe», y se dice así en vez de mandar un cero.
      totalUsd: sePudo ? aTexto(total.toString(), REFERENCIA) : null,
      totalMoneda: REFERENCIA,
    });
  } catch (e) {
    console.error(`[cuentas] no se pudieron listar: ${e.message}`);
    return res.status(503).json({ error: 'No se pudieron leer las cuentas.', codigo: 'NO_SE_PUDO' });
  }
}

// ── POST /cuentas ───────────────────────────────────────────────────────────
// { moneda } → abre la cuenta en esa moneda. Idempotente: abrir dos veces la
// misma cuenta devuelve la que ya estaba, no un error ni una segunda cuenta.
async function abrir(req, res) {
  const cod = String(req.body?.moneda || '').toUpperCase();
  const m = moneda(cod);
  if (!m) return res.status(400).json({ error: 'Esa moneda no existe.', codigo: 'MONEDA_DESCONOCIDA' });

  try {
    const { gid } = req.usuario;
    const usuario = await Usuario.findOne({ gid });
    if (!usuario) return res.status(401).json({ error: 'La sesion no es valida.', codigo: 'SESION_INVALIDA' });
    if (usuario.verificada !== true) {
      // Fail-closed y con el motivo dicho, que aquí sí ayuda: el usuario puede
      // ir y terminar su verificación. Un «no se pudo» a secas lo dejaría sin
      // saber qué hacer.
      return res.status(403).json({
        error: 'Para abrir una cuenta hace falta terminar la verificación de identidad.',
        codigo: 'IDENTIDAD_SIN_VERIFICAR',
      });
    }

    const alias = String(req.body?.alias || '').trim().slice(0, 60);
    const cuenta = await CuentaFiat.findOneAndUpdate(
      { gid, moneda: m.c },
      { $setOnInsert: { gid, moneda: m.c, alias, activa: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.json({
      cuenta: {
        moneda: cuenta.moneda, alias: cuenta.alias || '', activa: cuenta.activa !== false,
        creada: cuenta.creada, saldo: pintar(await saldoDe(cuentaDe(gid), m.c), m.c),
      },
    });
  } catch (e) {
    if (e?.code === 11000) {
      // Dos peticiones a la vez para la misma moneda. La cuenta existe: eso es
      // exactamente lo que se pedía.
      const cuenta = await CuentaFiat.findOne({ gid: req.usuario.gid, moneda: m.c });
      if (cuenta) return res.json({ cuenta: { moneda: cuenta.moneda, alias: cuenta.alias || '', activa: true, creada: cuenta.creada } });
    }
    console.error(`[cuentas] no se pudo abrir ${cod}: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo abrir la cuenta.', codigo: 'NO_SE_PUDO' });
  }
}

// ── GET /limites ────────────────────────────────────────────────────────────
// Cuánto puede mover esta persona y cuánto lleva movido. Son datos SUYOS, y
// ocultárselos solo consigue que reintente sin entender por qué no pasa.
async function misLimites(req, res) {
  try {
    const { gid } = req.usuario;
    const usuario = await Usuario.findOne({ gid });
    if (!usuario) return res.status(401).json({ error: 'La sesion no es valida.', codigo: 'SESION_INVALIDA' });

    const nivel = usuario.nivel || 1;
    const tope = limites()[String(nivel)] || limites()['1'];
    const movido = await movidoPor(cuentaDe(gid));

    return res.json({
      nivel,
      moneda: REFERENCIA,
      // Si no se pudo medir se dice null, no cero: un cero aquí le haría creer
      // a alguien que tiene todo el cupo libre justo cuando no se sabe.
      diario: {
        usado: movido ? aTexto(movido.diario, REFERENCIA) : null,
        tope: aTexto(tope.diario, REFERENCIA),
      },
      mensual: {
        usado: movido ? aTexto(movido.mensual, REFERENCIA) : null,
        tope: aTexto(tope.mensual, REFERENCIA),
      },
      verificada: usuario.verificada === true,
    });
  } catch (e) {
    console.error(`[cuentas] no se pudieron leer los límites: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo leer.', codigo: 'NO_SE_PUDO' });
  }
}

module.exports = { monedas, listar, abrir, misLimites, cuentaDe, pintar };

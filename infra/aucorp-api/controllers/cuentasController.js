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
const { MONEDAS, moneda, aTexto } = require('../lib/monedas');
const { saldosDe, saldoDe } = require('../lib/asientos');

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

    return res.json({
      cuentas: abiertas.map((c) => ({
        moneda: c.moneda,
        alias: c.alias || '',
        activa: c.activa !== false,
        creada: c.creada,
        saldo: pintar(saldos[c.moneda] || '0', c.moneda),
      })),
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

module.exports = { monedas, listar, abrir, cuentaDe, pintar };

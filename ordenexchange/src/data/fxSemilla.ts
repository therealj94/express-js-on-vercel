// Tasas USD → moneda local con las que arranca la plataforma.
//
// Son la SEMILLA: valen el primer día y se sustituyen desde el panel
// (Precios) sin desplegar nada. Un operador debe revisarlas al poner el
// servicio en marcha; el panel enseña la fecha y la fuente junto a cada tasa.
// Para VES se usa la tasa oficial del BCV, que es la que rige en los pagos
// bancarios en bolívares.

export const FX_SEMILLA: { fecha: string; fuente: string; usd: Record<string, number> } = {
  fecha: '2026-09-19',
  fuente: 'valores aproximados incrustados en el código; actualizar desde el panel',
  usd: {
    USD: 1,
    ARS: 1450,
    BOB: 6.91,
    BRL: 5.4,
    BZD: 2.0,
    CLP: 950,
    COP: 4100,
    CRC: 510,
    DOP: 61,
    GTQ: 7.7,
    GYD: 209,
    HNL: 26.3,
    HTG: 131,
    MXN: 18.6,
    NIO: 36.8,
    PEN: 3.6,
    PYG: 7600,
    SRD: 37,
    UYU: 40,
    VES: 150,
  },
}

// Tasas USD → moneda local con las que arranca la plataforma.
//
// Son la SEMILLA: valen el primer día y se sustituyen desde el panel
// (Precios) sin desplegar nada. Un operador debe revisarlas al poner el
// servicio en marcha; el panel enseña la fecha y la fuente junto a cada tasa.
//
// Origen de los valores: https://open.er-api.com/v6/latest/USD (ExchangeRate-API,
// tasas de mercado del 2026-09-19 00:02 UTC), leído al escribir este archivo.
// VES es la tasa OFICIAL del BCV (la que rige en Pago Móvil y en las
// transferencias en bolívares), con valor del 2026-09-18 tomado de
// ve.dolarapi.com/v1/dolares/oficial (espejo del BCV; bcv.org.ve no pudo
// leerse directamente por su certificado). Sin decimales espurios: cada tasa
// se redondea a lo que la moneda de verdad distingue.
//
// Cubre TODAS las monedas de data/latam.ts (USD = 1). Si se agrega un país
// con moneda nueva, hay que agregar su tasa aquí (motor/precios.ts la toma de
// este mapa cuando el panel todavía no la ha fijado).

export const FX_SEMILLA: { fecha: string; fuente: string; usd: Record<string, number> } = {
  fecha: '2026-09-19',
  fuente: 'open.er-api.com (ExchangeRate-API) 2026-09-19 00:02 UTC; VES: tasa oficial BCV 2026-09-18 vía ve.dolarapi.com',
  usd: {
    USD: 1,
    ARS: 1512.33,   // Argentina · peso argentino
    BOB: 10.87,     // Bolivia · boliviano
    BRL: 5.1363,    // Brasil · real
    BZD: 2,         // Belice · dólar beliceño (fijo 2:1 con el USD)
    CLP: 959.64,    // Chile · peso chileno
    COP: 3127.64,   // Colombia · peso colombiano
    CRC: 448.11,    // Costa Rica · colón
    DOP: 58.88,     // República Dominicana · peso dominicano
    GTQ: 7.6376,    // Guatemala · quetzal
    GYD: 209.29,    // Guyana · dólar guyanés
    HNL: 26.8525,   // Honduras · lempira
    HTG: 130.72,    // Haití · gourde
    MXN: 17.2121,   // México · peso mexicano
    NIO: 36.778,    // Nicaragua · córdoba
    PEN: 3.3645,    // Perú · sol
    PYG: 5935.59,   // Paraguay · guaraní
    SRD: 37.848,    // Surinam · dólar surinamés
    UYU: 40.306,    // Uruguay · peso uruguayo
    VES: 848.55,    // Venezuela · bolívar (tasa oficial BCV)
  },
}

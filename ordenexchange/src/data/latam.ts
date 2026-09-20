// Latinoamérica: países, monedas, bancos y métodos de pago.
//
// Lo que la gente usa DE VERDAD para pagarse entre sí en cada país: la
// transferencia bancaria (con los bancos principales) y las billeteras que
// dominan el P2P local —PIX, Nequi, Yape, SINPE Móvil, Tigo Money, Pago Móvil,
// Mercado Pago, SPEI, Zelle, Yappy, ATH Móvil, MonCash…—. Un mismo `tipo`
// significa lo mismo en todos los países (`yape` es Yape tanto en Perú como
// en Bolivia; `tigo-money` es Tigo Money en los cinco países donde opera), y
// las claves de `campos` son las canónicas que documenta API.md: `cuenta`,
// `tipoCuenta`, `documento`, `cedula`, `clabe`, `cbu`, `cvu`, `alias`, `cci`,
// `iban`, `rut`, `cpf`, `agencia`, `llave`, `tipoLlave`, `telefono`,
// `contacto`, `ciudad`, `nota`. El documento del titular usa la clave
// `cedula` donde el documento se llama así, `rut` en Chile, `cpf` en Brasil y
// `documento` en el resto (DNI, CUIT, DPI, DUI, RFC, identidad…): la etiqueta
// cambia, la clave no.
//
// Cuba no está: Genesis ID la rechaza (sanciones integrales) y no se podría
// verificar a nadie. Ecuador, El Salvador, Panamá y Puerto Rico usan USD
// (Panamá tiene el balboa a la par, pero los pagos electrónicos van en USD).
//
// Sin dependencias. Módulo ESM, TypeScript estricto.

import { nombresBancos } from './bancos.js'

export interface CampoMetodo { clave: string; etiqueta: string; etiquetaEn: string; ejemplo?: string; obligatorio: boolean }
export interface MetodoPais {
  tipo: string
  nombre: string
  nombreEn: string
  categoria: 'banco' | 'billetera' | 'efectivo' | 'otro'
  bancos?: string[]
  campos: CampoMetodo[]
}
export interface MonedaPais { codigo: string; nombre: string; nombreEn: string; simbolo: string; decimales: number }
export interface Pais {
  iso2: string
  iso3: string
  nombre: string
  nombreEn: string
  bandera: string
  moneda: MonedaPais
  prefijoTelefono: string
  metodos: MetodoPais[]
}

// ── Campos ───────────────────────────────────────────────────────────────────

function campo(clave: string, etiqueta: string, etiquetaEn: string, obligatorio: boolean, ejemplo?: string): CampoMetodo {
  return ejemplo === undefined ? { clave, etiqueta, etiquetaEn, obligatorio } : { clave, etiqueta, etiquetaEn, ejemplo, obligatorio }
}

const cuenta = (ejemplo = '0123456789', etiqueta = 'Número de cuenta', etiquetaEn = 'Account number') =>
  campo('cuenta', etiqueta, etiquetaEn, true, ejemplo)
const cuentaOpcional = (ejemplo = '0123456789') => campo('cuenta', 'Número de cuenta', 'Account number', false, ejemplo)
const tipoCuenta = (ejemplo = 'Ahorro / Corriente') => campo('tipoCuenta', 'Tipo de cuenta', 'Account type', false, ejemplo)
/** Documento del titular con nombre local (DNI, CUIT, DPI, DUI, RFC…) pero clave canónica `documento`. */
const documento = (etiqueta: string, etiquetaEn: string, ejemplo?: string, obligatorio = false) =>
  campo('documento', etiqueta, etiquetaEn, obligatorio, ejemplo)
const cedula = (ejemplo: string, obligatorio = false) => campo('cedula', 'Cédula del titular', 'Holder ID (cédula)', obligatorio, ejemplo)
const telefono = (ejemplo: string) => campo('telefono', 'Número de teléfono', 'Phone number', true, ejemplo)
const alias = (ejemplo = 'nombre.apellido') => campo('alias', 'Alias', 'Alias', false, ejemplo)
const cvu = (obligatorio: boolean, etiqueta = 'CVU', etiquetaEn = 'CVU') => campo('cvu', etiqueta, etiquetaEn, obligatorio, '0000003100012345678901')

// ── Métodos reutilizables ────────────────────────────────────────────────────

function transferencia(bancos: string[], campos: CampoMetodo[], nombre = 'Transferencia bancaria', nombreEn = 'Bank transfer'): MetodoPais {
  return { tipo: 'transferencia', nombre, nombreEn, categoria: 'banco', bancos, campos }
}

function billetera(tipo: string, nombre: string, nombreEn: string, campos: CampoMetodo[], bancos?: string[]): MetodoPais {
  return bancos ? { tipo, nombre, nombreEn, categoria: 'billetera', bancos, campos } : { tipo, nombre, nombreEn, categoria: 'billetera', campos }
}

/** Billetera que se identifica por el número de teléfono del titular (la mayoría en la región). */
const porTelefono = (tipo: string, nombre: string, ejemploTel: string, nombreEn = nombre, extra: CampoMetodo[] = []) =>
  billetera(tipo, nombre, nombreEn, [telefono(ejemploTel), ...extra])

const zelle = () => billetera('zelle', 'Zelle', 'Zelle', [campo('contacto', 'Correo o teléfono de Zelle', 'Zelle email or phone', true, 'nombre@correo.com')])

const efectivo = (ejemploCiudad: string): MetodoPais => ({
  tipo: 'efectivo',
  nombre: 'Efectivo en persona',
  nombreEn: 'Cash in person',
  categoria: 'efectivo',
  campos: [
    campo('ciudad', 'Ciudad de encuentro', 'Meeting city', true, ejemploCiudad),
    campo('nota', 'Indicaciones', 'Instructions', false, 'Solo en lugares públicos y en horario comercial'),
  ],
})

const USD: MonedaPais = { codigo: 'USD', nombre: 'Dólar estadounidense', nombreEn: 'US dollar', simbolo: '$', decimales: 2 }

// ── Países ───────────────────────────────────────────────────────────────────

export const PAISES: Pais[] = [
  {
    iso2: 'AR', iso3: 'ARG', nombre: 'Argentina', nombreEn: 'Argentina', bandera: '🇦🇷',
    moneda: { codigo: 'ARS', nombre: 'Peso argentino', nombreEn: 'Argentine peso', simbolo: '$', decimales: 2 },
    prefijoTelefono: '+54',
    metodos: [
      transferencia(nombresBancos('AR'),
        [
          campo('cbu', 'CBU o CVU', 'CBU or CVU', true, '0070099030004012345678'),
          alias('nombre.apellido.banco'),
          cuentaOpcional('4012345678'),
          documento('CUIT/CUIL del titular', 'Holder CUIT/CUIL', '20-12345678-9'),
        ],
      ),
      billetera('mercado-pago', 'Mercado Pago', 'Mercado Pago', [campo('alias', 'Alias de Mercado Pago', 'Mercado Pago alias', true, 'nombre.apellido.mp'), cvu(false)]),
      billetera('uala', 'Ualá', 'Ualá', [cvu(true, 'CVU de Ualá', 'Ualá CVU'), alias('nombre.uala')]),
      billetera('brubank', 'Brubank', 'Brubank', [campo('cbu', 'CBU de Brubank', 'Brubank CBU', true, '0000003100012345678901'), alias('nombre.brubank')]),
      billetera('lemon', 'Lemon', 'Lemon', [cvu(true, 'CVU de Lemon', 'Lemon CVU'), alias('nombre.lemon')]),
      billetera('naranja-x', 'Naranja X', 'Naranja X', [cvu(true, 'CVU de Naranja X', 'Naranja X CVU'), alias('nombre.nx')]),
      efectivo('Buenos Aires'),
    ],
  },
  {
    iso2: 'BO', iso3: 'BOL', nombre: 'Bolivia', nombreEn: 'Bolivia', bandera: '🇧🇴',
    moneda: { codigo: 'BOB', nombre: 'Boliviano', nombreEn: 'Bolivian boliviano', simbolo: 'Bs', decimales: 2 },
    prefijoTelefono: '+591',
    metodos: [
      transferencia(nombresBancos('BO'),
        [cuenta('1234567890'), tipoCuenta('Caja de ahorro / Cuenta corriente'), cedula('1234567 LP')],
      ),
      porTelefono('tigo-money', 'Tigo Money', '+591 7 123 4567'),
      porTelefono('yape', 'Yape', '+591 7 123 4567'),
      efectivo('Santa Cruz de la Sierra'),
    ],
  },
  {
    iso2: 'BR', iso3: 'BRA', nombre: 'Brasil', nombreEn: 'Brazil', bandera: '🇧🇷',
    moneda: { codigo: 'BRL', nombre: 'Real brasileño', nombreEn: 'Brazilian real', simbolo: 'R$', decimales: 2 },
    prefijoTelefono: '+55',
    metodos: [
      billetera('pix', 'PIX', 'PIX', [
        campo('llave', 'Llave PIX', 'PIX key', true, 'correo, CPF, teléfono o llave aleatoria'),
        campo('tipoLlave', 'Tipo de llave', 'Key type', false, 'CPF / correo / teléfono / aleatoria'),
      ]),
      transferencia(nombresBancos('BR'),
        [
          campo('agencia', 'Agencia', 'Branch (agência)', true, '0001'),
          cuenta('12345-6', 'Número de cuenta (con dígito)', 'Account number (with check digit)'),
          tipoCuenta('Corrente / Poupança'),
          campo('cpf', 'CPF del titular', 'Holder CPF', true, '123.456.789-00'),
        ],
        'Transferencia bancaria (TED)', 'Bank transfer (TED)',
      ),
      efectivo('São Paulo'),
    ],
  },
  {
    iso2: 'CL', iso3: 'CHL', nombre: 'Chile', nombreEn: 'Chile', bandera: '🇨🇱',
    moneda: { codigo: 'CLP', nombre: 'Peso chileno', nombreEn: 'Chilean peso', simbolo: '$', decimales: 0 },
    prefijoTelefono: '+56',
    metodos: [
      transferencia(nombresBancos('CL'),
        [
          cuenta('12345678'),
          tipoCuenta('Cuenta RUT / Vista / Corriente'),
          campo('rut', 'RUT del titular', 'Holder RUT', true, '12.345.678-9'),
          campo('correo', 'Correo para el aviso de transferencia', 'Email for the transfer notice', false, 'nombre@correo.cl'),
        ],
      ),
      porTelefono('mach', 'MACH', '+56 9 1234 5678', 'MACH', [campo('rut', 'RUT del titular', 'Holder RUT', false, '12.345.678-9')]),
      porTelefono('tenpo', 'Tenpo', '+56 9 1234 5678', 'Tenpo', [campo('rut', 'RUT del titular', 'Holder RUT', false, '12.345.678-9')]),
      efectivo('Santiago'),
    ],
  },
  {
    iso2: 'CO', iso3: 'COL', nombre: 'Colombia', nombreEn: 'Colombia', bandera: '🇨🇴',
    moneda: { codigo: 'COP', nombre: 'Peso colombiano', nombreEn: 'Colombian peso', simbolo: '$', decimales: 2 },
    prefijoTelefono: '+57',
    metodos: [
      porTelefono('nequi', 'Nequi', '+57 310 123 4567'),
      porTelefono('daviplata', 'Daviplata', '+57 310 123 4567'),
      billetera('bre-b', 'Bre-B (llave)', 'Bre-B (key)', [campo('llave', 'Llave Bre-B', 'Bre-B key', true, '@usuario, cédula o teléfono')]),
      transferencia(nombresBancos('CO'),
        [cuenta('12345678901'), tipoCuenta('Ahorros / Corriente'), cedula('1234567890')],
      ),
      porTelefono('movii', 'Movii', '+57 310 123 4567'),
      efectivo('Bogotá'),
    ],
  },
  {
    iso2: 'CR', iso3: 'CRI', nombre: 'Costa Rica', nombreEn: 'Costa Rica', bandera: '🇨🇷',
    moneda: { codigo: 'CRC', nombre: 'Colón costarricense', nombreEn: 'Costa Rican colón', simbolo: '₡', decimales: 2 },
    prefijoTelefono: '+506',
    metodos: [
      porTelefono('sinpe-movil', 'SINPE Móvil', '+506 8888 1234'),
      transferencia(nombresBancos('CR'),
        [campo('iban', 'Cuenta IBAN', 'IBAN account', true, 'CR05015202001026284066'), cuentaOpcional('200-01-026-284066'), cedula('1-1234-5678')],
      ),
      efectivo('San José'),
    ],
  },
  {
    iso2: 'DO', iso3: 'DOM', nombre: 'República Dominicana', nombreEn: 'Dominican Republic', bandera: '🇩🇴',
    moneda: { codigo: 'DOP', nombre: 'Peso dominicano', nombreEn: 'Dominican peso', simbolo: 'RD$', decimales: 2 },
    prefijoTelefono: '+1',
    metodos: [
      transferencia(nombresBancos('DO'),
        [cuenta('789012345'), tipoCuenta('Ahorros / Corriente'), cedula('001-1234567-8')],
      ),
      zelle(),
      efectivo('Santo Domingo'),
    ],
  },
  {
    iso2: 'EC', iso3: 'ECU', nombre: 'Ecuador', nombreEn: 'Ecuador', bandera: '🇪🇨',
    moneda: USD,
    prefijoTelefono: '+593',
    metodos: [
      transferencia(nombresBancos('EC'),
        [cuenta('2200123456'), tipoCuenta('Ahorros / Corriente'), cedula('1712345678')],
      ),
      porTelefono('de-una', 'Deuna', '+593 99 123 4567'),
      efectivo('Quito'),
    ],
  },
  {
    iso2: 'SV', iso3: 'SLV', nombre: 'El Salvador', nombreEn: 'El Salvador', bandera: '🇸🇻',
    moneda: USD,
    prefijoTelefono: '+503',
    metodos: [
      transferencia(nombresBancos('SV'),
        [cuenta('00123456789'), tipoCuenta('Ahorro / Corriente'), documento('DUI del titular', 'Holder DUI', '01234567-8')],
        'Transferencia bancaria (Transfer365)', 'Bank transfer (Transfer365)',
      ),
      porTelefono('transfer365-movil', 'Transfer365 Móvil', '+503 7000 1234'),
      porTelefono('tigo-money', 'Tigo Money', '+503 7000 1234'),
      efectivo('San Salvador'),
    ],
  },
  {
    iso2: 'GT', iso3: 'GTM', nombre: 'Guatemala', nombreEn: 'Guatemala', bandera: '🇬🇹',
    moneda: { codigo: 'GTQ', nombre: 'Quetzal', nombreEn: 'Guatemalan quetzal', simbolo: 'Q', decimales: 2 },
    prefijoTelefono: '+502',
    metodos: [
      transferencia(nombresBancos('GT'),
        [cuenta('0010-2233-4455'), tipoCuenta('Monetaria / Ahorro'), documento('DPI del titular', 'Holder DPI', '1234 56789 0101')],
      ),
      porTelefono('tigo-money', 'Tigo Money', '+502 5000 1234'),
      efectivo('Ciudad de Guatemala'),
    ],
  },
  {
    iso2: 'HN', iso3: 'HND', nombre: 'Honduras', nombreEn: 'Honduras', bandera: '🇭🇳',
    moneda: { codigo: 'HNL', nombre: 'Lempira', nombreEn: 'Honduran lempira', simbolo: 'L', decimales: 2 },
    prefijoTelefono: '+504',
    metodos: [
      transferencia(nombresBancos('HN'),
        [cuenta('730012345678'), tipoCuenta('Ahorro / Cheques'), documento('Identidad del titular', 'Holder ID number', '0801-1990-12345')],
      ),
      porTelefono('tigo-money', 'Tigo Money', '+504 9988 7766'),
      efectivo('Tegucigalpa'),
    ],
  },
  {
    iso2: 'MX', iso3: 'MEX', nombre: 'México', nombreEn: 'Mexico', bandera: '🇲🇽',
    moneda: { codigo: 'MXN', nombre: 'Peso mexicano', nombreEn: 'Mexican peso', simbolo: '$', decimales: 2 },
    prefijoTelefono: '+52',
    metodos: [
      transferencia(nombresBancos('MX'),
        [
          campo('clabe', 'CLABE (18 dígitos)', 'CLABE (18 digits)', true, '012180001234567890'),
          cuentaOpcional('0123456789'),
          documento('RFC o CURP del titular', 'Holder RFC or CURP', 'PEGJ900101ABC'),
        ],
        'Transferencia bancaria (SPEI)', 'Bank transfer (SPEI)',
      ),
      billetera('mercado-pago', 'Mercado Pago', 'Mercado Pago', [campo('clabe', 'CLABE de Mercado Pago', 'Mercado Pago CLABE', true, '722969000000000000'), alias('nombre.mp')]),
      {
        tipo: 'oxxo', nombre: 'Depósito en OXXO', nombreEn: 'OXXO cash deposit', categoria: 'otro',
        bancos: ['BBVA México', 'Banamex', 'Santander México', 'Banorte', 'HSBC México', 'Scotiabank México', 'Inbursa', 'Afirme', 'Banco Azteca', 'Spin by OXXO'],
        campos: [campo('tarjeta', 'Número de tarjeta de débito (16 dígitos)', 'Debit card number (16 digits)', true, '4152 3130 1234 5678')],
      },
      efectivo('Ciudad de México'),
    ],
  },
  {
    iso2: 'NI', iso3: 'NIC', nombre: 'Nicaragua', nombreEn: 'Nicaragua', bandera: '🇳🇮',
    moneda: { codigo: 'NIO', nombre: 'Córdoba', nombreEn: 'Nicaraguan córdoba', simbolo: 'C$', decimales: 2 },
    prefijoTelefono: '+505',
    metodos: [
      transferencia(nombresBancos('NI'),
        [cuenta('10012345678901'), tipoCuenta('Ahorro / Corriente'), cedula('001-010190-0001A')],
      ),
      porTelefono('billetera-movil', 'Billetera Móvil Banpro', '+505 8888 1234', 'Banpro Billetera Móvil'),
      efectivo('Managua'),
    ],
  },
  {
    iso2: 'PA', iso3: 'PAN', nombre: 'Panamá', nombreEn: 'Panama', bandera: '🇵🇦',
    moneda: USD,
    prefijoTelefono: '+507',
    metodos: [
      porTelefono('yappy', 'Yappy', '+507 6000 1234'),
      transferencia(nombresBancos('PA'),
        [cuenta('04-12-34-567890-1'), tipoCuenta('Ahorros / Corriente'), cedula('8-123-4567')],
      ),
      porTelefono('nequi', 'Nequi Panamá', '+507 6000 1234', 'Nequi Panama'),
      zelle(),
      efectivo('Ciudad de Panamá'),
    ],
  },
  {
    iso2: 'PY', iso3: 'PRY', nombre: 'Paraguay', nombreEn: 'Paraguay', bandera: '🇵🇾',
    moneda: { codigo: 'PYG', nombre: 'Guaraní', nombreEn: 'Paraguayan guaraní', simbolo: '₲', decimales: 0 },
    prefijoTelefono: '+595',
    metodos: [
      transferencia(nombresBancos('PY'),
        [cuenta('1234567890'), tipoCuenta('Caja de ahorro / Cuenta corriente'), cedula('1234567')],
      ),
      porTelefono('tigo-money', 'Tigo Money', '+595 981 123 456'),
      porTelefono('personal-pay', 'Personal Pay', '+595 971 123 456'),
      porTelefono('zimple', 'Zimple', '+595 981 123 456'),
      efectivo('Asunción'),
    ],
  },
  {
    iso2: 'PE', iso3: 'PER', nombre: 'Perú', nombreEn: 'Peru', bandera: '🇵🇪',
    moneda: { codigo: 'PEN', nombre: 'Sol', nombreEn: 'Peruvian sol', simbolo: 'S/', decimales: 2 },
    prefijoTelefono: '+51',
    metodos: [
      porTelefono('yape', 'Yape', '+51 987 654 321'),
      porTelefono('plin', 'Plin', '+51 987 654 321'),
      transferencia(nombresBancos('PE'),
        [
          cuenta('19312345678012'),
          campo('cci', 'CCI (código de cuenta interbancario)', 'CCI (interbank account code)', true, '00219300123456789012'),
          tipoCuenta('Ahorros / Corriente'),
          documento('DNI del titular', 'Holder DNI', '12345678'),
        ],
      ),
      efectivo('Lima'),
    ],
  },
  {
    iso2: 'PR', iso3: 'PRI', nombre: 'Puerto Rico', nombreEn: 'Puerto Rico', bandera: '🇵🇷',
    moneda: USD,
    prefijoTelefono: '+1',
    metodos: [
      porTelefono('ath-movil', 'ATH Móvil', '+1 787 555 1234'),
      transferencia(nombresBancos('PR'),
        [cuenta('123456789'), campo('ruta', 'Número de ruta (ABA)', 'Routing number (ABA)', true, '021502011'), tipoCuenta('Checking / Savings')],
      ),
      zelle(),
      efectivo('San Juan'),
    ],
  },
  {
    iso2: 'UY', iso3: 'URY', nombre: 'Uruguay', nombreEn: 'Uruguay', bandera: '🇺🇾',
    moneda: { codigo: 'UYU', nombre: 'Peso uruguayo', nombreEn: 'Uruguayan peso', simbolo: '$U', decimales: 2 },
    prefijoTelefono: '+598',
    metodos: [
      transferencia(nombresBancos('UY'),
        [cuenta('001234567-00001'), campo('sucursal', 'Sucursal', 'Branch', false, '198'), tipoCuenta('Caja de ahorro / Cuenta corriente'), cedula('1.234.567-8')],
      ),
      porTelefono('prex', 'Prex', '+598 99 123 456'),
      porTelefono('mi-dinero', 'Mi Dinero', '+598 99 123 456'),
      efectivo('Montevideo'),
    ],
  },
  {
    iso2: 'VE', iso3: 'VEN', nombre: 'Venezuela', nombreEn: 'Venezuela', bandera: '🇻🇪',
    moneda: { codigo: 'VES', nombre: 'Bolívar', nombreEn: 'Venezuelan bolívar', simbolo: 'Bs', decimales: 2 },
    prefijoTelefono: '+58',
    metodos: [
      billetera('pago-movil', 'Pago Móvil', 'Pago Móvil', [telefono('+58 412 555 9876'), cedula('V-12345678', true)], nombresBancos('VE')),
      transferencia(nombresBancos('VE'), [
        cuenta('01020123456789012345', 'Número de cuenta (20 dígitos)', 'Account number (20 digits)'),
        tipoCuenta('Ahorro / Corriente'),
        cedula('V-12345678', true),
      ]),
      zelle(),
      efectivo('Caracas'),
    ],
  },
  {
    iso2: 'BZ', iso3: 'BLZ', nombre: 'Belice', nombreEn: 'Belize', bandera: '🇧🇿',
    moneda: { codigo: 'BZD', nombre: 'Dólar beliceño', nombreEn: 'Belize dollar', simbolo: 'BZ$', decimales: 2 },
    prefijoTelefono: '+501',
    metodos: [
      transferencia(nombresBancos('BZ'),
        [cuenta('123456789'), tipoCuenta('Savings / Chequing'), documento('Número de Seguro Social del titular', 'Holder Social Security number', '000123456')],
      ),
      porTelefono('digi-wallet', 'DigiWallet', '+501 600 1234'),
      porTelefono('e-kyash', 'E-Kyash', '+501 600 1234'),
      efectivo('Belize City'),
    ],
  },
  {
    iso2: 'HT', iso3: 'HTI', nombre: 'Haití', nombreEn: 'Haiti', bandera: '🇭🇹',
    moneda: { codigo: 'HTG', nombre: 'Gourde', nombreEn: 'Haitian gourde', simbolo: 'G', decimales: 2 },
    prefijoTelefono: '+509',
    metodos: [
      porTelefono('moncash', 'MonCash', '+509 3612 3456'),
      porTelefono('natcash', 'NatCash', '+509 3612 3456'),
      transferencia(nombresBancos('HT'),
        [cuenta('1234567890'), tipoCuenta('Épargne / Courant'), documento('NIF o CIN del titular', 'Holder NIF or CIN', '003-123-456-7')],
      ),
      efectivo('Port-au-Prince'),
    ],
  },
  {
    iso2: 'GY', iso3: 'GUY', nombre: 'Guyana', nombreEn: 'Guyana', bandera: '🇬🇾',
    moneda: { codigo: 'GYD', nombre: 'Dólar guyanés', nombreEn: 'Guyanese dollar', simbolo: 'G$', decimales: 2 },
    prefijoTelefono: '+592',
    metodos: [
      transferencia(nombresBancos('GY'),
        [cuenta('1234567890'), tipoCuenta('Savings / Chequing'), documento('Número de identificación nacional del titular', 'Holder national ID number', '123456789')],
      ),
      porTelefono('mmg', 'MMG (Mobile Money Guyana)', '+592 600 1234', 'MMG (Mobile Money Guyana)'),
      efectivo('Georgetown'),
    ],
  },
  {
    iso2: 'SR', iso3: 'SUR', nombre: 'Surinam', nombreEn: 'Suriname', bandera: '🇸🇷',
    moneda: { codigo: 'SRD', nombre: 'Dólar surinamés', nombreEn: 'Surinamese dollar', simbolo: 'Sr$', decimales: 2 },
    prefijoTelefono: '+597',
    metodos: [
      transferencia(nombresBancos('SR'),
        [cuenta('1234567890'), tipoCuenta('Spaar / Giro'), documento('Número de identificación del titular', 'Holder ID number', 'AB123456')],
      ),
      porTelefono('uni5pay', 'Uni5Pay+', '+597 800 1234'),
      efectivo('Paramaribo'),
    ],
  },
]

// ── Ayudantes ────────────────────────────────────────────────────────────────

/** País por ISO2, insensible a mayúsculas y espacios («hn», « HN » → Honduras). */
export function pais(iso2: string): Pais | undefined {
  const k = String(iso2 ?? '').trim().toUpperCase()
  return PAISES.find((p) => p.iso2 === k)
}

/** Todos los países que usan una moneda: `paisPorMoneda('USD')` devuelve EC, SV, PA y PR. */
export function paisPorMoneda(codigo: string): Pais[] {
  const k = String(codigo ?? '').trim().toUpperCase()
  return PAISES.filter((p) => p.moneda.codigo === k)
}

/** Definición de un método en un país: `metodoDe('CO', 'nequi')`. Tipo insensible a mayúsculas. */
export function metodoDe(iso2: string, tipo: string): MetodoPais | undefined {
  const t = String(tipo ?? '').trim().toLowerCase()
  return pais(iso2)?.metodos.find((m) => m.tipo === t)
}

const vistas = new Map<string, MonedaPais>()
for (const p of PAISES) if (!vistas.has(p.moneda.codigo)) vistas.set(p.moneda.codigo, p.moneda)

/** Monedas únicas del catálogo, ordenadas por código (USD incluido: lo usan cuatro países). */
export const MONEDAS: MonedaPais[] = [...vistas.values()].sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0))

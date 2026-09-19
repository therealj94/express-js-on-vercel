// Latinoamérica: países, monedas, bancos y métodos de pago.
//
// Lo que la gente usa DE VERDAD para pagarse entre sí en cada país: la
// transferencia bancaria (con los bancos principales) y las billeteras que
// dominan el P2P local —PIX, Nequi, Yape, SINPE Móvil, Tigo Money, Pago Móvil,
// Mercado Pago, SPEI, Zelle—. Un mismo `tipo` significa lo mismo en todos
// los países, y las claves de `campos` son las canónicas que documenta API.md.
//
// Cuba no está: Genesis ID la rechaza (sanciones integrales) y no se podría
// verificar a nadie.

export interface CampoMetodo { clave: string; etiqueta: string; etiquetaEn: string; ejemplo?: string; obligatorio: boolean }
export interface MetodoPais {
  tipo: string; nombre: string; nombreEn: string
  categoria: 'banco' | 'billetera' | 'efectivo' | 'otro'
  bancos?: string[]
  campos: CampoMetodo[]
}
export interface MonedaPais { codigo: string; nombre: string; nombreEn: string; simbolo: string; decimales: number }
export interface Pais {
  iso2: string; iso3: string; nombre: string; nombreEn: string; bandera: string
  moneda: MonedaPais; prefijoTelefono: string; metodos: MetodoPais[]
}

// ── Campos ───────────────────────────────────────────────────────────────────

const c = (clave: string, etiqueta: string, etiquetaEn: string, obligatorio = true, ejemplo?: string): CampoMetodo =>
  ({ clave, etiqueta, etiquetaEn, obligatorio, ...(ejemplo ? { ejemplo } : {}) })

const CUENTA = c('cuenta', 'Número de cuenta', 'Account number', true, '0123456789')
const CUENTA_OPC = c('cuenta', 'Número de cuenta', 'Account number', false, '0123456789')
const TIPO_CUENTA = c('tipoCuenta', 'Tipo de cuenta', 'Account type', false, 'Ahorro / Corriente')
const DOCUMENTO = c('documento', 'Documento del titular', 'Holder ID number', false)
const CEDULA = c('cedula', 'Cédula del titular', 'Holder ID (cédula)', true, 'V-12345678')
const CEDULA_OPC = c('cedula', 'Cédula del titular', 'Holder ID (cédula)', false)
const TELEFONO = (ejemplo: string) => c('telefono', 'Número de teléfono', 'Phone number', true, ejemplo)
const CONTACTO = c('contacto', 'Correo o teléfono de Zelle', 'Zelle email or phone', true, 'nombre@correo.com')

// ── Métodos reutilizables ────────────────────────────────────────────────────

const transferencia = (bancos: string[], campos: CampoMetodo[] = [CUENTA, TIPO_CUENTA, DOCUMENTO]): MetodoPais =>
  ({ tipo: 'transferencia', nombre: 'Transferencia bancaria', nombreEn: 'Bank transfer', categoria: 'banco', bancos, campos })

const billetera = (tipo: string, nombre: string, nombreEn: string, campos: CampoMetodo[], bancos?: string[]): MetodoPais =>
  ({ tipo, nombre, nombreEn, categoria: 'billetera', ...(bancos ? { bancos } : {}), campos })

const tel = (tipo: string, nombre: string, ejemplo: string, nombreEn = nombre) => billetera(tipo, nombre, nombreEn, [TELEFONO(ejemplo)])

const zelle = () => billetera('zelle', 'Zelle', 'Zelle', [CONTACTO])

const efectivo = (): MetodoPais => ({
  tipo: 'efectivo', nombre: 'Efectivo en persona', nombreEn: 'Cash in person', categoria: 'efectivo',
  campos: [c('ciudad', 'Ciudad de encuentro', 'Meeting city', true), c('nota', 'Indicaciones', 'Instructions', false, 'Solo en lugares públicos')],
})

// ── Países ───────────────────────────────────────────────────────────────────

export const PAISES: Pais[] = [
  {
    iso2: 'AR', iso3: 'ARG', nombre: 'Argentina', nombreEn: 'Argentina', bandera: '🇦🇷',
    moneda: { codigo: 'ARS', nombre: 'Peso argentino', nombreEn: 'Argentine peso', simbolo: '$', decimales: 2 },
    prefijoTelefono: '+54',
    metodos: [
      transferencia(
        ['Banco Nación', 'Banco Provincia', 'Banco Galicia', 'Banco Santander Argentina', 'BBVA Argentina', 'Banco Macro', 'Banco Ciudad', 'ICBC Argentina', 'Banco Credicoop', 'Banco Patagonia', 'Banco Supervielle', 'Banco Hipotecario', 'Banco Comafi', 'Banco Columbia', 'Brubank', 'Naranja X', 'Ualá'],
        [c('cbu', 'CBU o CVU', 'CBU or CVU', true, '0000003100012345678901'), c('alias', 'Alias', 'Alias', false, 'nombre.apellido.mp'), c('cuit', 'CUIT/CUIL del titular', 'Holder CUIT/CUIL', false)],
      ),
      billetera('mercado-pago', 'Mercado Pago', 'Mercado Pago', [c('alias', 'Alias de Mercado Pago', 'Mercado Pago alias', true, 'nombre.mp'), c('cvu', 'CVU', 'CVU', false, '0000003100012345678901')]),
      efectivo(),
    ],
  },
  {
    iso2: 'BO', iso3: 'BOL', nombre: 'Bolivia', nombreEn: 'Bolivia', bandera: '🇧🇴',
    moneda: { codigo: 'BOB', nombre: 'Boliviano', nombreEn: 'Bolivian boliviano', simbolo: 'Bs', decimales: 2 },
    prefijoTelefono: '+591',
    metodos: [
      transferencia(['Banco Unión', 'Banco Mercantil Santa Cruz', 'Banco BISA', 'Banco Nacional de Bolivia', 'Banco de Crédito de Bolivia', 'Banco Ganadero', 'Banco Económico', 'BancoSol', 'Banco FIE', 'Banco Fortaleza', 'Banco Prodem']),
      tel('tigo-money', 'Tigo Money', '+591 7 123 4567'),
      efectivo(),
    ],
  },
  {
    iso2: 'BR', iso3: 'BRA', nombre: 'Brasil', nombreEn: 'Brazil', bandera: '🇧🇷',
    moneda: { codigo: 'BRL', nombre: 'Real brasileño', nombreEn: 'Brazilian real', simbolo: 'R$', decimales: 2 },
    prefijoTelefono: '+55',
    metodos: [
      billetera('pix', 'PIX', 'PIX', [c('llave', 'Llave PIX', 'PIX key', true, 'correo, CPF, teléfono o aleatoria'), c('tipoLlave', 'Tipo de llave', 'Key type', false, 'CPF / correo / teléfono / aleatoria')]),
      transferencia(
        ['Banco do Brasil', 'Caixa Econômica Federal', 'Itaú Unibanco', 'Bradesco', 'Santander Brasil', 'Nubank', 'Banco Inter', 'C6 Bank', 'BTG Pactual', 'Banco Original', 'Sicoob', 'Sicredi', 'Banrisul', 'Banco Safra', 'PicPay', 'Mercado Pago'],
        [c('agencia', 'Agencia', 'Branch (agência)', true, '0001'), CUENTA, c('cpf', 'CPF del titular', 'Holder CPF', true, '123.456.789-00')],
      ),
      efectivo(),
    ],
  },
  {
    iso2: 'CL', iso3: 'CHL', nombre: 'Chile', nombreEn: 'Chile', bandera: '🇨🇱',
    moneda: { codigo: 'CLP', nombre: 'Peso chileno', nombreEn: 'Chilean peso', simbolo: '$', decimales: 0 },
    prefijoTelefono: '+56',
    metodos: [
      transferencia(
        ['BancoEstado', 'Banco de Chile', 'Banco Santander Chile', 'BCI', 'Scotiabank Chile', 'Banco Itaú Chile', 'Banco Falabella', 'Banco Ripley', 'Banco Security', 'Banco BICE', 'Banco Consorcio', 'Banco Internacional', 'Coopeuch'],
        [CUENTA, c('tipoCuenta', 'Tipo de cuenta', 'Account type', false, 'Cuenta RUT / Vista / Corriente'), c('rut', 'RUT del titular', 'Holder RUT', true, '12.345.678-9')],
      ),
      billetera('mach', 'MACH', 'MACH', [TELEFONO('+56 9 1234 5678'), c('rut', 'RUT del titular', 'Holder RUT', false)]),
      billetera('tenpo', 'Tenpo', 'Tenpo', [TELEFONO('+56 9 1234 5678'), c('rut', 'RUT del titular', 'Holder RUT', false)]),
      efectivo(),
    ],
  },
  {
    iso2: 'CO', iso3: 'COL', nombre: 'Colombia', nombreEn: 'Colombia', bandera: '🇨🇴',
    moneda: { codigo: 'COP', nombre: 'Peso colombiano', nombreEn: 'Colombian peso', simbolo: '$', decimales: 2 },
    prefijoTelefono: '+57',
    metodos: [
      tel('nequi', 'Nequi', '+57 310 123 4567'),
      tel('daviplata', 'Daviplata', '+57 310 123 4567'),
      transferencia(
        ['Bancolombia', 'Davivienda', 'Banco de Bogotá', 'BBVA Colombia', 'Banco de Occidente', 'Banco Popular', 'Banco Caja Social', 'Banco AV Villas', 'Scotiabank Colpatria', 'Banco Agrario', 'Banco Falabella', 'Banco Pichincha', 'Banco Itaú Colombia', 'Nu Colombia', 'Lulo Bank', 'Bancoomeva'],
        [CUENTA, TIPO_CUENTA, CEDULA_OPC],
      ),
      billetera('bre-b', 'Bre-B (llave)', 'Bre-B (key)', [c('llave', 'Llave Bre-B', 'Bre-B key', true, '@usuario, cédula o teléfono')]),
      tel('movii', 'Movii', '+57 310 123 4567'),
      efectivo(),
    ],
  },
  {
    iso2: 'CR', iso3: 'CRI', nombre: 'Costa Rica', nombreEn: 'Costa Rica', bandera: '🇨🇷',
    moneda: { codigo: 'CRC', nombre: 'Colón costarricense', nombreEn: 'Costa Rican colón', simbolo: '₡', decimales: 2 },
    prefijoTelefono: '+506',
    metodos: [
      tel('sinpe-movil', 'SINPE Móvil', '+506 8888 1234'),
      transferencia(
        ['Banco Nacional de Costa Rica', 'Banco de Costa Rica', 'BAC Credomatic', 'Banco Popular', 'Scotiabank Costa Rica', 'Davivienda Costa Rica', 'Banco Promerica', 'Banco Lafise', 'Coopenae', 'Banco Cathay', 'Banco BCT', 'Coopeservidores'],
        [c('iban', 'Cuenta IBAN', 'IBAN account', true, 'CR05015202001026284066'), CEDULA_OPC],
      ),
      efectivo(),
    ],
  },
  {
    iso2: 'DO', iso3: 'DOM', nombre: 'República Dominicana', nombreEn: 'Dominican Republic', bandera: '🇩🇴',
    moneda: { codigo: 'DOP', nombre: 'Peso dominicano', nombreEn: 'Dominican peso', simbolo: 'RD$', decimales: 2 },
    prefijoTelefono: '+1-809',
    metodos: [
      transferencia(
        ['Banco Popular Dominicano', 'Banreservas', 'Banco BHD', 'Scotiabank República Dominicana', 'Banco Santa Cruz', 'Banco Caribe', 'Banco Promerica', 'Banesco', 'Banco Lafise', 'Asociación Popular de Ahorros y Préstamos', 'Banco Vimenca', 'Asociación Cibao', 'Banco Ademi', 'Qik Banco Digital'],
        [CUENTA, TIPO_CUENTA, CEDULA_OPC],
      ),
      zelle(),
      efectivo(),
    ],
  },
  {
    iso2: 'EC', iso3: 'ECU', nombre: 'Ecuador', nombreEn: 'Ecuador', bandera: '🇪🇨',
    moneda: { codigo: 'USD', nombre: 'Dólar estadounidense', nombreEn: 'US dollar', simbolo: '$', decimales: 2 },
    prefijoTelefono: '+593',
    metodos: [
      transferencia(
        ['Banco Pichincha', 'Banco del Pacífico', 'Banco Guayaquil', 'Produbanco', 'Banco Bolivariano', 'Banco Internacional', 'Banco del Austro', 'BanEcuador', 'Banco Solidario', 'Banco de Machala', 'Banco General Rumiñahui', 'Cooperativa JEP', 'Banco Diners Club'],
        [CUENTA, TIPO_CUENTA, CEDULA_OPC],
      ),
      tel('de-una', 'Deuna', '+593 99 123 4567'),
      efectivo(),
    ],
  },
  {
    iso2: 'SV', iso3: 'SLV', nombre: 'El Salvador', nombreEn: 'El Salvador', bandera: '🇸🇻',
    moneda: { codigo: 'USD', nombre: 'Dólar estadounidense', nombreEn: 'US dollar', simbolo: '$', decimales: 2 },
    prefijoTelefono: '+503',
    metodos: [
      transferencia(['Banco Agrícola', 'Banco Cuscatlán', 'Davivienda El Salvador', 'BAC Credomatic', 'Banco Promerica', 'Banco Hipotecario', 'Banco Atlántida El Salvador', 'Banco Industrial El Salvador', 'Banco Azul', 'Abank', 'Banco G&T Continental El Salvador']),
      tel('tigo-money', 'Tigo Money', '+503 7000 1234'),
      efectivo(),
    ],
  },
  {
    iso2: 'GT', iso3: 'GTM', nombre: 'Guatemala', nombreEn: 'Guatemala', bandera: '🇬🇹',
    moneda: { codigo: 'GTQ', nombre: 'Quetzal', nombreEn: 'Guatemalan quetzal', simbolo: 'Q', decimales: 2 },
    prefijoTelefono: '+502',
    metodos: [
      transferencia(
        ['Banco Industrial', 'Banrural', 'Banco G&T Continental', 'BAC Credomatic', 'Banco Promerica', 'Banco Agromercantil', 'Bantrab', 'Banco Inmobiliario', 'Interbanco', 'Banco Azteca Guatemala', 'Crédito Hipotecario Nacional', 'Vivibanco', 'Banco Ficohsa Guatemala', 'Banco de Antigua'],
        [CUENTA, c('tipoCuenta', 'Tipo de cuenta', 'Account type', false, 'Monetaria / Ahorro'), c('dpi', 'DPI del titular', 'Holder DPI', false)],
      ),
      tel('tigo-money', 'Tigo Money', '+502 5000 1234'),
      efectivo(),
    ],
  },
  {
    iso2: 'HN', iso3: 'HND', nombre: 'Honduras', nombreEn: 'Honduras', bandera: '🇭🇳',
    moneda: { codigo: 'HNL', nombre: 'Lempira', nombreEn: 'Honduran lempira', simbolo: 'L', decimales: 2 },
    prefijoTelefono: '+504',
    metodos: [
      transferencia(
        ['Banco Atlántida', 'BAC Credomatic', 'Banco Ficohsa', 'Banpaís', 'Banco de Occidente', 'Davivienda Honduras', 'Banco Promerica', 'Banco Lafise', 'Banrural Honduras', 'Banco Azteca Honduras', 'Banco Popular', 'Banhcafé', 'Banco de los Trabajadores', 'Banco Hondureño del Café'],
        [CUENTA, TIPO_CUENTA, c('identidad', 'Identidad del titular', 'Holder ID number', false, '0801-1990-12345')],
      ),
      tel('tigo-money', 'Tigo Money', '+504 9988 7766'),
      efectivo(),
    ],
  },
  {
    iso2: 'MX', iso3: 'MEX', nombre: 'México', nombreEn: 'Mexico', bandera: '🇲🇽',
    moneda: { codigo: 'MXN', nombre: 'Peso mexicano', nombreEn: 'Mexican peso', simbolo: '$', decimales: 2 },
    prefijoTelefono: '+52',
    metodos: [
      transferencia(
        ['BBVA México', 'Banorte', 'Santander México', 'Banamex', 'HSBC México', 'Scotiabank México', 'Banco Azteca', 'BanCoppel', 'Inbursa', 'Banregio', 'Afirme', 'Banco del Bajío', 'Nu México', 'Hey Banco', 'Klar', 'Ualá México', 'STP'],
        [c('clabe', 'CLABE (18 dígitos)', 'CLABE (18 digits)', true, '012180001234567890'), CUENTA_OPC, c('rfc', 'RFC del titular', 'Holder RFC', false)],
      ),
      billetera('mercado-pago', 'Mercado Pago', 'Mercado Pago', [c('clabe', 'CLABE de Mercado Pago', 'Mercado Pago CLABE', true, '722969000000000000'), c('alias', 'Alias', 'Alias', false)]),
      efectivo(),
    ],
  },
  {
    iso2: 'NI', iso3: 'NIC', nombre: 'Nicaragua', nombreEn: 'Nicaragua', bandera: '🇳🇮',
    moneda: { codigo: 'NIO', nombre: 'Córdoba', nombreEn: 'Nicaraguan córdoba', simbolo: 'C$', decimales: 2 },
    prefijoTelefono: '+505',
    metodos: [
      transferencia(['Banpro', 'Lafise Bancentro', 'BAC Credomatic', 'Banco Ficohsa Nicaragua', 'Banco Avanz', 'Banco de Fomento a la Producción']),
      efectivo(),
    ],
  },
  {
    iso2: 'PA', iso3: 'PAN', nombre: 'Panamá', nombreEn: 'Panama', bandera: '🇵🇦',
    moneda: { codigo: 'USD', nombre: 'Dólar estadounidense', nombreEn: 'US dollar', simbolo: '$', decimales: 2 },
    prefijoTelefono: '+507',
    metodos: [
      tel('yappy', 'Yappy', '+507 6000 1234'),
      transferencia(['Banco General', 'Banistmo', 'BAC Credomatic', 'Banco Nacional de Panamá', 'Global Bank', 'Multibank', 'Banesco Panamá', 'Caja de Ahorros', 'Scotiabank Panamá', 'Mercantil Banco', 'Credicorp Bank', 'St. Georges Bank', 'Banco Aliado', 'Towerbank']),
      tel('nequi', 'Nequi Panamá', '+507 6000 1234'),
      zelle(),
      efectivo(),
    ],
  },
  {
    iso2: 'PY', iso3: 'PRY', nombre: 'Paraguay', nombreEn: 'Paraguay', bandera: '🇵🇾',
    moneda: { codigo: 'PYG', nombre: 'Guaraní', nombreEn: 'Paraguayan guaraní', simbolo: '₲', decimales: 0 },
    prefijoTelefono: '+595',
    metodos: [
      transferencia(['Banco Itaú Paraguay', 'Banco Continental', 'Banco Nacional de Fomento', 'Banco GNB Paraguay', 'Sudameris', 'Banco Familiar', 'Banco Atlas', 'Visión Banco', 'Banco Basa', 'Ueno Bank', 'Banco Río', 'Solar Banco', 'Interfisa Banco', 'Bancop']),
      tel('tigo-money', 'Tigo Money', '+595 981 123 456'),
      tel('personal-pay', 'Billetera Personal', '+595 971 123 456', 'Personal Pay'),
      tel('zimple', 'Zimple', '+595 981 123 456'),
      efectivo(),
    ],
  },
  {
    iso2: 'PE', iso3: 'PER', nombre: 'Perú', nombreEn: 'Peru', bandera: '🇵🇪',
    moneda: { codigo: 'PEN', nombre: 'Sol', nombreEn: 'Peruvian sol', simbolo: 'S/', decimales: 2 },
    prefijoTelefono: '+51',
    metodos: [
      tel('yape', 'Yape', '+51 987 654 321'),
      tel('plin', 'Plin', '+51 987 654 321'),
      transferencia(
        ['BCP', 'BBVA Perú', 'Interbank', 'Scotiabank Perú', 'Banco Pichincha Perú', 'BanBif', 'Banco Falabella Perú', 'Banco Ripley Perú', 'Mibanco', 'Banco de la Nación', 'Caja Arequipa', 'Caja Huancayo', 'Caja Piura', 'Caja Cusco', 'Banco GNB Perú'],
        [CUENTA, c('cci', 'CCI (código interbancario)', 'CCI (interbank code)', true, '00219300123456789012'), c('dni', 'DNI del titular', 'Holder DNI', false)],
      ),
      efectivo(),
    ],
  },
  {
    iso2: 'PR', iso3: 'PRI', nombre: 'Puerto Rico', nombreEn: 'Puerto Rico', bandera: '🇵🇷',
    moneda: { codigo: 'USD', nombre: 'Dólar estadounidense', nombreEn: 'US dollar', simbolo: '$', decimales: 2 },
    prefijoTelefono: '+1-787',
    metodos: [
      tel('ath-movil', 'ATH Móvil', '+1 787 555 1234'),
      transferencia(['Banco Popular de Puerto Rico', 'FirstBank', 'Oriental Bank'], [CUENTA, c('ruta', 'Número de ruta', 'Routing number', true, '021502011'), TIPO_CUENTA]),
      zelle(),
      efectivo(),
    ],
  },
  {
    iso2: 'UY', iso3: 'URY', nombre: 'Uruguay', nombreEn: 'Uruguay', bandera: '🇺🇾',
    moneda: { codigo: 'UYU', nombre: 'Peso uruguayo', nombreEn: 'Uruguayan peso', simbolo: '$U', decimales: 2 },
    prefijoTelefono: '+598',
    metodos: [
      transferencia(['BROU', 'Banco Santander Uruguay', 'Itaú Uruguay', 'Scotiabank Uruguay', 'BBVA Uruguay', 'Banco Heritage', 'Bandes Uruguay', 'HSBC Uruguay', 'Banco Hipotecario del Uruguay'], [CUENTA, c('sucursal', 'Sucursal', 'Branch', false), CEDULA_OPC]),
      tel('prex', 'Prex', '+598 99 123 456'),
      tel('mi-dinero', 'Mi Dinero', '+598 99 123 456'),
      efectivo(),
    ],
  },
  {
    iso2: 'VE', iso3: 'VEN', nombre: 'Venezuela', nombreEn: 'Venezuela', bandera: '🇻🇪',
    moneda: { codigo: 'VES', nombre: 'Bolívar', nombreEn: 'Venezuelan bolívar', simbolo: 'Bs', decimales: 2 },
    prefijoTelefono: '+58',
    metodos: [
      billetera('pago-movil', 'Pago Móvil', 'Pago Móvil', [TELEFONO('+58 412 555 9876'), CEDULA],
        ['Banco de Venezuela', 'Banesco', 'Banco Mercantil', 'BBVA Provincial', 'Banco Bicentenario', 'Bancamiga', 'Banco Nacional de Crédito', 'Banco del Tesoro', 'Banco Exterior', 'Banco Fondo Común', 'Banplus', 'Bancaribe', 'Banco Sofitasa', '100% Banco', 'Banco Plaza', 'Banco Activo', 'Mi Banco', 'Banco Caroní']),
      transferencia(
        ['Banco de Venezuela', 'Banesco', 'Banco Mercantil', 'BBVA Provincial', 'Banco Bicentenario', 'Bancamiga', 'Banco Nacional de Crédito', 'Banco del Tesoro', 'Banco Exterior', 'Banco Fondo Común', 'Banplus', 'Bancaribe', 'Banco Sofitasa', '100% Banco', 'Banco Plaza', 'Banco Activo', 'Mi Banco', 'Banco Caroní'],
        [c('cuenta', 'Número de cuenta (20 dígitos)', 'Account number (20 digits)', true, '01020123456789012345'), CEDULA],
      ),
      zelle(),
      efectivo(),
    ],
  },
  {
    iso2: 'BZ', iso3: 'BLZ', nombre: 'Belice', nombreEn: 'Belize', bandera: '🇧🇿',
    moneda: { codigo: 'BZD', nombre: 'Dólar beliceño', nombreEn: 'Belize dollar', simbolo: 'BZ$', decimales: 2 },
    prefijoTelefono: '+501',
    metodos: [
      transferencia(['Belize Bank', 'Atlantic Bank', 'Heritage Bank', 'National Bank of Belize']),
      tel('digi-wallet', 'DigiWallet', '+501 600 1234'),
      efectivo(),
    ],
  },
  {
    iso2: 'HT', iso3: 'HTI', nombre: 'Haití', nombreEn: 'Haiti', bandera: '🇭🇹',
    moneda: { codigo: 'HTG', nombre: 'Gourde', nombreEn: 'Haitian gourde', simbolo: 'G', decimales: 2 },
    prefijoTelefono: '+509',
    metodos: [
      tel('moncash', 'MonCash', '+509 3612 3456'),
      tel('natcash', 'NatCash', '+509 3612 3456'),
      transferencia(['Unibank', 'Sogebank', 'Banque Nationale de Crédit', 'Capital Bank', 'Banque de l\'Union Haïtienne', 'Sogebel']),
      efectivo(),
    ],
  },
  {
    iso2: 'GY', iso3: 'GUY', nombre: 'Guyana', nombreEn: 'Guyana', bandera: '🇬🇾',
    moneda: { codigo: 'GYD', nombre: 'Dólar guyanés', nombreEn: 'Guyanese dollar', simbolo: 'G$', decimales: 2 },
    prefijoTelefono: '+592',
    metodos: [
      transferencia(['Republic Bank Guyana', 'Demerara Bank', 'Guyana Bank for Trade and Industry', 'Citizens Bank Guyana', 'Bank of Baroda Guyana']),
      tel('mmg', 'MMG (Mobile Money Guyana)', '+592 600 1234', 'MMG'),
      efectivo(),
    ],
  },
  {
    iso2: 'SR', iso3: 'SUR', nombre: 'Surinam', nombreEn: 'Suriname', bandera: '🇸🇷',
    moneda: { codigo: 'SRD', nombre: 'Dólar surinamés', nombreEn: 'Surinamese dollar', simbolo: 'Sr$', decimales: 2 },
    prefijoTelefono: '+597',
    metodos: [
      transferencia(['De Surinaamsche Bank', 'Hakrinbank', 'Republic Bank Suriname', 'Finabank', 'Surichange Bank']),
      tel('uni5pay', 'Uni5Pay+', '+597 800 1234'),
      efectivo(),
    ],
  },
]

// ── Ayudantes ────────────────────────────────────────────────────────────────

export function pais(iso2: string): Pais | undefined {
  const k = String(iso2 || '').toUpperCase().trim()
  return PAISES.find((p) => p.iso2 === k)
}

export function paisPorMoneda(codigo: string): Pais[] {
  const k = String(codigo || '').toUpperCase().trim()
  return PAISES.filter((p) => p.moneda.codigo === k)
}

export function metodoDe(iso2: string, tipo: string): MetodoPais | undefined {
  const t = String(tipo || '').toLowerCase().trim()
  return pais(iso2)?.metodos.find((m) => m.tipo === t)
}

const vistas = new Map<string, MonedaPais>()
for (const p of PAISES) if (!vistas.has(p.moneda.codigo)) vistas.set(p.moneda.codigo, p.moneda)
export const MONEDAS: MonedaPais[] = [...vistas.values()].sort((a, b) => a.codigo.localeCompare(b.codigo))

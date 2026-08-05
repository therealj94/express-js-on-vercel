// Países: códigos ISO 3166-1 alfa-3 y riesgo jurisdiccional.
//
// SOBRE LA VIGENCIA DE ESTAS LISTAS
//
// El GAFI (FATF) revisa sus listas en cada plenaria, unas tres veces al año, y
// los países entran y salen. Una lista incrustada en el código envejece sola y
// en pocos meses miente. Por eso:
//
//   - cada lista lleva la fecha de la plenaria de la que salió, y esa fecha se
//     muestra en el panel de cumplimiento junto a cada resultado;
//   - se pueden sustituir sin tocar el código, apuntando GENESIS_LISTAS_DIR a
//     una carpeta con los archivos actualizados;
//   - si la fecha tiene más de 180 días, el motor avisa de que están vencidas.
//
// La fuente oficial es fatf-gafi.org/publications/high-risk-and-other-monitored-jurisdictions

/** Plenaria de la que salieron las listas incrustadas. */
export const FECHA_LISTAS_GAFI = '2025-02-21'

/**
 * Llamamiento a la acción del GAFI ("lista negra"): jurisdicciones con
 * deficiencias graves donde se exige diligencia reforzada y, en el caso de
 * Irán y Corea del Norte, contramedidas.
 */
export const GAFI_ALTO_RIESGO = new Set(['IRN', 'PRK', 'MMR'])

/**
 * Vigilancia intensificada del GAFI ("lista gris"): países comprometidos con
 * un plan de acción. No obligan a contramedidas, pero sí a mirar con más
 * cuidado.
 */
export const GAFI_VIGILANCIA = new Set([
  'DZA', 'AGO', 'BGR', 'BFA', 'CMR', 'CIV', 'HRV', 'COD', 'HTI', 'KEN', 'LBN',
  'MLI', 'MCO', 'MOZ', 'NAM', 'NPL', 'NGA', 'ZAF', 'SSD', 'SYR', 'TZA', 'VEN',
  'VNM', 'YEM',
])

/** Países bajo sanciones amplias. Aquí no se abre cuenta: se rechaza. */
export const SANCION_INTEGRAL = new Set(['IRN', 'PRK', 'SYR', 'CUB'])

/** Territorios con control de exportaciones/sanciones regionales. */
export const REGIONES_RESTRINGIDAS = new Set(['RUS', 'BLR'])

export type NivelPais = 'prohibido' | 'alto' | 'medio' | 'normal'

export function nivelPais(iso3: string): NivelPais {
  const c = String(iso3 || '').toUpperCase()
  if (SANCION_INTEGRAL.has(c)) return 'prohibido'
  if (GAFI_ALTO_RIESGO.has(c)) return 'prohibido'
  if (GAFI_VIGILANCIA.has(c) || REGIONES_RESTRINGIDAS.has(c)) return 'alto'
  if (!ISO3.has(c)) return 'medio' // código desconocido: no se asume que esté bien
  return 'normal'
}

export function motivoPais(iso3: string): string | null {
  const c = String(iso3 || '').toUpperCase()
  if (SANCION_INTEGRAL.has(c)) return `${nombrePais(c)} está bajo sanciones integrales`
  if (GAFI_ALTO_RIESGO.has(c)) return `${nombrePais(c)} está en el llamamiento a la acción del GAFI`
  if (GAFI_VIGILANCIA.has(c)) return `${nombrePais(c)} está bajo vigilancia intensificada del GAFI`
  if (REGIONES_RESTRINGIDAS.has(c)) return `${nombrePais(c)} tiene sanciones sectoriales vigentes`
  if (!ISO3.has(c)) return `Código de país no reconocido: ${c}`
  return null
}

/** ¿Hace cuánto se actualizaron las listas? El panel lo muestra. */
export function diasDesdeActualizacion(): number {
  const d = new Date(FECHA_LISTAS_GAFI + 'T00:00:00Z')
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

export const listasVencidas = () => diasDesdeActualizacion() > 180

// ─────────────────────────────────────────────────────────────────────────────
// ISO 3166-1 alfa-3
// ─────────────────────────────────────────────────────────────────────────────

const TABLA = `ABW:Aruba|AFG:Afganistán|AGO:Angola|AIA:Anguila|ALA:Islas Åland|ALB:Albania|AND:Andorra|ARE:Emiratos Árabes Unidos|ARG:Argentina|ARM:Armenia|ASM:Samoa Americana|ATA:Antártida|ATF:Territorios Australes Franceses|ATG:Antigua y Barbuda|AUS:Australia|AUT:Austria|AZE:Azerbaiyán|BDI:Burundi|BEL:Bélgica|BEN:Benín|BES:Bonaire|BFA:Burkina Faso|BGD:Bangladés|BGR:Bulgaria|BHR:Baréin|BHS:Bahamas|BIH:Bosnia y Herzegovina|BLM:San Bartolomé|BLR:Bielorrusia|BLZ:Belice|BMU:Bermudas|BOL:Bolivia|BRA:Brasil|BRB:Barbados|BRN:Brunéi|BTN:Bután|BVT:Isla Bouvet|BWA:Botsuana|CAF:República Centroafricana|CAN:Canadá|CCK:Islas Cocos|CHE:Suiza|CHL:Chile|CHN:China|CIV:Costa de Marfil|CMR:Camerún|COD:Rep. Dem. del Congo|COG:Congo|COK:Islas Cook|COL:Colombia|COM:Comoras|CPV:Cabo Verde|CRI:Costa Rica|CUB:Cuba|CUW:Curazao|CXR:Isla de Navidad|CYM:Islas Caimán|CYP:Chipre|CZE:Chequia|DEU:Alemania|DJI:Yibuti|DMA:Dominica|DNK:Dinamarca|DOM:República Dominicana|DZA:Argelia|ECU:Ecuador|EGY:Egipto|ERI:Eritrea|ESH:Sáhara Occidental|ESP:España|EST:Estonia|ETH:Etiopía|FIN:Finlandia|FJI:Fiyi|FLK:Islas Malvinas|FRA:Francia|FRO:Islas Feroe|FSM:Micronesia|GAB:Gabón|GBR:Reino Unido|GEO:Georgia|GGY:Guernsey|GHA:Ghana|GIB:Gibraltar|GIN:Guinea|GLP:Guadalupe|GMB:Gambia|GNB:Guinea-Bisáu|GNQ:Guinea Ecuatorial|GRC:Grecia|GRD:Granada|GRL:Groenlandia|GTM:Guatemala|GUF:Guayana Francesa|GUM:Guam|GUY:Guyana|HKG:Hong Kong|HMD:Islas Heard y McDonald|HND:Honduras|HRV:Croacia|HTI:Haití|HUN:Hungría|IDN:Indonesia|IMN:Isla de Man|IND:India|IOT:Territorio Británico del Océano Índico|IRL:Irlanda|IRN:Irán|IRQ:Irak|ISL:Islandia|ISR:Israel|ITA:Italia|JAM:Jamaica|JEY:Jersey|JOR:Jordania|JPN:Japón|KAZ:Kazajistán|KEN:Kenia|KGZ:Kirguistán|KHM:Camboya|KIR:Kiribati|KNA:San Cristóbal y Nieves|KOR:Corea del Sur|KWT:Kuwait|LAO:Laos|LBN:Líbano|LBR:Liberia|LBY:Libia|LCA:Santa Lucía|LIE:Liechtenstein|LKA:Sri Lanka|LSO:Lesoto|LTU:Lituania|LUX:Luxemburgo|LVA:Letonia|MAC:Macao|MAF:San Martín|MAR:Marruecos|MCO:Mónaco|MDA:Moldavia|MDG:Madagascar|MDV:Maldivas|MEX:México|MHL:Islas Marshall|MKD:Macedonia del Norte|MLI:Malí|MLT:Malta|MMR:Birmania|MNE:Montenegro|MNG:Mongolia|MNP:Islas Marianas del Norte|MOZ:Mozambique|MRT:Mauritania|MSR:Montserrat|MTQ:Martinica|MUS:Mauricio|MWI:Malaui|MYS:Malasia|MYT:Mayotte|NAM:Namibia|NCL:Nueva Caledonia|NER:Níger|NFK:Isla Norfolk|NGA:Nigeria|NIC:Nicaragua|NIU:Niue|NLD:Países Bajos|NOR:Noruega|NPL:Nepal|NRU:Nauru|NZL:Nueva Zelanda|OMN:Omán|PAK:Pakistán|PAN:Panamá|PCN:Islas Pitcairn|PER:Perú|PHL:Filipinas|PLW:Palaos|PNG:Papúa Nueva Guinea|POL:Polonia|PRI:Puerto Rico|PRK:Corea del Norte|PRT:Portugal|PRY:Paraguay|PSE:Palestina|PYF:Polinesia Francesa|QAT:Catar|REU:Reunión|ROU:Rumanía|RUS:Rusia|RWA:Ruanda|SAU:Arabia Saudita|SDN:Sudán|SEN:Senegal|SGP:Singapur|SGS:Islas Georgias del Sur|SHN:Santa Elena|SJM:Svalbard|SLB:Islas Salomón|SLE:Sierra Leona|SLV:El Salvador|SMR:San Marino|SOM:Somalia|SPM:San Pedro y Miquelón|SRB:Serbia|SSD:Sudán del Sur|STP:Santo Tomé y Príncipe|SUR:Surinam|SVK:Eslovaquia|SVN:Eslovenia|SWE:Suecia|SWZ:Esuatini|SXM:Sint Maarten|SYC:Seychelles|SYR:Siria|TCA:Islas Turcas y Caicos|TCD:Chad|TGO:Togo|THA:Tailandia|TJK:Tayikistán|TKL:Tokelau|TKM:Turkmenistán|TLS:Timor Oriental|TON:Tonga|TTO:Trinidad y Tobago|TUN:Túnez|TUR:Turquía|TUV:Tuvalu|TWN:Taiwán|TZA:Tanzania|UGA:Uganda|UKR:Ucrania|UMI:Islas menores de EE. UU.|URY:Uruguay|USA:Estados Unidos|UZB:Uzbekistán|VAT:Ciudad del Vaticano|VCT:San Vicente y las Granadinas|VEN:Venezuela|VGB:Islas Vírgenes Británicas|VIR:Islas Vírgenes de EE. UU.|VNM:Vietnam|VUT:Vanuatu|WLF:Wallis y Futuna|WSM:Samoa|YEM:Yemen|ZAF:Sudáfrica|ZMB:Zambia|ZWE:Zimbabue`

const NOMBRES = new Map<string, string>()
for (const par of TABLA.split('|')) {
  const [codigo, nombre] = par.split(':')
  NOMBRES.set(codigo, nombre)
}

export const ISO3 = new Set(NOMBRES.keys())

export const nombrePais = (iso3: string): string =>
  NOMBRES.get(String(iso3 || '').toUpperCase()) ?? String(iso3 || '').toUpperCase()

export const paises = () =>
  [...NOMBRES.entries()].map(([codigo, nombre]) => ({ codigo, nombre, nivel: nivelPais(codigo) }))

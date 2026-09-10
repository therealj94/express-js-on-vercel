/* Las fichas de Genesis Core. GENERADO — no se edita a mano.
 *
 *   python3 infra/cerebro/armar-fichas-core.py
 *
 * Sale de las fuentes de verdad de la casa:
 *   · infra/cerebro/conocimiento/legal.json
 *   · infra/cerebro/conocimiento/saber.json
 *   · infra/cerebro/conocimiento/portafolio-minero.md
 *
 * Editar este fichero a mano es garantizar que el día que la Junta
 * apruebe otra cifra, el cerebro siga diciendo la vieja y nadie se
 * entere hasta oírla en voz alta delante de alguien.
 *
 * Las 16 fichas marcadas INTERNO en `saber.json` no se publican aquí:
 * esta pantalla se proyecta delante de gente de fuera. Se dice cuántas
 * hay y dónde viven; el contenido se queda dentro.
 */

export const INTERNAS = 16;

export const FICHAS = {
  "AGKA": [
    {
      titulo: "AGKA",
      parrafos: [
        "AGKA sigue el precio de una onza de plata: la puerta al mercado de la plata desde la misma billetera. Igual que con AUKA, la figura de respaldo del metal no está cerrada, y hasta que lo esté no te voy a decir que la plata está guardada.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
  ],
  "AUKA": [
    {
      titulo: "AUKA",
      parrafos: [
        "AUKA sigue el precio de una onza de oro: es la forma de tener exposición al oro dentro del ecosistema sin custodiarlo vos. La figura de respaldo del metal —quién lo guarda, bajo qué contrato y con qué auditoría— está en manos de la Junta y no está firmada, así que hasta que lo esté te digo lo que sí es: sigue el precio, no te entrega el metal.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
  ],
  "ONDK": [
    {
      titulo: "ONDK",
      parrafos: [
        "ONDK es Orden Global hecha token. Es un instrumento patrimonial digital, lo que en Próspera se llama un valor negociable —security token—, y es el único del ecosistema que sí está respaldado. Su valor viene de los activos del grupo: la minería, la infraestructura tecnológica y la participación en las compañías. Se gana por apreciación, y cada cierto tiempo Orden Global abre ventanas de recompra, que son una oportunidad puntual y no un derecho de rescate. No es una acción: no da voto ni te hace socio. No se mercadea en Estados Unidos.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
  ],
  "ORIGEN": [
    {
      titulo: "La referenciación de ORIGEN",
      estado: "dicho",
      parrafos: [
        "El ORIGEN es una moneda referenciada al precio del oro.",
        "Su valor se calcula con el precio del gramo de oro en dólares dividido entre cincuenta y cinco.",
        "Esa fórmula es una referencia de precio y no cambia.",
        "Detrás del ORIGEN hay una serie de activos en construcción: minas en etapas de validación, terrenos, las plataformas del ecosistema y la propia cadena de bloques.",
        "El término correcto en todos los documentos es referenciado, nunca respaldado.",
        "La emisión total es de un billón de ORIGEN, exacta y verificada en el génesis de la cadena.",
      ],
      datos: [
        ["Emisión total", "1.000.000.000.000 ORIGEN"],
        ["Fórmula de precio", "gramo de oro USD ÷ 55"],
        ["Figura jurídica", "referenciado"],
      ],
      fuente: "Expediente legal · Melany Ordóñez — Secretaria de la Junta, Orden Global Corp · 2026-08-18",
    },
    {
      titulo: "ORIGEN",
      parrafos: [
        "ORIGEN es la moneda de la cadena de Orden Global, y su valor está referenciado al oro: un ORIGEN es un gramin, la cincuentaicincoava parte de un gramo de oro, al precio del oro de hoy. La fórmula no la ponemos nosotros y no cambia, así que el precio lo podés rehacer con una calculadora cuando quieras. Se envía en segundos por nuestra propia cadena.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
    {
      titulo: "La comisión",
      parrafos: [
        "La comisión de red se paga siempre en ORIGEN, también cuando enviás otro token, y es mínima: nuestra cadena es propia. El equivalente lo ves antes de confirmar cualquier envío.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
    {
      titulo: "De dónde sale el valor de ORIGEN",
      parrafos: [
        "El precio de ORIGEN sale de una fórmula pública: el gramo de oro en dólares dividido entre cincuenta y cinco. No hay oro en bóveda detrás de ORIGEN — hay una referencia de precio, y te lo digo con esas palabras. Lo que sí se comprueba sin pedirnos nada es la cadena: la emisión total y cada movimiento están en ordenscan.com. Detrás del ecosistema hay activos en construcción —concesiones mineras en validación, terrenos, las plataformas y la propia cadena— y de esos hablamos por lo que son hoy, no por lo que serán.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
  ],
  "a-validador": [
    {
      titulo: "Riesgos abiertos",
      estado: "dicho",
      parrafos: [
        "Desde lo legal, hay tres frentes que son los más urgentes para el proyecto.",
        "El primero son las licencias. Hoy Orden Global opera con usuarios reales, tarjetas y plataformas activas, pero sin ninguna licencia emitida. El paquete regulatorio ante la RFSA está en preparación. Mientras no se obtenga, la operación se sostiene sobre una base regulatoria incompleta.",
        "El segundo es la propiedad intelectual. Ninguna marca del ecosistema está registrada, los dominios están a nombre personal de una socia, y el software no tiene una cesión de derechos firmada hacia la sociedad. Eso significa que, en estricto derecho, los activos que dan identidad y funcionamiento al sistema no son todavía plenamente de la empresa.",
        "El tercero son los contratos con los usuarios. Los cuatrocientos treinta y cinco usuarios activos no tienen términos y condiciones publicados, ni política de privacidad, ni un punto de aceptación que se pueda probar. Eso deja a la sociedad sin un marco claro de derechos y obligaciones frente a quienes ya usan el sistema.",
        "Los tres frentes comparten una misma raíz: la operación ya está viva, pero la base legal que debe sostenerla está por completarse.",
      ],
      datos: [
        ["Riesgo urgente 1", "Licencias — operación activa sin licencia emitida"],
        ["Riesgo urgente 2", "Propiedad intelectual — marcas, dominios y software sin titularidad formal de la sociedad"],
        ["Riesgo urgente 3", "Contratos de usuario — 435 usuarios sin términos ni aceptación registrable"],
      ],
      fuente: "Expediente legal · Melany Ordóñez — Secretaria de la Junta, Orden Global Corp · 2026-08-18",
    },
  ],
  "aura": [
    {
      titulo: "AU-RA",
      parrafos: [
        "Soy AU-RA: la inteligencia de Orden Global, modelo 1, en beta. Navego por vos, te explico el ecosistema y te dejo pagos preparados — pero nunca firmo: tu dinero se mueve solo con tu contraseña. Y sigo creciendo: cada versión voy a saber hacer más.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
  ],
  "cadena5550": [
    {
      titulo: "La cadena 5550",
      parrafos: [
        "Orden Global corre sobre su propia Layer 1: la cadena 5550, con Hyperledger Besu, consenso QBFT y máquina Shanghai. Ya no vivimos prestados en la red de otro — más rápida, más nuestra, sin pedirle permiso a nadie. Todo se puede ver en ordenscan.com.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
  ],
  "dec-remesas": [
    {
      titulo: "Remesas",
      parrafos: [
        "Con remesas ves cuánto llega del otro lado después de la comisión y del cambio, en nueve países. Te abro el calculador.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
  ],
  "genesis": [
    {
      titulo: "Genesis ID",
      parrafos: [
        "Genesis ID es tu identidad para todo el ecosistema: te verificás UNA vez y quedás verificado en todas partes. Es lo que hace que del otro lado del chat o de un cobro siempre haya una persona real.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
  ],
  "j-licencias": [
    {
      titulo: "Los puntos que la Secretaría dejó para la Junta",
      estado: "confirmado",
      parrafos: [
        "Primera y más urgente: decidir el plan y los tiempos para obtener las licencias ante la RFSA. Si no se toma, la operación seguirá activa con usuarios reales sobre una base regulatoria incompleta.",
        "Segunda: decidir la formalización de la propiedad intelectual, es decir, registrar las marcas, pasar los dominios a nombre de la sociedad y firmar la cesión de derechos del software. Si no se toma, los activos que dan identidad y funcionamiento al sistema no son plenamente de la empresa.",
        "Tercera: decidir la creación y publicación de los contratos con los usuarios, con términos, política de privacidad y un punto de aceptación que se pueda probar. Si no se toma, la sociedad sigue sin marco frente a los cuatrocientos treinta y cinco usuarios que ya usan el sistema.",
        "Cuarta: definir por escrito, con dictamen, la naturaleza de ORIGEN como referenciado, y corregir los textos de la web que todavía hablan de respaldo en oro y de certificación en bóveda. Si no se toma, persiste una discrepancia entre lo publicado y la realidad del activo.",
        "Quinta: resolver el frente de cumplimiento, aprobando el manual de prevención de blanqueo, nombrando al oficial de cumplimiento y cubriendo la transferencia internacional de datos. Si no se toma, la operación crece sin los controles que la regulación exigirá.",
        "Sexta: decidir el tratamiento fiscal de la emisión de los tokens y de la comisión por transacción. Si no se toma, se acumulan hechos sin encuadre fiscal definido.",
        "Séptima: llevar a acta el llamado acuerdo uno, que mantiene la cadena vieja como respaldo, para que deje de ser solo una decisión dicha. Si no se toma, una decisión importante queda sin registro formal.",
        "Octava: revisar la migración de la cadena nueva, que sustituye a la anterior como registro de saldos de los usuarios, y determinar si requiere aviso o consentimiento previo. Si no se hace antes, se migra el registro contable de personas reales sin verificar el trámite necesario.",
        "Sugerencia general para la Junta: que cada sociedad del sistema ordene también internamente sus aspectos corporativos. Esto incluye decidir si emite acciones y cuáles, si ajusta su estructura o su tipo de empresa, y cómo formaliza su gobierno. Ordenar esto da base firme a todo lo demás.",
        "Contradicción a resolver: el cerebro tenía registrado que la comisión por transacción estaba inactiva y cobraba cero. La información jurídica confirma que la comisión ya está activa en la cadena nueva. Las dos versiones deben conciliarse.",
      ],
      fuente: "Expediente legal · Melany Ordóñez — Secretaria de la Junta, Orden Global Corp · 2026-08-18",
    },
    {
      titulo: "Lo que viene",
      parrafos: [
        "AuCorp y Ordenexchange ya abrieron los dos: las cuentas en moneda local y la casa de cambio, con esta misma cuenta. AuCorp es la que antes se llamaba AUBANK — cambió el nombre, no la casa. El ecosistema no es una lista cerrada — crece.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
  ],
  "l-contratos": [
    {
      titulo: "Contratos con los usuarios",
      estado: "dicho",
      parrafos: [
        "Los términos y condiciones y la política de privacidad sí están publicados, en legal punto vetawallet punto com y en la propia billetera. Se comprobó que las cuatro páginas responden el dieciocho de agosto de dos mil veintiséis.",
        "Lo que sigue faltando no es el documento sino la prueba: no hay registro de que cada usuario aceptara, así que no se puede demostrar quién aceptó qué ni cuándo.",
        "Tampoco hay un contrato de usuario formal que regule la relación con quienes usan Veta Wallet.",
        "Los usuarios activos hoy son cuatrocientos treinta y cinco, con veinticuatro tarjetas emitidas.",
        "No hubo un punto de aceptación registrable cuando los usuarios abrieron su cuenta.",
        "No hay hoy una garantía ni una recompra comprometida hacia el usuario común si el precio de ORIGEN cae.",
        "La ley aplicable y el mecanismo de reclamaciones serían, en principio, los de Próspera y su arbitraje, pero esto todavía no se ha discutido ni definido.",
      ],
      datos: [
        ["Términos y condiciones", "publicados — legal.vetawallet.com/terminos"],
        ["Política de privacidad", "publicada — legal.vetawallet.com/privacidad"],
        ["Contrato de usuario", "inexistente"],
        ["Usuarios activos", "435"],
        ["Tarjetas emitidas", "24"],
        ["Punto de aceptación registrable", "no existe"],
        ["Garantía o recompra al usuario común", "ninguna"],
        ["Ley y reclamaciones", "por definir — Próspera/arbitraje asumido"],
      ],
      fuente: "Expediente legal · Melany Ordóñez — Secretaria de la Junta, Orden Global Corp · 2026-08-18",
    },
  ],
  "l-cumplimiento": [
    {
      titulo: "Identidad, prevención de blanqueo y datos personales",
      estado: "dicho",
      parrafos: [
        "La verificación de identidad del ecosistema se hace a través de la plataforma propia, Genesis ID.",
        "Genesis ID realiza verificación de personas, verificación de empresas y control de prevención de blanqueo de capitales.",
        "El manual de prevención de blanqueo del sistema está en proceso; aún no hay uno aprobado.",
        "Todavía no hay un oficial de cumplimiento nombrado; su designación está en proceso.",
        "Cuando la operación lo requiera, el reporte de operaciones sospechosas se hará ante la RFSA o la autoridad pertinente.",
        "Orden Global Corp es la responsable del tratamiento de los datos de los usuarios.",
        "Los datos se alojan en servidores situados en Estados Unidos: Genesis ID corre en Render, la base de datos en MongoDB Atlas y el servidor de la billetera en Heroku.",
        "El cotejo de rostro lo resuelve Amazon Rekognition en la región us-east-1. Comprobado el dieciocho de agosto de dos mil veintiséis en el diagnóstico del propio servicio.",
        "Durante un tiempo la política de privacidad publicada nombraba a Veriff como quien recibía el documento y el selfie. Veriff nunca llegó a conectarse; se corrigió el dieciocho de agosto de dos mil veintiséis.",
        "La política de privacidad sí está publicada, en legal punto vetawallet punto com y en la propia billetera. Su última actualización es del dieciocho de agosto de dos mil veintiséis.",
        "Las imágenes del documento se conservan cinco años, cifradas y con cada acceso registrado, y se borran solas al cumplirse el plazo.",
        "El selfie de verificación no se guarda en ningún momento: se coteja con la foto del documento y se descarta.",
        "La cobertura de la transferencia internacional de datos es un frente aún no abordado.",
      ],
      datos: [
        ["Plataforma de identidad", "Genesis ID — KYC / KYB / AML"],
        ["Manual AML/CFT", "en proceso, no aprobado"],
        ["Oficial de cumplimiento", "en proceso, sin nombrar"],
        ["Reporte de operaciones sospechosas", "futuro — ante RFSA o autoridad pertinente"],
        ["Responsable del tratamiento", "Orden Global Corp"],
        ["Alojamiento de datos", "Estados Unidos — Render, MongoDB Atlas, Heroku"],
        ["Proveedor de biometría", "Amazon Rekognition (us-east-1) — comprobado 18/08/2026"],
        ["Política de privacidad", "publicada — legal.vetawallet.com/privacidad, act. 18/08/2026"],
        ["Conservación de imágenes del documento", "5 años, cifradas, acceso registrado, borrado automático"],
        ["Conservación del selfie", "no se guarda"],
        ["Transferencia internacional de datos", "no abordada"],
      ],
      fuente: "Expediente legal · Melany Ordóñez — Secretaria de la Junta, Orden Global Corp · 2026-08-18",
    },
  ],
  "l-fiscal": [
    {
      titulo: "Fiscalidad",
      estado: "dicho",
      parrafos: [
        "Orden Global Corp tributa bajo el régimen fiscal de Próspera.",
        "Las obligaciones fiscales de la sociedad están al día.",
        "La sociedad no ha tenido todavía actividad que genere un hecho gravable.",
        "El tratamiento fiscal de la emisión de los tokens no se ha analizado aún.",
        "La comisión de una milésima de ORIGEN por transacción ya está activa en la cadena nueva.",
        "El tratamiento fiscal de esa comisión, y las obligaciones de información fiscal sobre los usuarios, son frentes todavía por determinar.",
      ],
      datos: [
        ["Régimen fiscal", "Próspera ZEDE"],
        ["Obligaciones al día", "sí"],
        ["Actividad gravable a la fecha", "ninguna"],
        ["Tratamiento fiscal de emisión de tokens", "sin analizar"],
        ["Comisión por transacción", "activa en cadena nueva — 0,001 ORIGEN"],
        ["Tratamiento fiscal de la comisión", "por determinar"],
        ["Obligaciones de información sobre usuarios", "por determinar"],
      ],
      fuente: "Expediente legal · Melany Ordóñez — Secretaria de la Junta, Orden Global Corp · 2026-08-18",
    },
  ],
  "l-gobernanza": [
    {
      titulo: "Gobernanza",
      estado: "confirmado",
      parrafos: [
        "Orden Global Corp se administra a través de una Junta Directiva de cinco miembros.",
        "La preside José Medardo Ordóñez Martínez, como presidente y director ejecutivo.",
        "El vicepresidente es Carlos Leonardo Paguada.",
        "La secretaria de la Junta es Melany Johan Ordóñez.",
        "Las dos vocales son Mayra Carolina Enamorado y Vanesa Carolina Pinto.",
        "Los acuerdos se documentan en actas firmadas por la secretaria, o en resoluciones escritas firmadas por todos los directores.",
        "La sociedad lleva un libro de actas donde se registran los acuerdos de la Junta.",
        "La Junta se reúne de forma ordinaria al menos cada trimestre. El quórum es de tres directores y las decisiones se toman por mayoría simple.",
        "Ciertas decisiones están reservadas a los accionistas: modificar los estatutos, nombrar o remover directores, disolver o fusionar la sociedad, crear nuevas series de acciones, y cualquier cambio de control.",
        "El presidente puede actuar solo en contratos de hasta cien mil dólares; por encima de esa cifra se requiere acuerdo de la Junta.",
        "Existe un acuerdo, conocido como acuerdo uno, según el cual la cadena vieja no se apaga ni se borra y queda como respaldo. Está dicho como decisión, pero todavía no consta en un acta a la vista.",
      ],
      datos: [
        ["Composición", "Junta de 5 miembros"],
        ["Presidente y CEO", "José Medardo Ordóñez Martínez"],
        ["Vicepresidente", "Carlos Leonardo Paguada"],
        ["Secretaria", "Melany Johan Ordóñez"],
        ["Vocal 1", "Mayra Carolina Enamorado"],
        ["Vocal 2", "Vanesa Carolina Pinto"],
        ["Quórum", "3 directores"],
        ["Reuniones ordinarias", "trimestrales"],
        ["Umbral CEO en solitario", "hasta USD 100,000"],
        ["Libro de actas", "existe"],
        ["Acuerdo uno — cadena vieja como respaldo", "dicho, sin acta a la vista"],
      ],
      fuente: "Expediente legal · Melany Ordóñez — Secretaria de la Junta, Orden Global Corp · 2026-08-18",
    },
  ],
  "l-licencias": [
    {
      titulo: "Licencias y régimen regulatorio",
      estado: "confirmado",
      parrafos: [
        "Hoy Orden Global Corp no tiene ninguna licencia emitida. Todo el paquete regulatorio está en preparación.",
        "El marco elegido es el de la Autoridad Reguladora de Servicios Financieros de Próspera, conocida como RFSA.",
        "Orden Global opera desde Próspera hacia el mundo, y esta capa del sistema es descentralizada.",
        "Por eso el marco regulatorio aplicable es el de Próspera, y no se requiere licencia en cada país donde reside un usuario.",
        "La expansión con licencias por país corresponde a una etapa posterior y a otra sociedad del sistema.",
        "La primera ola contempla cuatro trámites para esta sociedad.",
        "El primero es la licencia FinTech de Sistema Alternativo de Transacciones, Clase B, que ampara la operación de GoldeX Swap.",
        "El segundo es el Aviso de Oferta Exenta, que no es una licencia sino un mecanismo de exención, y cubre los cuatro tokens: ORIGEN, AUKA, AGKA y ONDK. Se presenta dentro de los quince días desde la primera venta u oferta, y solo permite colocación privada a inversionistas calificados, no oferta pública.",
        "El tercero es la Licencia de Compañía de Inversión, la más robusta del paquete. Permite ofertas de tokens a inversionistas acreditados o sofisticados, estructurar vehículos de inversión y tokenizar activos reales con respaldo regulatorio explícito. Exige cien mil dólares de capital o un sustituto por confirmar.",
        "El cuarto es la licencia de Prestamista No Bancario, que complementa la actividad del intercambio descentralizado con tokens autorizados.",
      ],
      datos: [
        ["Licencias vigentes hoy", "Ninguna"],
        ["Estado general", "En preparación"],
        ["Regulador", "RFSA — Próspera ZEDE"],
        ["Trámite 1", "FinTech ATS Clase B — GoldeX Swap — § 3-2-190"],
        ["Trámite 2", "Exempt Offering Notice — ORIGEN, AUKA, AGKA, ONDK — fee USD 225"],
        ["Trámite 3", "Investment Company License — § 3-2-164 — capital USD 100,000"],
        ["Trámite 4", "Non-Banking Lender — fee anual USD 200"],
        ["Plazos ATS", "15 días hábiles evaluación + 20 días hábiles inscripción"],
      ],
      fuente: "Expediente legal · Melany Ordóñez — Secretaria de la Junta, Orden Global Corp · 2026-08-18",
    },
  ],
  "l-pi": [
    {
      titulo: "Propiedad intelectual",
      estado: "dicho",
      parrafos: [
        "Ninguna de las marcas del ecosistema está registrada todavía. Ni Orden Global, ni Veta Wallet, ni Genesis ID, ni MyTokenPay, ni Ordenscan, ni ORIGEN, ni las demás.",
        "Los dominios están registrados a nombre personal de una de las socias, aunque dentro de cuentas de la sociedad contratadas con Amazon o con terceros.",
        "El software del ecosistema, la cadena, las billeteras y las plataformas, se considera de Orden Global y está alojado en plataformas a nombre de la sociedad, con acceso de la sociedad.",
        "No existe todavía un documento de cesión de derechos que transfiera formalmente la propiedad del software a Orden Global Corp.",
      ],
      datos: [
        ["Marcas registradas", "ninguna"],
        ["Dominios — titular legal", "persona natural (socia); en cuentas de la sociedad"],
        ["Software — control", "de la sociedad, alojado a su nombre"],
        ["Software — cesión de derechos", "inexistente"],
      ],
      fuente: "Expediente legal · Melany Ordóñez — Secretaria de la Junta, Orden Global Corp · 2026-08-18",
    },
  ],
  "l-sociedad": [
    {
      titulo: "Sociedad y jurisdicción",
      estado: "confirmado",
      parrafos: [
        "La sociedad responsable de todo el ecosistema Orden Global es Orden Global Corp, constituida en Próspera, en Honduras.",
        "De esta sociedad dependen la cadena de bloques, el cripto ORIGEN y todas las plataformas: Veta Wallet, Genesis ID, MyTokenPay, Ordenscan, GoldeX Swap, AuPad, LaunchPad y las tarjetas.",
        "Orden Global no es un proyecto aislado: es el segundo pilar del Sistema Financiero Social, y esta sociedad es su eje operativo.",
        "El presidente y director ejecutivo es José Medardo Ordóñez Martínez, quien es hoy el accionista único registrado.",
        "Está decidido reestructurar el capital en series de acciones para reflejar a los dueños económicos reales del ecosistema.",
        "El control se organizará a través de una serie de acciones fundadoras con voto reforzado, y se transferirá a una sociedad tenedora en Emiratos Árabes. Los documentos que formalizan estos cambios se están preparando.",
        "Existe además una sociedad en Canadá, Orden Global Blockchain Corp, que hoy no tiene función operativa ni papel de tenedora.",
        "Hay usuarios en varios países además de Honduras, entre ellos México, España, Italia, Reino Unido, Nueva Zelanda, Canadá, Costa Rica, El Salvador y Guatemala.",
      ],
      datos: [
        ["Sociedad", "Orden Global Corp"],
        ["Jurisdicción", "Próspera ZEDE, Roatán, Honduras"],
        ["Número de permiso", "88501978376475"],
        ["Primer registro", "23/07/2026"],
        ["Domicilio", "Beta Building, Oficina 6, St. John's Bay, Roatán, Islas de la Bahía 34101"],
        ["Presidente y CEO", "José Medardo Ordóñez Martínez"],
        ["Vicepresidente", "Carlos Leonardo Paguada"],
        ["Secretaria de Junta", "Melany Johan Ordóñez"],
        ["Entidad Canadá", "Orden Global Blockchain Corp, sin rol activo"],
        ["Rol en el SFS", "Eje del Pilar 2, Orden Global"],
      ],
      fuente: "Expediente legal · Melany Ordóñez — Secretaria de la Junta, Orden Global Corp · 2026-08-18",
    },
    {
      titulo: "Orden Global",
      parrafos: [
        "Orden Global es un ecosistema completo: tu dinero (Veta Wallet), tu gente (PULSE CHAT), tu negocio (MyTokenPay) y tu identidad (Genesis ID), todos conectados sobre nuestra propia cadena. Una cuenta, todas las puertas.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
  ],
  "l-tesoreria": [
    {
      titulo: "Tesorería y custodia",
      estado: "confirmado",
      parrafos: [
        "El tesoro de ORIGEN contiene la emisión total: un billón de ORIGEN.",
        "No está en una sola billetera, sino en cuatro billeteras madre.",
        "Cada billetera madre guarda doscientos cincuenta mil millones de ORIGEN, la cuarta parte del total.",
        "Desde las billeteras madre, los fondos se dividen hacia billeteras operativas según lo que define el tokenomics del sistema.",
        "Los fondos de las billeteras operativas se liberan según la referencia del oro.",
        "Las llaves se custodian según el Protocolo de Seguridad de Accesos y Credenciales del sistema.",
        "Ese protocolo gobierna tanto las llaves como la gestión de todas las billeteras.",
        "Para mover fondos de las billeteras madre se requiere un acta de la Junta Directiva.",
      ],
      datos: [
        ["Emisión total en tesoro", "1.000.000.000.000 ORIGEN"],
        ["Estructura del tesoro", "4 billeteras madre"],
        ["Saldo por billetera madre", "250.000.000.000 ORIGEN c/u"],
        ["Distribución", "de madres a operativas, según tokenomics"],
        ["Liberación de operativas", "según referencia de oro"],
        ["Custodia de llaves", "Protocolo de Seguridad de Accesos y Credenciales"],
        ["Regla de movimiento — madres", "acta de Junta Directiva"],
      ],
      fuente: "Expediente legal · Melany Ordóñez — Secretaria de la Junta, Orden Global Corp · 2026-08-18",
    },
  ],
  "l-tokens": [
    {
      titulo: "Naturaleza jurídica de los tokens",
      estado: "dicho",
      parrafos: [
        "Orden Global maneja una criptomoneda nativa y tres tokens.",
        "La criptomoneda es ORIGEN, el activo base de la cadena, referenciado al precio del oro. Sirve para guardar, enviar y pagar valor dentro del ecosistema.",
        "El primer token es AUKA, referenciado al oro. El segundo es AGKA, referenciado a la plata.",
        "La cadena tiene cincuenta y dos tokens en total. A la nueva cadena migran catorce. De esos catorce, los principales y propios de Orden Global son tres: ONDK, AUKA y AGKA. El resto son tokens creados para distintos proyectos.",
        "El tercer token propio es ONDK, y es el más particular del ecosistema.",
        "ONDK es un instrumento patrimonial digital: un título que representa valor económico del ecosistema Orden Global.",
        "Adquiere su valor de una serie de activos: los activos reales como la minería, la infraestructura tecnológica del sistema, y la participación en las compañías del ecosistema. Cuando esos activos valen más, ONDK vale más.",
        "El titular gana principalmente por apreciación: su ONDK vale más y realiza la ganancia cuando lo vende o intercambia.",
        "De forma secundaria, Orden Global abre cada cierto tiempo ventanas de recompra, en las que el titular puede vender su ONDK de vuelta al sistema. No es un derecho permanente, sino una oportunidad puntual.",
        "En Próspera, ONDK se estructura como un valor negociable, lo que en inglés se llama security token, y se declara respaldado por esos activos.",
        "Por ser un valor de inversión, la cobertura regulatoria de ONDK es la Licencia de Compañía de Inversión de la RFSA, y no puede mercadearse en Estados Unidos.",
        "Lo que ONDK no es: no es una acción. Quien lo tiene obtiene derechos económicos por contrato, pero no es socio, no vota y no aparece en el libro de accionistas.",
        "Los tokens nunca se describen como respaldados salvo ONDK bajo Próspera; los demás son referenciados. Y quienes los obtienen son adquirentes, no inversionistas.",
        "Los cuatro instrumentos se amparan bajo el mismo mecanismo regulatorio: el Aviso de Oferta Exenta ante la RFSA, para colocación privada a personas calificadas.",
      ],
      datos: [
        ["Criptomoneda nativa", "ORIGEN — referenciada al oro"],
        ["Token 1", "AUKA — referenciado al oro"],
        ["Token 2", "AGKA — referenciado a la plata"],
        ["Token 3", "ONDK — instrumento patrimonial digital / security token"],
        ["Tokens totales en cadena", "52 — migran 14"],
        ["ONDK — cómo adquiere valor", "activos reales, infraestructura, participación en compañías"],
        ["ONDK — ganancia del titular", "apreciación, y recompra por ventanas esporádicas"],
        ["ONDK — figura en Próspera", "respaldado"],
        ["ONDK — clasificación", "valor negociable (security)"],
        ["ONDK — cobertura", "Investment Company License RFSA"],
        ["ONDK — restricción", "no mercadeable en EE. UU."],
        ["Terminología", "referenciado, no respaldado; adquirente, no inversionista"],
      ],
      fuente: "Expediente legal · Melany Ordóñez — Secretaria de la Junta, Orden Global Corp · 2026-08-18",
    },
  ],
  "m-monarka": [
    {
      titulo: "Buena Vista - Monarka",
      datos: [
        ["Ubicación", "Danlí, El Paraíso"],
        ["Etapa", "Estimación de recursos / evaluación económica completada"],
        ["Tipo de depósito", "Oro orogénico asociado a arcos magmáticos, vetas de cuarzo"],
        ["Potencial estimado", "~1,500,000 oz (Indicado + Inferido: 436,960 oz cuantificadas a la fecha; potencial adicional estimado de 3–5 millones de toneladas a 6–10 g/t)"],
      ],
      aviso: "Estimación geológica conceptual o recurso Indicado/Inferido. NO constituye reserva mineral certificada hasta demostrar viabilidad económica (perforación, factibilidad, NI 43-101).",
      fuente: "Portafolio de inversiones mineras · Orden Global Corp · 14/08/2026",
    },
  ],
  "m-pantaleona": [
    {
      titulo: "Pantaleona",
      datos: [
        ["Ubicación", "San Marcos de Colón, Choluteca"],
        ["Etapa", "Exploración avanzada, camino a listado TSX-V"],
        ["Tipo de depósito", "Epitermal de baja sulfuración"],
        ["Potencial estimado", "~655,000 oz (rango 341,306 – 682,611 oz según escenario)"],
      ],
      aviso: "Estimación geológica conceptual o recurso Indicado/Inferido. NO constituye reserva mineral certificada hasta demostrar viabilidad económica (perforación, factibilidad, NI 43-101).",
      fuente: "Portafolio de inversiones mineras · Orden Global Corp · 14/08/2026",
    },
  ],
  "m-travesia": [
    {
      titulo: "Travesía",
      datos: [
        ["Ubicación", "Honduras (dato de ubicación pendiente de confirmar)"],
        ["Etapa", "Exploración temprana"],
        ["Tipo de depósito", "Pendiente de caracterización formal"],
        ["Potencial estimado", "~400,000 oz (dato preliminar — sin soporte de informe técnico disponible en el repositorio actual; pendiente de incorporar reporte geológico específico)"],
      ],
      aviso: "Estimación geológica conceptual o recurso Indicado/Inferido. NO constituye reserva mineral certificada hasta demostrar viabilidad económica (perforación, factibilidad, NI 43-101).",
      fuente: "Portafolio de inversiones mineras · Orden Global Corp · 14/08/2026",
    },
  ],
  "m-zonasur": [
    {
      titulo: "Otros prospectos en generación",
      datos: [
        ["Ubicación", "Zona sur de Honduras y otras regiones"],
        ["Etapa", "Identificación / evaluación temprana derivada de la base de datos de INDEXSA"],
        ["Tipo de depósito", "Sistemas epitermales y vetas de cuarzo Au-Ag"],
        ["Potencial estimado", "En proceso de exploración; parte del pipeline continuo de INDEXSA (potencial regional agregado de hasta 34.6M oz identificado en 138 vetas de la zona sur)"],
      ],
      aviso: "Estimación geológica conceptual o recurso Indicado/Inferido. NO constituye reserva mineral certificada hasta demostrar viabilidad económica (perforación, factibilidad, NI 43-101).",
      fuente: "Portafolio de inversiones mineras · Orden Global Corp · 14/08/2026",
    },
  ],
  "mtp-app": [
    {
      titulo: "MyTokenPay",
      parrafos: [
        "MyTokenPay es la capa de comercio: cobrás con un QR, explorás negocios que aceptan ORIGEN y pagás desde tu misma billetera.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
  ],
  "pulsechat": [
    {
      titulo: "PULSE CHAT",
      parrafos: [
        "PULSE CHAT es la mensajería del ecosistema: solo entra gente con Genesis ID aprobado, podés mandar dinero sin salir del hilo y cada pago deja su comprobante verificable en la cadena.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
  ],
  "s-seed": [
    {
      titulo: "Quién guarda tus llaves",
      parrafos: [
        "Tu frase de respaldo es tuya y solo tuya: no se la digas a nadie, ni a mí. Yo no la necesito para nada — yo preparo y vos firmás con tu contraseña. Guardala escrita en un sitio seguro: es lo único que abre tu dinero si perdés el teléfono.",
      ],
      fuente: "Saber de la casa · revisado por jose@ordenglobal.org · 2026-08-16",
    },
  ],
};

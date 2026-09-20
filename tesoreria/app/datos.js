/* ============================================================
   Orden Global · Tesorería — semilla de datos
   Cifras de demostración coherentes con las reglas del núcleo:
   ORIGEN emitido ≤ reservas admisibles, y cada token emitido
   consume una asignación de ORIGEN. Cambiar aquí = cambiar todo.
   ============================================================ */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TesoreriaSemilla = fabrica();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const hoy = new Date('2026-09-19T12:00:00Z');
  const dias = (n) => new Date(hoy.getTime() + n * 86400000).toISOString();

  const estado = {
    version: 2,
    /* Quién está mirando. En modo local es fijo; con servidor lo pone la sesión. */
    sesion: { usuario: 'J. Enamorado', rol: 'presidente', modo: 'local' },
    /* El Consejo firmante. Con servidor sale de los operadores con rol de consejero. */
    consejo: ['J. Enamorado', 'M. Arroyo', 'L. Bermúdez', 'R. Castellanos', 'A. Villalobos'],

    /* --- política del ecosistema: las reglas duras --- */
    politica: {
      ratioObjetivo: 115,        // % de reservas admisibles sobre ORIGEN emitido
      ratioMinimo: 105,          // por debajo de esto no se aprueba ninguna emisión
      firmasRequeridas: 3,       // multifirma M-de-N del Consejo
      diasObjecion: 7,           // ventana pública de objeción
      congelado: false,          // freno de emergencia global
      moneda: 'USD',
      revisionValuacionMeses: 6,
      bandaSecundario: 0.05,     // ±5% sobre el precio de referencia certificado
      // Precio de referencia del oro con el que se valora el ORIGEN en circulación.
      // Lo fija el Consejo contra un fix público; si tiene más de 30 días, el panel avisa.
      oroUsdPorGramo: 110.00,
      oroFuente: 'LBMA PM fix · promedio 5 días',
      oroFecha: dias(-3),
    },

    /* --- ORIGEN: la unidad de respaldo --- */
    /* ORIGEN es la cripto nativa de la cadena 5550: 1 ORIGEN = 1 gramín = 1/55 g de oro en bóveda. */
    origen: {
      emitido: 26000000,
      quemado: 750000,
      unidad: 'ORIGEN',
      gramosPorUnidad: 1 / 55,
      paridad: '1 ORIGEN = 1 gramín = 1/55 g de oro certificado en bóveda',
      cadena: 5550,
    },

    /* --- reservas reales certificadas --- */
    reservas: [
      {
        id: 'RES-AU-01', nombre: 'Oro doré en bóveda', clase: 'Metal precioso',
        detalle: '12,400 oz t de oro doré refinado, lotes MCM-24-118 a MCM-26-042',
        custodio: 'Brink\'s Global Services México', auditor: 'Grant Thornton',
        certificado: 'CERT-AU-2026-0118', valorCertificado: 18400000, moneda: 'USD',
        haircut: 0.15, estado: 'certificada', fechaCert: dias(-52), vence: dias(128),
        docHash: 'A41F09C2', origenSerie: 'Maple Commercial Minerals',
      },
      {
        id: 'RES-MIN-02', nombre: 'Concesión minera La Encantada', clase: 'Recurso mineral',
        detalle: 'Reservas probadas y probables (2P) certificadas bajo estándar NI 43-101',
        custodio: 'Maple Commercial Minerals S.A. de C.V.', auditor: 'SRK Consulting',
        certificado: 'NI43101-LE-2026', valorCertificado: 42000000, moneda: 'USD',
        haircut: 0.35, estado: 'certificada', fechaCert: dias(-118), vence: dias(247),
        docHash: 'D7B23E10', origenSerie: 'Maple Commercial Minerals',
      },
      {
        id: 'RES-INM-03', nombre: 'Inmueble corporativo Polanco', clase: 'Inmobiliario',
        detalle: 'Torre de oficinas, 2,140 m² rentables, libre de gravamen',
        custodio: 'Fideicomiso CIB/3392', auditor: 'CBRE Valuation',
        certificado: 'AVAL-CBRE-2026-77', valorCertificado: 9600000, moneda: 'USD',
        haircut: 0.25, estado: 'certificada', fechaCert: dias(-74), vence: dias(291),
        docHash: '5C90AA31', origenSerie: 'Orden Global Corp',
      },
      {
        id: 'RES-CAJ-04', nombre: 'Caja y equivalentes', clase: 'Efectivo',
        detalle: 'Cuentas segregadas de tesorería, disponibilidad inmediata',
        custodio: 'BBVA México · cuenta segregada', auditor: 'Grant Thornton',
        certificado: 'SALDO-2026-Q3', valorCertificado: 6250000, moneda: 'USD',
        haircut: 0.02, estado: 'certificada', fechaCert: dias(-12), vence: dias(78),
        docHash: 'E1044B6F', origenSerie: 'Orden Global Corp',
      },
      {
        id: 'RES-CXC-05', nombre: 'Cuentas por cobrar por concentrados', clase: 'Cuenta por cobrar',
        detalle: 'Contratos de off-take con comprador internacional, vencimiento 90 días',
        custodio: 'Orden Global Corp', auditor: 'Grant Thornton',
        certificado: 'OFFTAKE-2026-11', valorCertificado: 4800000, moneda: 'USD',
        haircut: 0.40, estado: 'certificada', fechaCert: dias(-31), vence: dias(59),
        docHash: '9AB7C205', origenSerie: 'Maple Commercial Minerals',
      },
      {
        id: 'RES-PLA-06', nombre: 'Planta de beneficio', clase: 'Activo fijo',
        detalle: 'Planta de 500 t/día — tasación en proceso, no computa hasta certificarse',
        custodio: 'Maple Commercial Minerals S.A. de C.V.', auditor: 'SRK Consulting',
        certificado: '—', valorCertificado: 12000000, moneda: 'USD',
        haircut: 0.30, estado: 'en_revision', fechaCert: null, vence: null,
        docHash: '—', origenSerie: 'Maple Commercial Minerals',
      },
      {
        id: 'RES-AG-07', nombre: 'Plata en concentrado', clase: 'Metal precioso',
        detalle: 'Certificado vencido: no computa al respaldo hasta su renovación',
        custodio: 'Brink\'s Global Services México', auditor: 'Grant Thornton',
        certificado: 'CERT-AG-2025-0904', valorCertificado: 3200000, moneda: 'USD',
        haircut: 0.20, estado: 'certificada', fechaCert: dias(-398), vence: dias(-33),
        docHash: '6F12D8A4', origenSerie: 'Maple Commercial Minerals',
      },
    ],

    /* --- asignaciones de ORIGEN comprometidas por token --- */
    asignaciones: [
      { id: 'ASG-0001', tokenId: 'SEC-ONDK', solicitudId: 'SOL-0004', monto: 33300000, estado: 'comprometida', fecha: dias(-210) },
      { id: 'ASG-0002', tokenId: 'SEC-MPLE', solicitudId: 'SOL-0005', monto: 8400000, estado: 'comprometida', fecha: dias(-150) },
      { id: 'ASG-0003', tokenId: 'UTL-VETA', solicitudId: 'SOL-0006', monto: 1850000, estado: 'comprometida', fecha: dias(-120) },
      { id: 'ASG-0004', tokenId: 'UTL-OGS', solicitudId: 'SOL-0007', monto: 420000, estado: 'comprometida', fecha: dias(-96) },
      { id: 'ASG-0005', tokenId: 'UTL-MTP', solicitudId: 'SOL-0008', monto: 260000, estado: 'comprometida', fecha: dias(-64) },
    ],

    /* --- emisores registrados --- */
    emisores: [
      {
        id: 'EM-OG', nombre: 'Orden Global Corp', jurisdiccion: 'Panamá / Delaware',
        lei: '5493001KJTIIGC8Y1R12', representante: 'J. Enamorado', estado: 'vigente',
        registro: 'OGC-2024-0001', auditor: 'Grant Thornton', desde: dias(-820),
      },
      {
        id: 'EM-MPL', nombre: 'Maple Commercial Minerals S.A. de C.V.', jurisdiccion: 'México',
        lei: '5493009MPLE0TX44Q88', representante: 'M. Arroyo', estado: 'vigente',
        registro: 'MCM-2025-0007', auditor: 'SRK Consulting', desde: dias(-540),
      },
      {
        id: 'EM-VT', nombre: 'Veta Real Estate SPV I', jurisdiccion: 'México',
        lei: '5493004VTRE11PP2055', representante: 'L. Bermúdez', estado: 'en_registro',
        registro: 'VRE-2026-0031', auditor: 'CBRE Valuation', desde: dias(-88),
      },
    ],

    /* --- SECURITY TOKENS --- */
    securities: [
      {
        id: 'SEC-ONDK', simbolo: 'ONDK', nombre: 'Orden Digital Kapital',
        emisorId: 'EM-OG', tipo: 'asset_backed',
        jurisdiccion: 'Panamá', exencion: 'Reg S + Reg D 506(c)',
        isin: 'PA000ONDK019', cadena: 'Orden Global Chain (5550)',
        contrato: '0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1',
        activo: {
          descripcion: 'Canasta de reservas minerales certificadas e inmueble corporativo',
          clase: 'Multi-activo respaldado', ubicacion: 'México · Panamá',
          reservas: ['RES-AU-01', 'RES-MIN-02', 'RES-INM-03'],
        },
        valuacion: {
          metodo: 'NAV de activos certificados (suma de partes, con aforo)',
          valorCertificado: 34000000, valuador: 'Grant Thornton · SRK Consulting',
          fecha: dias(-52), proximaRevision: dias(129), informeHash: 'VAL-ONDK-2026-Q3',
          comite: ['J. Enamorado', 'M. Arroyo', 'R. Castellanos'],
          historial: [
            { fecha: dias(-418), valor: 24000000, precio: 0.06 },
            { fecha: dias(-236), valor: 29500000, precio: 0.06 },
            { fecha: dias(-52), valor: 34000000, precio: 0.06 },
          ],
        },
        // 555 M es lo que la cadena 5550 dice que existe de ONDK: el registro parte de ahí.
        precioUnitario: 0.06, moneda: 'USD',
        supply: { autorizado: 555000000, emitido: 555000000, enTesoreria: 24975000, quemado: 0 },
        tenedores: 412, lockupHasta: dias(-30),
        dividendo: { politica: 'Distribución del 40% del flujo neto por venta de concentrados, semestral', ultimoPago: dias(-96), montoUltimo: 640000, yield: 4.8 },
        mercado: {
          estado: 'ventana', banda: 0.05, referencia: 0.06, ultimaOperacion: 0.061,
          volumen30d: 1840000, ventanas: 'Martes y jueves, 10:00–14:00 CDMX',
          proximaVentana: dias(1),
        },
        cumplimiento: {
          kyc: true, acreditados: true, transferAgent: 'Orden Global Transfer Agent',
          restricciones: 'Transferencia solo entre carteras con Genesis ID verificado y perfil de inversionista acreditado',
          reportes: [
            { periodo: '2026-Q2', tipo: 'Estado financiero auditado', estado: 'al_corriente', fecha: dias(-72) },
            { periodo: '2026-Q3', tipo: 'Prueba de reservas', estado: 'al_corriente', fecha: dias(-8) },
            { periodo: '2026-Q4', tipo: 'Estado financiero auditado', estado: 'programado', fecha: dias(84) },
          ],
        },
        origenAsignado: 33300000,
        estado: 'listado',
        creado: dias(-418),
      },
      {
        id: 'SEC-MPLE', simbolo: 'MPLE', nombre: 'Maple Minerals Equity',
        emisorId: 'EM-MPL', tipo: 'equity',
        jurisdiccion: 'México', exencion: 'Oferta privada (LMV art. 8)',
        isin: 'MX00MPLE0015', cadena: 'Orden Global Chain (5550)', contrato: null,
        activo: {
          descripcion: 'Participación accionaria del 18% en Maple Commercial Minerals',
          clase: 'Capital accionario', ubicacion: 'Coahuila, México',
          reservas: ['RES-MIN-02', 'RES-CXC-05'],
        },
        valuacion: {
          metodo: 'Flujo descontado (DCF) sobre plan minero a 8 años',
          valorCertificado: 9000000, valuador: 'SRK Consulting',
          fecha: dias(-150), proximaRevision: dias(31), informeHash: 'VAL-MPLE-2026-H1',
          comite: ['M. Arroyo', 'L. Bermúdez', 'A. Villalobos'],
          historial: [
            { fecha: dias(-330), valor: 7400000, precio: 25.00 },
            { fecha: dias(-150), valor: 9000000, precio: 25.00 },
          ],
        },
        precioUnitario: 25.00, moneda: 'USD',
        supply: { autorizado: 360000, emitido: 336000, enTesoreria: 12000, quemado: 0 },
        tenedores: 87, lockupHasta: dias(96),
        dividendo: { politica: 'Dividendo anual sujeto a utilidad neta auditada', ultimoPago: dias(-280), montoUltimo: 210000, yield: 2.5 },
        mercado: {
          estado: 'suspendido', banda: 0.05, referencia: 25.00, ultimaOperacion: 25.00,
          volumen30d: 0, ventanas: 'Suspendido hasta cierre del lock-up',
          proximaVentana: dias(96),
        },
        cumplimiento: {
          kyc: true, acreditados: true, transferAgent: 'Orden Global Transfer Agent',
          restricciones: 'Lock-up de 12 meses desde la emisión. Derecho de tanto a favor del emisor.',
          reportes: [
            { periodo: '2026-Q2', tipo: 'Estado financiero auditado', estado: 'vencido', fecha: dias(-19) },
            { periodo: '2026-Q3', tipo: 'Reporte de producción', estado: 'al_corriente', fecha: dias(-11) },
          ],
        },
        origenAsignado: 8400000,
        estado: 'listado',
        creado: dias(-330),
      },
      {
        id: 'SEC-VTRE', simbolo: 'VTRE', nombre: 'Veta Real Estate Series I',
        emisorId: 'EM-VT', tipo: 'revenue_share',
        jurisdiccion: 'México', exencion: 'Oferta privada (LMV art. 8)',
        isin: '—', cadena: 'Orden Global Chain (5550)', contrato: null,
        activo: {
          descripcion: 'Participación en la renta neta del inmueble corporativo Polanco',
          clase: 'Participación en ingresos', ubicacion: 'Ciudad de México',
          reservas: ['RES-INM-03'],
        },
        valuacion: {
          metodo: 'Capitalización de rentas (cap rate 7.4%)',
          valorCertificado: 6000000, valuador: 'CBRE Valuation',
          fecha: dias(-74), proximaRevision: dias(107), informeHash: 'VAL-VTRE-2026-01',
          comite: ['L. Bermúdez', 'J. Enamorado', 'R. Castellanos'],
          historial: [{ fecha: dias(-74), valor: 6000000, precio: 100.00 }],
        },
        precioUnitario: 100.00, moneda: 'USD',
        supply: { autorizado: 0, emitido: 0, enTesoreria: 0, quemado: 0 },
        tenedores: 0, lockupHasta: dias(365),
        dividendo: { politica: 'Distribución mensual del 90% de la renta neta', ultimoPago: null, montoUltimo: 0, yield: 7.4 },
        mercado: {
          estado: 'suspendido', banda: 0.05, referencia: 100.00, ultimaOperacion: null,
          volumen30d: 0, ventanas: 'Sin listar', proximaVentana: null,
        },
        cumplimiento: {
          kyc: true, acreditados: true, transferAgent: 'Orden Global Transfer Agent',
          restricciones: 'Pendiente de autorización de emisión por la Autoridad de ORIGEN',
          reportes: [],
        },
        origenAsignado: 0,
        estado: 'en_registro',
        creado: dias(-74),
      },
    ],

    /* --- UTILITY TOKENS --- */
    utilities: [
      {
        id: 'UTL-VETA', simbolo: 'VETA', nombre: 'Veta Wallet Credits',
        servicio: 'Veta Wallet — comisiones de red, envíos y servicios de cartera',
        unidadServicio: '1 VETA = 1 transferencia interna con prioridad',
        emisorId: 'EM-OG', cadena: 'Orden Global Chain (5550)', contrato: null,
        precioAncla: 0.85, moneda: 'USD',
        redimible: 0.30,
        supply: { maximo: 12000000, autorizado: 10000000, emitido: 9000000, enTesoreria: 1350000, quemado: 400000 },
        capacidad: { comprometida: 8100000, unidad: 'transferencias priorizadas', proveedor: 'Infraestructura Orden Global (nodos + relayer)', contrato: 'CAP-VETA-2026-03', vigencia: dias(196) },
        grifos: [
          { nombre: 'Recompensa por verificación Genesis ID', tasa: '25 VETA por usuario verificado' },
          { nombre: 'Referidos activos', tasa: '10 VETA por referido con primer envío' },
        ],
        sumideros: [
          { nombre: 'Comisión de envío prioritario', tasa: '1 VETA por operación' },
          { nombre: 'Quema del 20% de comisiones cobradas', tasa: 'automática mensual' },
        ],
        consumo30d: 386000, quema30d: 77200,
        origenAsignado: 1850000,
        estado: 'listado', creado: dias(-380),
        vesting: [
          { lote: 'Equipo', monto: 900000, liberado: 0.35, hasta: dias(420) },
          { lote: 'Ecosistema', monto: 1800000, liberado: 0.55, hasta: dias(300) },
        ],
      },
      {
        id: 'UTL-OGS', simbolo: 'OGS', nombre: 'OGScan Query Credits',
        servicio: 'OGScan — consultas al explorador, índices y API de la cadena',
        unidadServicio: '1 OGS = 1,000 consultas a la API indexada',
        emisorId: 'EM-OG', cadena: 'Orden Global Chain (5550)', contrato: null,
        precioAncla: 0.35, moneda: 'USD',
        redimible: 0.40,
        supply: { maximo: 8000000, autorizado: 4200000, emitido: 4000000, enTesoreria: 380000, quemado: 620000 },
        capacidad: { comprometida: 3150000, unidad: 'paquetes de 1,000 consultas', proveedor: 'Clúster de indexación OGScan (AWS)', contrato: 'CAP-OGS-2026-02', vigencia: dias(104) },
        grifos: [
          { nombre: 'Cuota gratuita para desarrolladores', tasa: '50 OGS mensuales por proyecto' },
        ],
        sumideros: [
          { nombre: 'Consumo de API', tasa: '1 OGS por paquete' },
          { nombre: 'Quema por consumo', tasa: '100% del token consumido se quema' },
        ],
        consumo30d: 212000, quema30d: 212000,
        origenAsignado: 420000,
        estado: 'listado', creado: dias(-300),
        vesting: [{ lote: 'Ecosistema de desarrolladores', monto: 600000, liberado: 0.42, hasta: dias(260) }],
      },
      {
        id: 'UTL-MTP', simbolo: 'MTP', nombre: 'MyTokenPay Gateway Credits',
        servicio: 'MyTokenPay — procesamiento de cobros y liquidación a comercios',
        unidadServicio: '1 MTP = 1 liquidación a comercio sin comisión variable',
        emisorId: 'EM-OG', cadena: 'Orden Global Chain (5550)', contrato: null,
        precioAncla: 0.50, moneda: 'USD',
        redimible: 0.20,
        supply: { maximo: 6000000, autorizado: 3000000, emitido: 2800000, enTesoreria: 250000, quemado: 150000 },
        capacidad: { comprometida: 2280000, unidad: 'liquidaciones', proveedor: 'Pasarela MyTokenPay + banco liquidador', contrato: 'CAP-MTP-2025-09', vigencia: dias(41) },
        grifos: [{ nombre: 'Alta de comercio', tasa: '200 MTP por comercio activado' }],
        sumideros: [{ nombre: 'Liquidación procesada', tasa: '1 MTP por liquidación' }],
        consumo30d: 94000, quema30d: 94000,
        origenAsignado: 260000,
        estado: 'listado', creado: dias(-210),
        vesting: [],
      },
    ],

    /* --- solicitudes de emisión ante la Autoridad de ORIGEN --- */
    solicitudes: [
      {
        id: 'SOL-0001', tipo: 'security', tokenId: 'SEC-VTRE', simbolo: 'VTRE',
        accion: 'emision_inicial', cantidad: 60000, precio: 100.00,
        origenRequerido: 6000000,
        causa: 'nuevo_activo',
        motivo: 'Emisión inicial de la Serie I contra el inmueble corporativo Polanco, ya certificado y libre de gravamen (RES-INM-03).',
        evidencias: [
          { nombre: 'Avalúo CBRE 2026-77', hash: '5C90AA31', tipo: 'Valuación independiente' },
          { nombre: 'Acta de constitución del SPV', hash: 'B2E71F04', tipo: 'Corporativo' },
          { nombre: 'Certificado de libertad de gravamen', hash: 'C8043DD9', tipo: 'Registral' },
        ],
        solicitante: 'L. Bermúdez', creada: dias(-4),
        estado: 'en_revision',
        firmas: [{ quien: 'L. Bermúdez', ts: dias(-4) }],
        firmasRequeridas: 3, ventanaObjecionHasta: dias(3), dictamen: null,
      },
      {
        id: 'SOL-0002', tipo: 'utility', tokenId: 'UTL-OGS', simbolo: 'OGS',
        accion: 'emision_adicional', cantidad: 500000, precio: 0.35,
        origenRequerido: 70000,
        causa: 'capacidad',
        motivo: 'Ampliación del clúster de indexación: el contrato CAP-OGS-2026-02 sube la capacidad comprometida en 500,000 paquetes. La emisión no excede la capacidad nueva.',
        evidencias: [
          { nombre: 'Adenda de capacidad AWS', hash: '77C1B0E3', tipo: 'Contrato de capacidad' },
          { nombre: 'Métricas de consumo 90 días', hash: '1D5FA92B', tipo: 'Telemetría' },
        ],
        solicitante: 'R. Castellanos', creada: dias(-2),
        estado: 'en_revision',
        firmas: [{ quien: 'R. Castellanos', ts: dias(-2) }, { quien: 'A. Villalobos', ts: dias(-1) }],
        firmasRequeridas: 3, ventanaObjecionHasta: dias(5), dictamen: null,
      },
      {
        id: 'SOL-0003', tipo: 'security', tokenId: 'SEC-ONDK', simbolo: 'ONDK',
        accion: 'emision_adicional', cantidad: 277500000, precio: 0.06,
        origenRequerido: 16650000,
        causa: 'revaluacion',
        motivo: 'Solicitud de ampliación apoyada en la planta de beneficio (RES-PLA-06).',
        evidencias: [{ nombre: 'Tasación preliminar de planta', hash: '0E93A155', tipo: 'Valuación preliminar' }],
        solicitante: 'M. Arroyo', creada: dias(-21), resuelta: dias(-17),
        estado: 'rechazada',
        firmas: [{ quien: 'M. Arroyo', ts: dias(-21) }],
        firmasRequeridas: 3, ventanaObjecionHasta: dias(-14),
        dictamen: 'Rechazada: la planta de beneficio está en revisión y no computa como reserva admisible. Sin respaldo certificado no hay emisión.',
      },
      {
        id: 'SOL-0004', tipo: 'security', tokenId: 'SEC-ONDK', simbolo: 'ONDK',
        accion: 'emision_inicial', cantidad: 555000000, precio: 0.06,
        origenRequerido: 33300000, causa: 'nuevo_activo',
        motivo: 'Emisión fundacional de ONDK contra la canasta de reservas certificadas.',
        evidencias: [{ nombre: 'Informe NI 43-101', hash: 'D7B23E10', tipo: 'Valuación independiente' }],
        solicitante: 'J. Enamorado', creada: dias(-214), resuelta: dias(-210),
        estado: 'aprobada',
        firmas: [{ quien: 'J. Enamorado', ts: dias(-214) }, { quien: 'M. Arroyo', ts: dias(-213) }, { quien: 'R. Castellanos', ts: dias(-211) }],
        firmasRequeridas: 3, ventanaObjecionHasta: dias(-207),
        dictamen: 'Respaldo verificado. Emisión autorizada.',
      },
      {
        id: 'SOL-0005', tipo: 'security', tokenId: 'SEC-MPLE', simbolo: 'MPLE',
        accion: 'emision_inicial', cantidad: 360000, precio: 25.00,
        origenRequerido: 8400000, causa: 'ampliacion_capital',
        motivo: 'Colocación privada del 18% de Maple Commercial Minerals.',
        evidencias: [{ nombre: 'Acta de asamblea extraordinaria', hash: 'FA23C701', tipo: 'Corporativo' }],
        solicitante: 'M. Arroyo', creada: dias(-154), resuelta: dias(-150),
        estado: 'aprobada',
        firmas: [{ quien: 'M. Arroyo', ts: dias(-154) }, { quien: 'J. Enamorado', ts: dias(-153) }, { quien: 'L. Bermúdez', ts: dias(-152) }],
        firmasRequeridas: 3, ventanaObjecionHasta: dias(-147),
        dictamen: 'Respaldo verificado. Emisión autorizada.',
      },
    ],

    /* --- libro de órdenes de la ventana de negociación (mercado secundario) --- */
    ordenes: [
      { id: 'ORD-101', tokenId: 'SEC-ONDK', lado: 'compra', cantidad: 1660000, precio: 0.0603, estado: 'abierta', ts: dias(-1) },
      { id: 'ORD-102', tokenId: 'SEC-ONDK', lado: 'compra', cantidad: 1180000, precio: 0.0598, estado: 'abierta', ts: dias(-1) },
      { id: 'ORD-103', tokenId: 'SEC-ONDK', lado: 'compra', cantidad: 3470000, precio: 0.0592, estado: 'abierta', ts: dias(-2) },
      { id: 'ORD-104', tokenId: 'SEC-ONDK', lado: 'venta', cantidad: 1250000, precio: 0.0611, estado: 'abierta', ts: dias(-1) },
      { id: 'ORD-105', tokenId: 'SEC-ONDK', lado: 'venta', cantidad: 2220000, precio: 0.0617, estado: 'abierta', ts: dias(-2) },
      { id: 'ORD-106', tokenId: 'SEC-ONDK', lado: 'venta', cantidad: 4160000, precio: 0.0628, estado: 'abierta', ts: dias(-3) },
    ],

    /* --- registro de tenedores (muestra del cap table) --- */
    tenedores: [
      { id: 'TEN-001', tokenId: 'SEC-ONDK', nombre: 'Fondo Atlante I', genesisId: 'GEN-4821-0093', tipo: 'Institucional', pais: 'Panamá', cantidad: 108225000, desde: dias(-206), estado: 'verificado', lockup: null },
      { id: 'TEN-002', tokenId: 'SEC-ONDK', nombre: 'J. Enamorado', genesisId: 'GEN-1001-0001', tipo: 'Fundador', pais: 'México', cantidad: 166500000, desde: dias(-210), estado: 'verificado', lockup: dias(120) },
      { id: 'TEN-003', tokenId: 'SEC-ONDK', nombre: 'Grupo Sierra Madre', genesisId: 'GEN-7730-1184', tipo: 'Institucional', pais: 'México', cantidad: 74925000, desde: dias(-160), estado: 'verificado', lockup: null },
      { id: 'TEN-004', tokenId: 'SEC-ONDK', nombre: 'Inversionistas acreditados (409)', genesisId: '—', tipo: 'Retail acreditado', pais: 'Varios', cantidad: 180375000, desde: dias(-150), estado: 'verificado', lockup: null },
      { id: 'TEN-005', tokenId: 'SEC-ONDK', nombre: 'Tesorería Orden Global', genesisId: 'GEN-0000-0000', tipo: 'Tesorería', pais: 'Panamá', cantidad: 24975000, desde: dias(-210), estado: 'verificado', lockup: null },
      { id: 'TEN-006', tokenId: 'SEC-MPLE', nombre: 'Maple Holding B.V.', genesisId: 'GEN-3312-8890', tipo: 'Institucional', pais: 'Países Bajos', cantidad: 200000, desde: dias(-150), estado: 'verificado', lockup: dias(96) },
      { id: 'TEN-007', tokenId: 'SEC-MPLE', nombre: 'Inversionistas acreditados (86)', genesisId: '—', tipo: 'Retail acreditado', pais: 'México', cantidad: 124000, desde: dias(-140), estado: 'verificado', lockup: dias(96) },
      { id: 'TEN-008', tokenId: 'SEC-MPLE', nombre: 'Tesorería Orden Global', genesisId: 'GEN-0000-0000', tipo: 'Tesorería', pais: 'Panamá', cantidad: 12000, desde: dias(-150), estado: 'verificado', lockup: null },
    ],

    /* --- anclas del libro publicadas en la cadena 5550 --- */
    anclas: [],

    /* --- libro sellado: se encadena al cargar --- */
    libro: [
      { id: 'EV-0009', ts: dias(-1), actor: 'A. Villalobos', rol: 'Consejero', tipo: 'solicitud.firmada', detalle: 'A. Villalobos firmó SOL-0002', nivel: 'info' },
      { id: 'EV-0008', ts: dias(-2), actor: 'R. Castellanos', rol: 'Consejero', tipo: 'solicitud.creada', detalle: 'OGS · Emisión adicional de 500,000 tokens ($70 k de ORIGEN)', nivel: 'info' },
      { id: 'EV-0007', ts: dias(-4), actor: 'L. Bermúdez', rol: 'Consejero', tipo: 'solicitud.creada', detalle: 'VTRE · Emisión inicial de 60,000 tokens ($6 M de ORIGEN)', nivel: 'info' },
      { id: 'EV-0006', ts: dias(-8), actor: 'Grant Thornton', rol: 'Auditor', tipo: 'reserva.certificada', detalle: 'Prueba de reservas 2026-Q3 publicada para ONDK', nivel: 'ok' },
      { id: 'EV-0005', ts: dias(-12), actor: 'Tesorería', rol: 'Operaciones', tipo: 'reserva.actualizada', detalle: 'RES-CAJ-04 actualizada a $6.25 M tras conciliación bancaria', nivel: 'info' },
      { id: 'EV-0004', ts: dias(-17), actor: 'Consejo', rol: 'Autoridad ORIGEN', tipo: 'solicitud.rechazada', detalle: 'ONDK · emisión adicional de 277.5 M rechazada: la planta de beneficio no computa como reserva admisible', nivel: 'bad' },
      { id: 'EV-0003', ts: dias(-33), actor: 'Sistema', rol: 'Autoridad ORIGEN', tipo: 'reserva.vencida', detalle: 'RES-AG-07 dejó de computar: certificado vencido', nivel: 'warn' },
      { id: 'EV-0002', ts: dias(-52), actor: 'Comité de Valuación', rol: 'Comité', tipo: 'valuacion.aprobada', detalle: 'ONDK revaluado a $34 M — precio unitario se mantiene en $0.06', nivel: 'ok' },
      { id: 'EV-0001', ts: dias(-210), actor: 'Consejo', rol: 'Autoridad ORIGEN', tipo: 'solicitud.aprobada', detalle: 'ONDK · emisión fundacional de 555 M autorizada — $33.3 M de ORIGEN comprometidos', nivel: 'ok' },
      { id: 'EV-0000', ts: dias(-420), actor: 'Consejo', rol: 'Autoridad ORIGEN', tipo: 'origen.emitido', detalle: 'Emisión fundacional de 26 M ORIGEN contra las reservas certificadas de Maple Commercial Minerals', nivel: 'ok' },
    ],
  };

  return { version: 2, estado };
});

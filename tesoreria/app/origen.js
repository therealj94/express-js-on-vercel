/* ============================================================
   Autoridad de Emisión de ORIGEN
   El banco central del ecosistema: certifica reservas, emite y
   quema ORIGEN, y autoriza (o niega) toda emisión de tokens.
   Regla dura: nada sale al mercado sin respaldo.
   ============================================================ */
(function () {
  'use strict';
  const { fmt, esc, ic, el, els, toast, modal, cerrarModal, confirmar, medidor, alClic } = T;
  T.cargar();

  const E = () => T.estado;
  const salud = (s) => (s === 'ok' ? 'ok' : s === 'warn' ? 'warn' : 'bad');

  /* ---------- piezas ---------- */

  function kpisRespaldo() {
    const r = T.respaldo();
    return `
    <div class="grid g4">
      <div class="kpi">
        <div class="et">${ic('boveda')} Reservas admisibles</div>
        <div class="val num">${fmt.dineroCorto(r.admisible)}</div>
        <div class="nota">Certificadas y vigentes, ya con aforo aplicado</div>
      </div>
      <div class="kpi acento">
        <div class="et">${ic('token')} ORIGEN en circulación</div>
        <div class="val num">${fmt.compacto(r.emitido)}</div>
        <div class="nota">${fmt.compacto(E().origen.emitido)} emitidos − ${fmt.compacto(E().origen.quemado)} quemados</div>
      </div>
      <div class="kpi">
        <div class="et">${ic('candado')} Comprometido en tokens</div>
        <div class="val num">${fmt.compacto(r.comprometido)}</div>
        <div class="nota">${E().asignaciones.filter((a) => a.estado === 'comprometida').length} asignaciones activas</div>
      </div>
      <div class="kpi ${r.libre <= 0 ? 'mal' : 'bien'}">
        <div class="et">${ic('llave')} ORIGEN libre</div>
        <div class="val num">${fmt.compacto(r.libre)}</div>
        <div class="nota">${r.enCola > 0 ? `${fmt.dineroCorto(r.enCola)} pedidos en cola` : 'Sin solicitudes en cola'}</div>
      </div>
    </div>`;
  }

  function tarjetaRatio() {
    const r = T.respaldo();
    const p = E().politica;
    const color = r.salud === 'ok' ? 'var(--ok)' : r.salud === 'warn' ? 'var(--warn)' : 'var(--bad)';
    const total = Math.max(r.admisible, r.emitido) || 1;
    return `
    <div class="card">
      <div class="cab"><h3>Ratio de respaldo</h3>
        <div class="der"><span class="tag ${salud(r.salud)}">${r.salud === 'ok' ? 'Sobre-colateralizado' : r.salud === 'warn' ? 'Bajo el objetivo' : 'Bajo el mínimo'}</span></div>
      </div>
      <div class="cuerpo" style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
        ${medidor(Math.min(r.ratio, 200), 'respaldo', color, 142)}
        <div style="flex:1;min-width:240px">
          <div class="barra" title="Reservas admisibles frente a ORIGEN emitido">
            <i class="ok" style="width:${(Math.min(r.emitido, r.admisible) / total) * 100}%"></i>
            <i class="a" style="width:${(Math.max(0, r.admisible - r.emitido) / total) * 100}%"></i>
            <i class="b" style="width:${(Math.max(0, r.emitido - r.admisible) / total) * 100}%"></i>
          </div>
          <div class="leyenda">
            <b class="ok">Respaldado ${fmt.dineroCorto(Math.min(r.emitido, r.admisible))}</b>
            <b class="a">Holgura ${fmt.dineroCorto(Math.max(0, r.holgura))}</b>
            ${r.holgura < 0 ? `<b class="b">Descubierto ${fmt.dineroCorto(-r.holgura)}</b>` : ''}
          </div>
          <div class="linea"></div>
          <dl class="dl">
            <dt>Objetivo del Consejo</dt><dd class="num">${p.ratioObjetivo}%</dd>
            <dt>Mínimo regulatorio interno</dt><dd class="num">${p.ratioMinimo}%</dd>
            <dt>Capacidad de emisión libre</dt><dd class="num ${r.libre > 0 ? 'ok-t' : 'bad-t'}">${fmt.dinero(r.libre)}</dd>
            <dt>Tras aprobar la cola</dt><dd class="num ${r.libreTrasCola >= 0 ? '' : 'bad-t'}">${fmt.dinero(r.libreTrasCola)}</dd>
          </dl>
        </div>
      </div>
    </div>`;
  }

  function avisosGlobales() {
    const r = T.respaldo();
    const av = [];
    if (r.congelado) av.push(['bad', 'Emisión congelada', 'El Consejo activó el freno de emergencia. Ninguna solicitud puede aprobarse hasta levantarlo.']);
    if (r.ratio < E().politica.ratioMinimo) av.push(['bad', 'Ratio bajo el mínimo', `El respaldo está en ${fmt.pct(r.ratio)}. Hay que sumar reservas o quemar ORIGEN antes de cualquier emisión.`]);
    else if (r.ratio < E().politica.ratioObjetivo) av.push(['warn', 'Ratio bajo el objetivo', `El respaldo está en ${fmt.pct(r.ratio)}, debajo del objetivo de ${E().politica.ratioObjetivo}%.`]);
    if (r.libreTrasCola < 0) av.push(['warn', 'La cola excede el ORIGEN libre', `Las solicitudes pendientes piden ${fmt.dineroCorto(r.enCola)} y solo hay ${fmt.dineroCorto(r.libre)} libres. No todas pueden aprobarse.`]);
    const venc = E().reservas.filter((x) => x.estado === 'certificada' && x.vence && new Date(x.vence) < new Date());
    if (venc.length) av.push(['warn', 'Certificados vencidos', `${venc.length} reserva(s) dejaron de computar: ${venc.map((v) => v.id).join(', ')}.`]);
    const porVencer = E().reservas.filter((x) => x.estado === 'certificada' && x.vence && new Date(x.vence) > new Date() && new Date(x.vence) - Date.now() < 60 * 86400000);
    if (porVencer.length) av.push(['warn', 'Certificados por vencer', `${porVencer.length} reserva(s) vencen en menos de 60 días.`]);
    if (!av.length) av.push(['ok', 'Sistema en regla', 'Todo el ORIGEN en circulación tiene respaldo certificado vigente.']);
    return av.map(([t, b, p]) => `
      <div class="aviso ${t}" style="margin-bottom:9px">${ic(t === 'ok' ? 'check' : 'alerta')}
        <div><b>${esc(b)}</b><span class="txt">${esc(p)}</span></div></div>`).join('');
  }

  function filaSolicitud(s, compacta) {
    const t = T.buscar.token(s.tokenId);
    const chequeo = ['en_revision', 'objecion'].includes(s.estado) ? T.puedeEmitir(s.origenRequerido) : null;
    const tagEstado = {
      en_revision: ['warn', 'En revisión'], objecion: ['bad', 'Con objeción'],
      aprobada: ['ok', 'Aprobada'], rechazada: ['bad', 'Rechazada'], borrador: ['', 'Borrador'],
    }[s.estado] || ['', s.estado];
    return `
    <tr class="click" data-sol="${s.id}">
      <td>
        <b>${esc(s.simbolo)}</b> <span class="tag plano">${s.tipo === 'security' ? 'Security' : 'Utility'}</span>
        <span class="t2">${esc(T.etiquetaAccion(s.accion))} · ${esc(s.id)}</span>
      </td>
      <td class="der num">${fmt.num(s.cantidad)}<span class="t2">× ${fmt.dinero(s.precio)}</span></td>
      <td class="der num">${fmt.dinero(s.origenRequerido, 'USD', 0)}
        ${chequeo ? `<span class="t2 ${chequeo.ok ? 'ok-t' : 'bad-t'}">${chequeo.ok ? 'hay respaldo' : 'sin respaldo'}</span>` : ''}</td>
      <td><span class="tag ${tagEstado[0]}">${esc(tagEstado[1])}</span>
        <span class="t2">${s.firmas.length}/${s.firmasRequeridas} firmas</span></td>
      ${compacta ? '' : `<td class="ts">${fmt.fechaHora(s.creada)}<span class="t2">${esc(s.solicitante)}</span></td>`}
      <td class="der"><button class="btn chico" data-sol="${s.id}">Revisar</button></td>
    </tr>`;
  }

  /* ---------- vista: panel ---------- */
  const panel = {
    titulo: 'Autoridad de Emisión de ORIGEN',
    sub: () => `Respaldo verificado al ${fmt.fechaHora(new Date().toISOString())}`,
    render() {
      const pend = T.buscar.pendientes();
      const r = T.respaldo();
      return `
      ${kpisRespaldo()}
      <div class="grid g-2-1 mt16">
        ${tarjetaRatio()}
        <div class="card"><div class="cab"><h3>Estado del sistema</h3></div>
          <div class="cuerpo">${avisosGlobales()}
            <div class="linea"></div>
            <button class="btn ${r.congelado ? 'pri' : 'peligro'}" data-freno style="width:100%;justify-content:center">
              ${ic('pausa')} ${r.congelado ? 'Levantar el freno de emisión' : 'Congelar toda emisión'}
            </button>
          </div>
        </div>
      </div>

      <div class="titulo-sec">Cola de autorización — ${pend.length} solicitud(es)</div>
      <div class="card"><div class="cuerpo plano tabla-wrap">
        ${pend.length ? `<table class="tabla">
          <thead><tr><th>Token</th><th class="der">Cantidad</th><th class="der">ORIGEN pedido</th><th>Estado</th><th>Recibida</th><th></th></tr></thead>
          <tbody>${pend.map((s) => filaSolicitud(s)).join('')}</tbody></table>`
          : `<div class="vacio">${ic('check')}<div>No hay solicitudes esperando dictamen.</div></div>`}
      </div></div>

      <div class="grid g2 mt16">
        <div class="card"><div class="cab"><h3>Composición del respaldo</h3>
          <div class="der"><button class="btn chico fantasma" data-ir="reservas">Ver reservas ${ic('flecha')}</button></div></div>
          <div class="cuerpo">${composicion()}</div>
        </div>
        <div class="card"><div class="cab"><h3>Libro sellado — últimos movimientos</h3>
          <div class="der"><button class="btn chico fantasma" data-ir="libro">Ver todo ${ic('flecha')}</button></div></div>
          <div class="cuerpo"><div class="linea-tiempo">
            ${E().libro.slice(0, 6).map((ev) => `
              <div class="ev ${ev.nivel === 'ok' ? 'ok' : ev.nivel === 'bad' ? 'bad' : ev.nivel === 'warn' ? 'warn' : ''}">
                <b>${esc(ev.detalle)}</b>
                <p>${esc(ev.actor)} · ${esc(ev.tipo)}</p>
                <div class="ts mono">${fmt.fechaHora(ev.ts)} · ${esc(ev.hash.slice(0, 10))}</div>
              </div>`).join('')}
          </div></div>
        </div>
      </div>`;
    },
    alMontar(c) {
      alClic(c, 'data-sol', (id) => abrirSolicitud(id));
      alClic(c, 'data-ir', (v) => { location.hash = v; });
      const f = el('[data-freno]', c);
      if (f) f.addEventListener('click', () => {
        const on = E().politica.congelado;
        confirmar(on ? 'Levantar el freno' : 'Congelar toda emisión',
          on ? 'Se reanuda la facultad de autorizar emisiones. Queda asentado en el libro.'
             : 'Ninguna solicitud podrá aprobarse hasta que el Consejo levante el freno. Se usa ante una caída del respaldo o una auditoría en curso.',
          () => {
            T.accion(on ? 'sistema.descongelado' : 'sistema.congelado',
              on ? 'El Consejo levantó el freno de emisión' : 'El Consejo congeló toda emisión del ecosistema',
              (e) => { e.politica.congelado = !on; }, on ? 'ok' : 'bad');
            toast(on ? 'Freno levantado' : 'Emisión congelada', '', on ? 'ok' : 'bad');
          }, on ? 'Levantar' : 'Congelar', !on);
      });
    },
  };

  function composicion() {
    const rs = E().reservas.slice().sort((a, b) => T.valorAdmisible(b) - T.valorAdmisible(a));
    const total = T.reservasAdmisibles() || 1;
    return rs.map((r) => {
      const v = T.valorAdmisible(r);
      const p = (v / total) * 100;
      return `<div style="margin-bottom:13px">
        <div style="display:flex;gap:8px;font-size:12.5px;margin-bottom:5px">
          <b style="font-weight:600">${esc(r.nombre)}</b>
          <span class="faint">${esc(r.clase)}</span>
          <span class="num" style="margin-left:auto">${v > 0 ? fmt.dineroCorto(v) : '<span class="faint">no computa</span>'}</span>
        </div>
        <div class="barra"><i class="${v > 0 ? 'a' : 'n'}" style="width:${v > 0 ? p : 100}%"></i></div>
        <div class="ts" style="margin-top:4px">${fmt.dineroCorto(r.valorCertificado)} certificado · aforo ${fmt.pct(r.haircut * 100, 0)} · ${esc(r.custodio)}</div>
      </div>`;
    }).join('');
  }

  /* ---------- vista: reservas ---------- */
  const reservas = {
    titulo: 'Registro maestro de reservas',
    sub: () => `${E().reservas.length} activos · ${fmt.dineroCorto(T.reservasAdmisibles())} admisibles`,
    render() {
      return `
      <div class="card"><div class="cab"><h3>Activos que respaldan el ORIGEN</h3>
        <div class="der">
          <button class="btn chico" data-exp>${ic('doc')} Exportar</button>
          <button class="btn pri chico" data-nueva>${ic('mas')} Registrar reserva</button>
        </div></div>
        <div class="cuerpo plano tabla-wrap"><table class="tabla">
          <thead><tr>
            <th>Reserva</th><th>Custodio / auditor</th><th class="der">Certificado</th>
            <th class="der">Aforo</th><th class="der">Admisible</th><th>Estado</th><th></th>
          </tr></thead>
          <tbody>${E().reservas.map((r) => {
            const v = T.valorAdmisible(r);
            const vencido = r.vence && new Date(r.vence) < new Date();
            const tg = r.estado === 'certificada' ? (vencido ? ['bad', 'Certificado vencido'] : ['ok', 'Certificada'])
              : r.estado === 'en_revision' ? ['warn', 'En revisión'] : ['', 'Retirada'];
            return `<tr>
              <td><b>${esc(r.nombre)}</b><span class="t2">${esc(r.id)} · ${esc(r.clase)}</span></td>
              <td>${esc(r.custodio)}<span class="t2">${esc(r.auditor)}</span></td>
              <td class="der num">${fmt.dinero(r.valorCertificado, 'USD', 0)}<span class="t2">${esc(r.certificado)}</span></td>
              <td class="der num">${fmt.pct(r.haircut * 100, 0)}</td>
              <td class="der num ${v > 0 ? 'ok-t' : 'faint'}">${v > 0 ? fmt.dinero(v, 'USD', 0) : '0'}</td>
              <td><span class="tag ${tg[0]}">${esc(tg[1])}</span><span class="t2">${r.vence ? 'vence ' + fmt.fecha(r.vence) : 'sin certificado'}</span></td>
              <td class="der"><button class="btn chico" data-res="${r.id}">Gestionar</button></td>
            </tr>`;
          }).join('')}</tbody>
          <tfoot><tr>
            <th colspan="4" class="der">Total admisible</th>
            <th class="der num ok-t">${fmt.dinero(T.reservasAdmisibles(), 'USD', 0)}</th><th colspan="2"></th>
          </tr></tfoot>
        </table></div>
      </div>
      <div class="aviso acento mt16">${ic('alerta')}<div>
        <b>Por qué existe el aforo</b>
        <span class="txt">El aforo (haircut) es el descuento por riesgo de realización: un mineral in situ no vale lo mismo que el efectivo en cuenta. Solo el valor después del aforo puede respaldar ORIGEN. Un certificado vencido o en revisión vale cero hasta que el auditor lo renueve.</span>
      </div></div>`;
    },
    alMontar(c) {
      alClic(c, 'data-res', (id) => gestionarReserva(id));
      el('[data-nueva]', c).addEventListener('click', nuevaReserva);
      el('[data-exp]', c).addEventListener('click', () => {
        T.exportarJSON('reservas-origen.json', E().reservas);
        toast('Registro exportado', 'reservas-origen.json', 'ok');
      });
    },
  };

  function gestionarReserva(id) {
    const r = T.buscar.reserva(id);
    modal({
      titulo: `${r.nombre} · ${r.id}`,
      cuerpo: `
        <p class="muted" style="margin-bottom:16px">${esc(r.detalle)}</p>
        <dl class="dl">
          <dt>Clase</dt><dd>${esc(r.clase)}</dd>
          <dt>Custodio</dt><dd>${esc(r.custodio)}</dd>
          <dt>Auditor / valuador</dt><dd>${esc(r.auditor)}</dd>
          <dt>Certificado</dt><dd class="mono">${esc(r.certificado)}</dd>
          <dt>Huella del documento</dt><dd class="mono">${esc(r.docHash)}</dd>
          <dt>Valor certificado</dt><dd class="num">${fmt.dinero(r.valorCertificado)}</dd>
          <dt>Aforo aplicado</dt><dd class="num">${fmt.pct(r.haircut * 100, 0)}</dd>
          <dt>Valor admisible</dt><dd class="num ${T.valorAdmisible(r) > 0 ? 'ok-t' : 'bad-t'}">${fmt.dinero(T.valorAdmisible(r))}</dd>
          <dt>Certificado el</dt><dd>${fmt.fecha(r.fechaCert)}</dd>
          <dt>Vence</dt><dd>${fmt.fecha(r.vence)} ${r.vence ? `<span class="faint">(${fmt.relativo(r.vence)})</span>` : ''}</dd>
        </dl>
        <div class="linea"></div>
        <div class="campo mb0">
          <label>Ajustar valor certificado (USD)</label>
          <input type="number" id="nv" value="${r.valorCertificado}" min="0" step="1000">
          <span class="ayuda">Solo con un informe de valuador vigente. El cambio se asienta en el libro y recalcula el ratio de respaldo al instante.</span>
        </div>`,
      pie: `
        <div class="izq">
          ${r.estado !== 'certificada'
            ? `<button class="btn" data-cert>${ic('check')} Certificar</button>`
            : `<button class="btn" data-rev>${ic('reloj')} Poner en revisión</button>`}
          <button class="btn peligro" data-ret>${ic('x')} Retirar</button>
        </div>
        <button class="btn" data-cerrar>Cerrar</button>
        <button class="btn pri" data-guardar>Guardar valor</button>`,
      alAbrir(f) {
        el('[data-guardar]', f).addEventListener('click', () => {
          const v = Number(el('#nv', f).value);
          if (!(v >= 0)) return toast('Valor inválido', '', 'bad');
          T.accion('reserva.revaluada', `${r.id} revaluada de ${fmt.dineroCorto(r.valorCertificado)} a ${fmt.dineroCorto(v)}`, () => {
            const x = T.buscar.reserva(id); x.valorCertificado = v;
          });
          cerrarModal(); toast('Reserva actualizada', 'El ratio de respaldo se recalculó', 'ok');
        });
        const cert = el('[data-cert]', f);
        if (cert) cert.addEventListener('click', () => {
          T.accion('reserva.certificada', `${r.id} certificada y admitida al respaldo`, () => {
            const x = T.buscar.reserva(id);
            x.estado = 'certificada';
            x.fechaCert = new Date().toISOString();
            x.vence = new Date(Date.now() + 365 * 86400000).toISOString();
          }, 'ok');
          cerrarModal(); toast('Reserva certificada', 'Ya computa al respaldo', 'ok');
        });
        const rev = el('[data-rev]', f);
        if (rev) rev.addEventListener('click', () => {
          confirmar('Poner en revisión', 'Deja de computar al respaldo de inmediato. Si el ORIGEN emitido supera las reservas admisibles, el sistema bloqueará toda emisión nueva.', () => {
            T.accion('reserva.en_revision', `${r.id} pasó a revisión: deja de computar al respaldo`, () => {
              T.buscar.reserva(id).estado = 'en_revision';
            }, 'warn');
            cerrarModal(); toast('Reserva en revisión', '', 'warn');
          }, 'Poner en revisión', true);
        });
        el('[data-ret]', f).addEventListener('click', () => {
          confirmar('Retirar la reserva', 'El activo sale del respaldo de forma definitiva. Si con eso el respaldo queda corto, hay que quemar ORIGEN por la diferencia.', () => {
            T.accion('reserva.retirada', `${r.id} retirada del respaldo (${fmt.dineroCorto(r.valorCertificado)})`, () => {
              T.buscar.reserva(id).estado = 'retirada';
            }, 'bad');
            cerrarModal(); toast('Reserva retirada', 'Revisa el ratio de respaldo', 'bad');
          }, 'Retirar', true);
        });
      },
    });
  }

  function nuevaReserva() {
    modal({
      titulo: 'Registrar una reserva',
      cuerpo: `
        <div class="fila">
          <div class="campo"><label>Nombre del activo</label><input id="n" placeholder="Oro doré en bóveda"></div>
          <div class="campo"><label>Clase</label>
            <select id="cl">
              <option>Metal precioso</option><option>Recurso mineral</option><option>Inmobiliario</option>
              <option>Efectivo</option><option>Cuenta por cobrar</option><option>Activo fijo</option><option>Instrumento financiero</option>
            </select></div>
        </div>
        <div class="campo"><label>Detalle</label><textarea id="d" placeholder="Cantidad, lotes, ubicación, gravámenes…"></textarea></div>
        <div class="fila">
          <div class="campo"><label>Custodio</label><input id="cu" placeholder="Brink's / fideicomiso / banco"></div>
          <div class="campo"><label>Auditor o valuador</label><input id="au" placeholder="Grant Thornton / SRK"></div>
        </div>
        <div class="fila t3">
          <div class="campo"><label>Valor certificado (USD)</label><input type="number" id="v" min="0" step="1000" placeholder="0"></div>
          <div class="campo"><label>Aforo %</label><input type="number" id="h" min="0" max="90" value="25"></div>
          <div class="campo"><label>Folio del certificado</label><input id="ce" placeholder="CERT-…"></div>
        </div>
        <div class="campo mb0"><label>Vigencia del certificado</label><input type="date" id="ve">
          <span class="ayuda">Al vencer, la reserva deja de computar automáticamente. Sin folio ni vigencia, la reserva entra como “en revisión”.</span></div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Registrar</button>`,
      alAbrir(f) {
        el('[data-ok]', f).addEventListener('click', () => {
          const n = el('#n', f).value.trim(), v = Number(el('#v', f).value);
          if (!n || !(v > 0)) return toast('Faltan datos', 'Nombre y valor certificado son obligatorios', 'bad');
          const ce = el('#ce', f).value.trim(), ve = el('#ve', f).value;
          const r = {
            id: T.id('RES'), nombre: n, clase: el('#cl', f).value, detalle: el('#d', f).value.trim(),
            custodio: el('#cu', f).value.trim() || '—', auditor: el('#au', f).value.trim() || '—',
            certificado: ce || '—', valorCertificado: v, moneda: 'USD',
            haircut: Math.min(0.9, Math.max(0, Number(el('#h', f).value) / 100)),
            estado: ce && ve ? 'certificada' : 'en_revision',
            fechaCert: ce && ve ? new Date().toISOString() : null,
            vence: ve ? new Date(ve).toISOString() : null,
            docHash: T.hash(n + v + Date.now()).slice(0, 8), origenSerie: 'Orden Global Corp',
          };
          T.accion('reserva.registrada', `${r.id} · ${n} por ${fmt.dineroCorto(v)} (aforo ${fmt.pct(r.haircut * 100, 0)})`, (e) => e.reservas.push(r), 'ok');
          cerrarModal();
          toast('Reserva registrada', r.estado === 'certificada' ? 'Ya computa al respaldo' : 'Queda en revisión hasta certificarse', 'ok');
        });
      },
    });
  }

  /* ---------- vista: solicitudes ---------- */
  const solicitudes = {
    titulo: 'Cola de autorización de emisión',
    sub: () => `${T.buscar.pendientes().length} pendientes · ${fmt.dineroCorto(T.respaldo().libre)} de ORIGEN libre`,
    render() {
      const todas = E().solicitudes;
      const pend = todas.filter((s) => ['en_revision', 'objecion'].includes(s.estado));
      const hist = todas.filter((s) => !['en_revision', 'objecion'].includes(s.estado));
      const tabla = (lista, vacio) => lista.length ? `<table class="tabla">
        <thead><tr><th>Token</th><th class="der">Cantidad</th><th class="der">ORIGEN</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
        <tbody>${lista.map((s) => filaSolicitud(s)).join('')}</tbody></table>`
        : `<div class="vacio">${ic('lista')}<div>${esc(vacio)}</div></div>`;
      return `
        ${kpisRespaldo()}
        <div class="titulo-sec">Pendientes de dictamen</div>
        <div class="card"><div class="cuerpo plano tabla-wrap">${tabla(pend, 'Nada pendiente.')}</div></div>
        <div class="titulo-sec">Historial de dictámenes</div>
        <div class="card"><div class="cuerpo plano tabla-wrap">${tabla(hist, 'Sin historial.')}</div></div>`;
    },
    alMontar(c) { alClic(c, 'data-sol', (id) => abrirSolicitud(id)); },
  };

  function abrirSolicitud(id) {
    const s = T.buscar.solicitud(id);
    if (!s) return;
    const t = T.buscar.token(s.tokenId);
    const pendiente = ['en_revision', 'objecion'].includes(s.estado);
    const ch = T.puedeEmitir(s.origenRequerido);
    const causa = (T.CAUSAS[s.tipo] || []).find((x) => x.v === s.causa);
    const faltanFirmas = Math.max(0, s.firmasRequeridas - s.firmas.length);

    modal({
      ancho: true,
      titulo: `${s.simbolo} · ${T.etiquetaAccion(s.accion)} — ${s.id}`,
      cuerpo: `
        ${pendiente ? `<div class="aviso ${ch.ok ? 'ok' : 'bad'}" style="margin-bottom:16px">${ic(ch.ok ? 'check' : 'alerta')}
          <div><b>${ch.ok ? 'Hay respaldo suficiente' : 'No hay respaldo para esta emisión'}</b>
          <span class="txt">${ch.ok
            ? `Quedan ${fmt.dineroCorto(ch.respaldo.libre)} de ORIGEN libre; esta solicitud consume ${fmt.dineroCorto(s.origenRequerido)} y deja ${fmt.dineroCorto(ch.respaldo.libre - s.origenRequerido)}.`
            : esc(ch.faltas.join(' '))}</span></div></div>` : ''}

        <div class="grid g2">
          <div>
            <div class="titulo-sec" style="margin-top:0">Lo que se pide</div>
            <dl class="dl">
              <dt>Token</dt><dd>${esc(s.simbolo)} — ${esc(t ? t.nombre : '—')}</dd>
              <dt>Clase</dt><dd>${s.tipo === 'security' ? 'Security token' : 'Utility token'}</dd>
              <dt>Acción</dt><dd>${esc(T.etiquetaAccion(s.accion))}</dd>
              <dt>Cantidad</dt><dd class="num">${fmt.num(s.cantidad)}</dd>
              <dt>Precio establecido</dt><dd class="num">${fmt.dinero(s.precio)}</dd>
              <dt>ORIGEN requerido</dt><dd class="num ac-t">${fmt.dinero(s.origenRequerido)}</dd>
              <dt>Solicitante</dt><dd>${esc(s.solicitante)}</dd>
              <dt>Recibida</dt><dd>${fmt.fechaHora(s.creada)}</dd>
              <dt>Ventana de objeción</dt><dd>${fmt.fecha(s.ventanaObjecionHasta)} <span class="faint">(${fmt.relativo(s.ventanaObjecionHasta)})</span></dd>
            </dl>
          </div>
          <div>
            <div class="titulo-sec" style="margin-top:0">Causa invocada</div>
            <div class="aviso" style="margin-bottom:12px">${ic('doc')}<div>
              <b>${esc(causa ? causa.t : s.causa || '—')}</b>
              <span class="txt">${esc(causa ? 'Requiere: ' + causa.pide : '')}</span></div></div>
            <p class="muted" style="font-size:13px;line-height:1.6">${esc(s.motivo)}</p>
            <div class="titulo-sec">Evidencias (${s.evidencias.length})</div>
            ${s.evidencias.length ? s.evidencias.map((ev) => `
              <div style="display:flex;gap:9px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
                ${ic('doc')}<div style="flex:1"><b style="font-size:13px">${esc(ev.nombre)}</b>
                <span class="t2 faint">${esc(ev.tipo)}</span></div>
                <span class="mono ts">${esc(ev.hash)}</span></div>`).join('')
              : '<p class="faint" style="font-size:12.5px">Sin evidencias adjuntas.</p>'}
          </div>
        </div>

        <div class="titulo-sec">Firmas del Consejo — ${s.firmas.length} de ${s.firmasRequeridas}</div>
        <div class="barra"><i class="${s.firmas.length >= s.firmasRequeridas ? 'ok' : 'a'}" style="width:${Math.min(100, (s.firmas.length / s.firmasRequeridas) * 100)}%"></i></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
          ${E().sesion.consejeros.map((cn) => {
            const fi = s.firmas.find((x) => x.quien === cn);
            return `<span class="tag ${fi ? 'ok' : ''}">${esc(cn)}${fi ? ' · firmó' : ''}</span>`;
          }).join('')}
        </div>
        ${pendiente && faltanFirmas ? `
          <div class="fila mt16" style="align-items:end">
            <div class="campo mb0"><label>Firmar como</label>
              <select id="firmante">${E().sesion.consejeros
                .filter((cn) => !s.firmas.some((x) => x.quien === cn))
                .map((cn) => `<option>${esc(cn)}</option>`).join('')}</select></div>
            <button class="btn" data-firmar style="height:38px">${ic('llave')} Firmar solicitud</button>
          </div>` : ''}
        ${s.dictamen ? `<div class="aviso ${s.estado === 'aprobada' ? 'ok' : s.estado === 'rechazada' ? 'bad' : 'warn'} mt16">
          ${ic('doc')}<div><b>Dictamen</b><span class="txt">${esc(s.dictamen)}</span></div></div>` : ''}`,
      pie: pendiente ? `
        <div class="izq"><button class="btn" data-objetar>${ic('alerta')} Objetar</button></div>
        <button class="btn peligro" data-rechazar>${ic('x')} Rechazar</button>
        <button class="btn pri" data-aprobar ${(!ch.ok || faltanFirmas) ? 'disabled' : ''}>
          ${ic('check')} ${faltanFirmas ? `Faltan ${faltanFirmas} firma(s)` : 'Autorizar emisión'}</button>`
        : `<button class="btn" data-cerrar>Cerrar</button>`,
      alAbrir(f) {
        const fb = el('[data-firmar]', f);
        if (fb) fb.addEventListener('click', () => {
          try { T.firmar(id, el('#firmante', f).value); cerrarModal(); abrirSolicitud(id); toast('Firma registrada', '', 'ok'); }
          catch (e) { toast('No se pudo firmar', e.message, 'bad'); }
        });
        const ap = el('[data-aprobar]', f);
        if (ap) ap.addEventListener('click', () => {
          confirmar('Autorizar la emisión',
            `Se comprometen ${fmt.dinero(s.origenRequerido)} de ORIGEN y se autoriza la emisión de ${fmt.num(s.cantidad)} ${esc(s.simbolo)}. Queda sellado en el libro y ya no se puede deshacer, solo compensar con una quema.`,
            () => {
              try { T.aprobar(id); cerrarModal(); toast('Emisión autorizada', `${s.simbolo} · ${fmt.dineroCorto(s.origenRequerido)} comprometidos`, 'ok'); }
              catch (e) { toast('No se pudo autorizar', e.message, 'bad'); }
            }, 'Autorizar');
        });
        const rz = el('[data-rechazar]', f);
        if (rz) rz.addEventListener('click', () => pedirMotivo('Rechazar la solicitud', 'Motivo del rechazo', (m) => {
          T.rechazar(id, m); cerrarModal(); toast('Solicitud rechazada', '', 'bad');
        }));
        const ob = el('[data-objetar]', f);
        if (ob) ob.addEventListener('click', () => pedirMotivo('Registrar una objeción', 'Objeción', (m) => {
          T.objetar(id, m); cerrarModal(); toast('Objeción registrada', 'La solicitud queda detenida', 'warn');
        }));
      },
    });
  }

  function pedirMotivo(titulo, etiqueta, fn) {
    modal({
      titulo,
      cuerpo: `<div class="campo mb0"><label>${esc(etiqueta)}</label>
        <textarea id="m" placeholder="Queda asentado en el libro público de la Autoridad."></textarea></div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Confirmar</button>`,
      alAbrir(f) {
        el('[data-ok]', f).addEventListener('click', () => {
          const m = el('#m', f).value.trim();
          if (!m) return toast('Escribe el motivo', '', 'bad');
          cerrarModal(); fn(m);
        });
      },
    });
  }

  /* ---------- vista: emisión de ORIGEN ---------- */
  const emision = {
    titulo: 'Emisión y quema de ORIGEN',
    sub: 'La unidad de respaldo solo nace contra reserva certificada',
    render() {
      const r = T.respaldo();
      const maxEmitible = Math.max(0, r.admisible / (E().politica.ratioObjetivo / 100) - r.emitido);
      return `
      ${kpisRespaldo()}
      <div class="grid g2 mt16">
        <div class="card"><div class="cab"><h3>Emitir ORIGEN</h3></div><div class="cuerpo">
          <p class="muted" style="font-size:13px;margin-bottom:14px">
            Solo puede emitirse ORIGEN mientras el ratio de respaldo se mantenga en el objetivo de ${E().politica.ratioObjetivo}%.
            Con las reservas actuales el margen es de <b class="ac-t num">${fmt.dinero(maxEmitible)}</b>.
          </p>
          <div class="campo"><label>Monto a emitir (ORIGEN)</label>
            <input type="number" id="me" min="0" step="10000" placeholder="0">
            <span class="ayuda">1 ORIGEN = 1 USD de reserva certificada admisible.</span></div>
          <div class="campo"><label>Reserva que lo respalda</label>
            <select id="re">${E().reservas.filter((x) => T.valorAdmisible(x) > 0)
              .map((x) => `<option value="${x.id}">${esc(x.nombre)} — ${fmt.dineroCorto(T.valorAdmisible(x))} admisible</option>`).join('')}</select></div>
          <button class="btn pri" data-emitir style="width:100%;justify-content:center">${ic('mas')} Emitir ORIGEN</button>
        </div></div>

        <div class="card"><div class="cab"><h3>Quemar ORIGEN</h3></div><div class="cuerpo">
          <p class="muted" style="font-size:13px;margin-bottom:14px">
            Se quema cuando se retira una reserva, se redime un token o hay que restaurar el ratio.
            Solo puede quemarse ORIGEN libre: hoy hay <b class="num">${fmt.dinero(r.libre)}</b>.
          </p>
          <div class="campo"><label>Monto a quemar (ORIGEN)</label>
            <input type="number" id="mq" min="0" step="10000" placeholder="0"></div>
          <div class="campo"><label>Motivo</label>
            <select id="mo">
              <option>Retiro de reserva del respaldo</option>
              <option>Redención de tokens</option>
              <option>Restauración del ratio de respaldo</option>
              <option>Corrección contable auditada</option>
            </select></div>
          <button class="btn peligro" data-quemar style="width:100%;justify-content:center">${ic('fuego')} Quemar ORIGEN</button>
        </div></div>
      </div>

      <div class="titulo-sec">Asignaciones vigentes de ORIGEN</div>
      <div class="card"><div class="cuerpo plano tabla-wrap"><table class="tabla">
        <thead><tr><th>Token</th><th>Clase</th><th class="der">ORIGEN comprometido</th><th class="der">Valor emitido</th><th>Cobertura</th></tr></thead>
        <tbody>${[...E().securities, ...E().utilities].filter((t) => t.origenAsignado > 0).map((t) => {
          const esSec = !!t.precioUnitario;
          const s = esSec ? T.saludSecurity(t) : T.saludUtility(t);
          const valor = esSec ? s.valorEmitido : s.pasivoRedimible;
          const cob = valor > 0 ? (t.origenAsignado / valor) * 100 : Infinity;
          return `<tr>
            <td><b>${esc(t.simbolo)}</b><span class="t2">${esc(t.nombre)}</span></td>
            <td><span class="tag plano">${esSec ? 'Security' : 'Utility'}</span></td>
            <td class="der num">${fmt.dinero(t.origenAsignado, 'USD', 0)}</td>
            <td class="der num">${fmt.dinero(valor, 'USD', 0)}<span class="t2">${esSec ? 'valor emitido' : 'pasivo redimible'}</span></td>
            <td><span class="tag ${cob >= 100 ? 'ok' : 'bad'}">${Number.isFinite(cob) ? fmt.pct(cob, 1) : '∞'}</span></td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr><th colspan="2" class="der">Total comprometido</th>
          <th class="der num">${fmt.dinero(r.comprometido, 'USD', 0)}</th><th colspan="2"></th></tr></tfoot>
      </table></div></div>`;
    },
    alMontar(c) {
      el('[data-emitir]', c).addEventListener('click', () => {
        const v = Number(el('#me', c).value);
        const res = el('#re', c).value;
        if (!(v > 0)) return toast('Monto inválido', '', 'bad');
        const r = T.respaldo();
        const ratioDespues = (r.admisible / (r.emitido + v)) * 100;
        if (ratioDespues < E().politica.ratioMinimo) {
          return toast('Emisión bloqueada', `El ratio quedaría en ${fmt.pct(ratioDespues)}, bajo el mínimo de ${E().politica.ratioMinimo}%.`, 'bad');
        }
        if (E().politica.congelado) return toast('Emisión congelada', 'El Consejo activó el freno', 'bad');
        confirmar('Emitir ORIGEN', `Se emitirán ${fmt.num(v)} ORIGEN contra ${esc(res)}. El ratio pasará de ${fmt.pct(r.ratio)} a ${fmt.pct(ratioDespues)}.`, () => {
          T.accion('origen.emitido', `Se emitieron ${fmt.compacto(v)} ORIGEN contra ${res}`, (e) => { e.origen.emitido += v; }, 'ok');
          toast('ORIGEN emitido', `${fmt.compacto(v)} en circulación`, 'ok');
        }, 'Emitir');
      });
      el('[data-quemar]', c).addEventListener('click', () => {
        const v = Number(el('#mq', c).value);
        const mo = el('#mo', c).value;
        if (!(v > 0)) return toast('Monto inválido', '', 'bad');
        const r = T.respaldo();
        if (v > r.libre) return toast('No hay ORIGEN libre suficiente', `Libre: ${fmt.dineroCorto(r.libre)}. El resto está comprometido en tokens ya emitidos.`, 'bad');
        confirmar('Quemar ORIGEN', `Se retirarán ${fmt.num(v)} ORIGEN de circulación. Motivo: ${esc(mo)}.`, () => {
          T.accion('origen.quemado', `Se quemaron ${fmt.compacto(v)} ORIGEN — ${mo}`, (e) => { e.origen.quemado += v; }, 'warn');
          toast('ORIGEN quemado', '', 'warn');
        }, 'Quemar', true);
      });
    },
  };

  /* ---------- vista: política ---------- */
  const politica = {
    titulo: 'Política monetaria y Consejo',
    sub: 'Los parámetros que el sistema hace cumplir sin excepción',
    render() {
      const p = E().politica;
      return `
      <div class="grid g2">
        <div class="card"><div class="cab"><h3>Parámetros de respaldo</h3></div><div class="cuerpo">
          <div class="fila">
            <div class="campo"><label>Ratio objetivo %</label><input type="number" id="ro" value="${p.ratioObjetivo}" min="100" max="300"></div>
            <div class="campo"><label>Ratio mínimo %</label><input type="number" id="rm" value="${p.ratioMinimo}" min="100" max="300"></div>
          </div>
          <div class="fila">
            <div class="campo"><label>Firmas requeridas</label><input type="number" id="fr" value="${p.firmasRequeridas}" min="1" max="${E().sesion.consejeros.length}"></div>
            <div class="campo"><label>Días de objeción</label><input type="number" id="do" value="${p.diasObjecion}" min="0" max="60"></div>
          </div>
          <div class="fila">
            <div class="campo"><label>Revisión de valuación (meses)</label><input type="number" id="rv" value="${p.revisionValuacionMeses}" min="1" max="24"></div>
            <div class="campo"><label>Banda del secundario %</label><input type="number" id="bs" value="${p.bandaSecundario * 100}" min="0" max="50" step="0.5"></div>
          </div>
          <button class="btn pri" data-guardar style="width:100%;justify-content:center">Guardar política</button>
          <div class="aviso warn mt16">${ic('alerta')}<div><b>Cambiar estos números cambia el sistema</b>
            <span class="txt">Bajar el ratio mínimo permite emitir más tokens con las mismas reservas. Todo cambio queda sellado en el libro con el nombre de quien lo hizo.</span></div></div>
        </div></div>

        <div>
          <div class="card"><div class="cab"><h3>Consejo firmante</h3></div><div class="cuerpo">
            ${E().sesion.consejeros.map((cn) => `
              <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)">
                ${ic('personas')}<div style="flex:1"><b style="font-size:13px">${esc(cn)}</b>
                <span class="t2 faint">${cn === E().sesion.usuario ? esc(E().sesion.rol) : 'Consejero'}</span></div>
                <span class="tag ok">activo</span></div>`).join('')}
            <p class="ts mt10">Se requieren ${p.firmasRequeridas} de ${E().sesion.consejeros.length} firmas para autorizar cualquier emisión.</p>
          </div></div>

          <div class="card mt16"><div class="cab"><h3>Freno de emergencia</h3></div><div class="cuerpo">
            <div class="aviso ${p.congelado ? 'bad' : 'ok'}">${ic(p.congelado ? 'pausa' : 'check')}<div>
              <b>${p.congelado ? 'Emisión congelada' : 'Emisión operativa'}</b>
              <span class="txt">${p.congelado ? 'Ninguna solicitud puede autorizarse.' : 'Las solicitudes con respaldo y firmas suficientes pueden autorizarse.'}</span></div></div>
            <button class="btn ${p.congelado ? 'pri' : 'peligro'} mt16" data-freno style="width:100%;justify-content:center">
              ${ic('pausa')} ${p.congelado ? 'Levantar el freno' : 'Congelar toda emisión'}</button>
          </div></div>

          <div class="card mt16"><div class="cab"><h3>Datos de la plataforma</h3></div><div class="cuerpo">
            <p class="muted" style="font-size:13px;margin-bottom:12px">El estado vive en este navegador mientras no exista el backend. Puedes exportarlo o volver a la semilla.</p>
            <div style="display:flex;gap:9px;flex-wrap:wrap">
              <button class="btn" data-exp>${ic('doc')} Exportar estado</button>
              <button class="btn peligro" data-reset>${ic('x')} Reiniciar a la semilla</button>
            </div>
          </div></div>
        </div>
      </div>`;
    },
    alMontar(c) {
      el('[data-guardar]', c).addEventListener('click', () => {
        const n = {
          ratioObjetivo: Number(el('#ro', c).value), ratioMinimo: Number(el('#rm', c).value),
          firmasRequeridas: Number(el('#fr', c).value), diasObjecion: Number(el('#do', c).value),
          revisionValuacionMeses: Number(el('#rv', c).value), bandaSecundario: Number(el('#bs', c).value) / 100,
        };
        if (n.ratioMinimo > n.ratioObjetivo) return toast('Política inválida', 'El mínimo no puede superar al objetivo', 'bad');
        T.accion('politica.modificada', `Ratio ${n.ratioObjetivo}%/${n.ratioMinimo}%, ${n.firmasRequeridas} firmas, ${n.diasObjecion} días de objeción`, (e) => Object.assign(e.politica, n), 'warn');
        toast('Política actualizada', '', 'ok');
      });
      el('[data-freno]', c).addEventListener('click', () => {
        const on = E().politica.congelado;
        T.accion(on ? 'sistema.descongelado' : 'sistema.congelado',
          on ? 'El Consejo levantó el freno de emisión' : 'El Consejo congeló toda emisión del ecosistema',
          (e) => { e.politica.congelado = !on; }, on ? 'ok' : 'bad');
        toast(on ? 'Freno levantado' : 'Emisión congelada', '', on ? 'ok' : 'bad');
      });
      el('[data-exp]', c).addEventListener('click', () => {
        T.exportarJSON('tesoreria-origen.json', E()); toast('Estado exportado', '', 'ok');
      });
      el('[data-reset]', c).addEventListener('click', () => {
        confirmar('Reiniciar a la semilla', 'Se pierden todos los cambios hechos en este navegador y vuelven los datos de demostración.', () => {
          T.reiniciar(); toast('Datos reiniciados', '', 'ok');
        }, 'Reiniciar', true);
      });
    },
  };

  /* ---------- vista: libro ---------- */
  const libro = {
    titulo: 'Libro sellado de la Autoridad',
    sub: () => `${E().libro.length} asientos encadenados`,
    render() {
      const v = T.verificarLibro();
      return `
      <div class="aviso ${v.ok ? 'ok' : 'bad'}">${ic(v.ok ? 'escudo2' : 'alerta')}<div>
        <b>${v.ok ? 'Cadena íntegra' : 'Cadena rota'}</b>
        <span class="txt">${v.ok
          ? `Los ${v.total} asientos verifican contra su hash anterior. Cualquier alteración de un asiento pasado rompe la cadena y salta aquí.`
          : `El asiento ${esc(v.en)} no coincide con su hash anterior.`}</span></div></div>
      <div class="card mt16"><div class="cab"><h3>Asientos</h3>
        <div class="der"><button class="btn chico" data-exp>${ic('doc')} Exportar libro</button></div></div>
        <div class="cuerpo plano tabla-wrap"><table class="tabla">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Actor</th><th>Hash</th></tr></thead>
          <tbody>${E().libro.map((ev) => `<tr>
            <td class="ts">${fmt.fechaHora(ev.ts)}</td>
            <td><span class="tag ${ev.nivel === 'ok' ? 'ok' : ev.nivel === 'bad' ? 'bad' : ev.nivel === 'warn' ? 'warn' : ''}">${esc(ev.tipo)}</span></td>
            <td>${esc(ev.detalle)}</td>
            <td>${esc(ev.actor)}<span class="t2">${esc(ev.rol || '')}</span></td>
            <td class="mono ts">${esc(ev.hash)}<span class="t2">← ${esc((ev.hashPrev || '').slice(0, 10))}</span></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
    },
    alMontar(c) {
      el('[data-exp]', c).addEventListener('click', () => { T.exportarJSON('libro-origen.json', E().libro); toast('Libro exportado', '', 'ok'); });
    },
  };

  /* ---------- vista: prueba de reservas ---------- */
  const prueba = {
    titulo: 'Prueba de reservas',
    sub: 'El documento público que cualquiera puede verificar',
    render() {
      const r = T.respaldo();
      const tokens = [...E().securities, ...E().utilities].filter((t) => t.origenAsignado > 0);
      return `
      <div class="card"><div class="cab"><h3>Certificado de respaldo · ${fmt.fecha(new Date().toISOString())}</h3>
        <div class="der"><button class="btn chico" onclick="window.print()">${ic('doc')} Imprimir / PDF</button></div></div>
        <div class="cuerpo">
          <p class="muted" style="font-size:13px;line-height:1.7;margin-bottom:18px">
            Orden Global Corp declara que la totalidad del ORIGEN en circulación está respaldado por los activos
            certificados que se listan abajo, valuados por auditores independientes y sujetos a aforo por riesgo de realización.
            Ningún token del ecosistema —security o utility— existe sin una asignación de ORIGEN que lo respalde.
          </p>
          <div class="grid g3">
            <div class="kpi"><div class="et">Reservas admisibles</div><div class="val num">${fmt.dinero(r.admisible, 'USD', 0)}</div></div>
            <div class="kpi acento"><div class="et">ORIGEN en circulación</div><div class="val num">${fmt.num(r.emitido)}</div></div>
            <div class="kpi ${r.salud === 'ok' ? 'bien' : 'mal'}"><div class="et">Ratio de respaldo</div><div class="val num">${Number.isFinite(r.ratio) ? fmt.pct(r.ratio) : '∞'}</div></div>
          </div>

          <div class="titulo-sec">Activos que respaldan</div>
          <div class="tabla-wrap"><table class="tabla">
            <thead><tr><th>Activo</th><th>Auditor</th><th>Certificado</th><th class="der">Valor</th><th class="der">Aforo</th><th class="der">Admisible</th></tr></thead>
            <tbody>${E().reservas.map((x) => `<tr>
              <td>${esc(x.nombre)}<span class="t2">${esc(x.custodio)}</span></td>
              <td>${esc(x.auditor)}</td>
              <td class="mono ts">${esc(x.certificado)}<span class="t2">${x.vence ? 'vence ' + fmt.fecha(x.vence) : '—'}</span></td>
              <td class="der num">${fmt.dinero(x.valorCertificado, 'USD', 0)}</td>
              <td class="der num">${fmt.pct(x.haircut * 100, 0)}</td>
              <td class="der num ${T.valorAdmisible(x) > 0 ? 'ok-t' : 'faint'}">${fmt.dinero(T.valorAdmisible(x), 'USD', 0)}</td>
            </tr>`).join('')}</tbody>
          </table></div>

          <div class="titulo-sec">Tokens vivos y su respaldo</div>
          <div class="tabla-wrap"><table class="tabla">
            <thead><tr><th>Token</th><th>Clase</th><th class="der">En circulación</th><th class="der">Valor respaldado</th><th class="der">ORIGEN asignado</th></tr></thead>
            <tbody>${tokens.map((t) => {
              const esSec = !!t.precioUnitario;
              const s = esSec ? T.saludSecurity(t) : T.saludUtility(t);
              return `<tr>
                <td><b>${esc(t.simbolo)}</b><span class="t2">${esc(t.nombre)}</span></td>
                <td>${esSec ? 'Security' : 'Utility'}</td>
                <td class="der num">${fmt.num(esSec ? t.supply.emitido - t.supply.quemado : s.circulante)}</td>
                <td class="der num">${fmt.dinero(esSec ? s.valorEmitido : s.pasivoRedimible, 'USD', 0)}</td>
                <td class="der num">${fmt.dinero(t.origenAsignado, 'USD', 0)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>

          <div class="linea"></div>
          <div class="dl">
            <dt>Sello del libro</dt><dd class="mono">${esc((E().libro[0] || {}).hash || '—')}</dd>
            <dt>Asientos encadenados</dt><dd class="num">${E().libro.length}</dd>
            <dt>Integridad de la cadena</dt><dd class="${T.verificarLibro().ok ? 'ok-t' : 'bad-t'}">${T.verificarLibro().ok ? 'verificada' : 'rota'}</dd>
          </div>
        </div>
      </div>`;
    },
  };

  /* ---------- arranque ---------- */
  T.chasis({
    montaje: '#app', marca: 'ORIGEN', sub: 'Autoridad de emisión', acento: 'origen',
    inicio: 'panel',
    secciones: [
      { grupo: 'Autoridad', items: [
        { v: 'panel', t: 'Panel de respaldo', ic: 'panel' },
        { v: 'solicitudes', t: 'Cola de emisión', ic: 'lista', pill: true },
        { v: 'emision', t: 'Emitir / quemar', ic: 'token' },
      ] },
      { grupo: 'Respaldo', items: [
        { v: 'reservas', t: 'Reservas', ic: 'boveda' },
        { v: 'prueba', t: 'Prueba de reservas', ic: 'escudo2' },
      ] },
      { grupo: 'Gobierno', items: [
        { v: 'politica', t: 'Política y Consejo', ic: 'engrane' },
        { v: 'libro', t: 'Libro sellado', ic: 'libro' },
      ] },
    ],
    vistas: { panel, solicitudes, emision, reservas, prueba, politica, libro },
  });
})();

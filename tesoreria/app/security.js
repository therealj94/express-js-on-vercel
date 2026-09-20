/* ============================================================
   Tesorería de Security Tokens
   Emisión con valuación certificada, precio establecido, registro
   de tenedores, mercado secundario con banda y cumplimiento.
   Ningún token se emite sin autorización de la Autoridad ORIGEN.
   ============================================================ */
(function () {
  'use strict';
  const { fmt, esc, ic, el, toast, modal, cerrarModal, confirmar, medidor, alClic } = T;

  const E = () => T.estado;
  const SEC = () => E().securities;
  let tokenAbierto = null;

  const TIPOS = T.TIPOS_SEC;
  const ESTADOS = {
    borrador: ['', 'Borrador'], en_registro: ['warn', 'En registro'],
    listado: ['ok', 'Listado'], suspendido: ['bad', 'Suspendido'], redimido: ['', 'Redimido'],
  };
  const MERCADO = {
    abierto: ['ok', 'Mercado abierto'], ventana: ['acento', 'Por ventanas'], suspendido: ['bad', 'Suspendido'],
  };

  const valorCartera = () => SEC().reduce((s, t) => s + T.saludSecurity(t).valorEmitido, 0);

  /* ---------- panel ---------- */
  const panel = {
    titulo: 'Tesorería de Security Tokens',
    sub: () => `${SEC().length} emisiones · ${fmt.dineroCorto(valorCartera())} en circulación`,
    render() {
      const r = T.respaldo();
      const alertas = SEC().flatMap((t) => T.saludSecurity(t).alertas.map((a) => [t, a]));
      const tenedoresTot = SEC().reduce((s, t) => s + t.tenedores, 0);
      const pend = E().solicitudes.filter((s) => s.tipo === 'security' && ['en_revision', 'objecion'].includes(s.estado));
      return `
      <div class="grid g4">
        <div class="kpi acento"><div class="et">${ic('token')} Valor en circulación</div>
          <div class="val num">${fmt.dineroCorto(valorCartera())}</div>
          <div class="nota">Tokens emitidos × precio establecido</div></div>
        <div class="kpi"><div class="et">${ic('balanza')} Valuación certificada</div>
          <div class="val num">${fmt.dineroCorto(SEC().reduce((s, t) => s + t.valuacion.valorCertificado, 0))}</div>
          <div class="nota">Suma de informes de valuador vigentes</div></div>
        <div class="kpi"><div class="et">${ic('personas')} Tenedores registrados</div>
          <div class="val num">${fmt.num(tenedoresTot)}</div>
          <div class="nota">Todos con Genesis ID verificado</div></div>
        <div class="kpi ${alertas.length ? 'mal' : 'bien'}"><div class="et">${ic('alerta')} Alertas abiertas</div>
          <div class="val num">${alertas.length}</div>
          <div class="nota">${alertas.length ? 'Requieren acción del Comité' : 'Cartera en regla'}</div></div>
      </div>

      ${pend.length ? `<div class="aviso warn mt16">${ic('reloj')}<div>
        <b>${pend.length} solicitud(es) de emisión ante la Autoridad ORIGEN</b>
        <span class="txt">${pend.map((s) => `${s.simbolo}: ${fmt.num(s.cantidad)} tokens por ${fmt.dineroCorto(s.origenRequerido)} (${s.firmas.length}/${s.firmasRequeridas} firmas)`).join(' · ')}</span>
      </div></div>` : ''}

      ${alertas.length ? alertas.map(([t, a]) => `<div class="aviso bad mt16">${ic('alerta')}<div>
        <b>${esc(t.simbolo)}</b><span class="txt">${esc(a)}</span></div></div>`).join('') : ''}

      <div class="titulo-sec">Emisiones</div>
      <div class="grid g3">
        ${SEC().map((t) => {
          const s = T.saludSecurity(t);
          const em = ESTADOS[t.estado] || ['', t.estado];
          const usado = t.supply.autorizado ? (t.supply.emitido / t.supply.autorizado) * 100 : 0;
          return `<div class="card" data-abrir="${t.id}" style="cursor:pointer">
            <div class="cab"><h3>${esc(t.simbolo)}</h3>
              <div class="der"><span class="tag ${em[0]}">${esc(em[1])}</span></div></div>
            <div class="cuerpo">
              <div class="faint" style="font-size:12px;margin-bottom:12px">${esc(t.nombre)} · ${esc(TIPOS[t.tipo])}</div>
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
                <div><div class="et faint" style="font-size:10.5px;letter-spacing:.09em;text-transform:uppercase">Precio establecido</div>
                  <div class="num" style="font-size:22px;font-weight:650">${fmt.dinero(t.precioUnitario)}</div></div>
                <div style="text-align:right"><div class="faint" style="font-size:10.5px;letter-spacing:.09em;text-transform:uppercase">Emitidos</div>
                  <div class="num" style="font-size:15px;font-weight:600">${fmt.compacto(t.supply.emitido)}</div></div>
              </div>
              <div class="barra"><i class="a" style="width:${usado}%"></i></div>
              <div class="ts mt10">${fmt.num(t.supply.emitido)} de ${fmt.num(t.supply.autorizado)} autorizados · ${fmt.num(s.cabecera)} en cabecera</div>
              <div class="linea" style="margin:13px 0"></div>
              <dl class="dl" style="font-size:12.5px">
                <dt>Cobertura</dt><dd class="num ${s.cobertura >= 100 ? 'ok-t' : 'bad-t'}">${Number.isFinite(s.cobertura) ? fmt.pct(s.cobertura, 1) : '∞'}</dd>
                <dt>ORIGEN asignado</dt><dd class="num">${fmt.dineroCorto(t.origenAsignado)}</dd>
                <dt>Mercado</dt><dd><span class="tag ${(MERCADO[t.mercado.estado] || [''])[0]}">${esc((MERCADO[t.mercado.estado] || ['', t.mercado.estado])[1])}</span></dd>
              </dl>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="grid g-1-2 mt16">
        <div class="card"><div class="cab"><h3>Respaldo disponible</h3></div>
          <div class="cuerpo" style="text-align:center">
            ${medidor(Math.min(r.ratio, 200), 'ORIGEN', r.salud === 'ok' ? 'var(--ok)' : r.salud === 'warn' ? 'var(--warn)' : 'var(--bad)', 128)}
            <p class="ts mt10">${fmt.dineroCorto(r.libre)} de ORIGEN libre para nuevas emisiones</p>
            <a class="btn chico mt10" href="./origen.html">Ir a la Autoridad ${ic('flecha')}</a>
          </div></div>
        <div class="card"><div class="cab"><h3>Calendario de obligaciones</h3></div><div class="cuerpo">
          ${calendario()}
        </div></div>
      </div>`;
    },
    alMontar(c) { alClic(c, 'data-abrir', (id) => { tokenAbierto = id; location.hash = 'tokens'; }); },
  };

  function calendario() {
    const items = [];
    SEC().forEach((t) => {
      if (t.valuacion.proximaRevision) items.push({ f: t.valuacion.proximaRevision, t: `${t.simbolo} · revisión de valuación`, n: 'Comité de Valuación' });
      if (t.lockupHasta && new Date(t.lockupHasta) > new Date()) items.push({ f: t.lockupHasta, t: `${t.simbolo} · fin del lock-up`, n: 'Transfer agent' });
      if (t.mercado.proximaVentana) items.push({ f: t.mercado.proximaVentana, t: `${t.simbolo} · ventana de negociación`, n: t.mercado.ventanas });
      (t.cumplimiento.reportes || []).forEach((r) => {
        if (r.estado !== 'al_corriente') items.push({ f: r.fecha, t: `${t.simbolo} · ${r.tipo} ${r.periodo}`, n: r.estado === 'vencido' ? 'VENCIDO' : 'Programado' });
      });
    });
    items.sort((a, b) => new Date(a.f) - new Date(b.f));
    if (!items.length) return `<div class="vacio">${ic('reloj')}<div>Sin obligaciones próximas.</div></div>`;
    return `<div class="linea-tiempo">${items.slice(0, 8).map((i) => {
      const venc = new Date(i.f) < new Date();
      return `<div class="ev ${venc ? 'bad' : ''}"><b>${esc(i.t)}</b><p>${esc(i.n)}</p>
        <div class="ts">${fmt.fecha(i.f)} · ${fmt.relativo(i.f)}</div></div>`;
    }).join('')}</div>`;
  }

  /* ---------- tokens / detalle ---------- */
  const tokens = {
    titulo: 'Emisiones registradas',
    sub: () => (tokenAbierto ? 'Expediente de la emisión' : `${SEC().length} security tokens`),
    render() {
      if (tokenAbierto) return detalle(T.buscar.security(tokenAbierto));
      return `
      <div class="card"><div class="cab"><h3>Security tokens del ecosistema</h3>
        <div class="der"><button class="btn pri chico" data-nuevo>${ic('mas')} Registrar emisión</button></div></div>
        <div class="cuerpo plano tabla-wrap"><table class="tabla">
          <thead><tr><th>Token</th><th>Emisor</th><th>Tipo</th><th class="der">Precio</th>
            <th class="der">Emitidos</th><th class="der">Valor</th><th class="der">Cobertura</th><th>Estado</th><th></th></tr></thead>
          <tbody>${SEC().map((t) => {
            const s = T.saludSecurity(t); const em = ESTADOS[t.estado] || ['', t.estado];
            const emi = T.buscar.emisor(t.emisorId);
            return `<tr class="click" data-abrir="${t.id}">
              <td><b>${esc(t.simbolo)}</b><span class="t2">${esc(t.nombre)}</span></td>
              <td>${esc(emi ? emi.nombre : '—')}<span class="t2">${esc(t.jurisdiccion)}</span></td>
              <td><span class="tag plano">${esc(TIPOS[t.tipo])}</span></td>
              <td class="der num">${fmt.dinero(t.precioUnitario)}</td>
              <td class="der num">${fmt.num(t.supply.emitido)}<span class="t2">de ${fmt.num(t.supply.autorizado)}</span></td>
              <td class="der num">${fmt.dineroCorto(s.valorEmitido)}</td>
              <td class="der"><span class="tag ${s.salud === 'ok' ? 'ok' : s.salud === 'warn' ? 'warn' : 'bad'}">${Number.isFinite(s.cobertura) ? fmt.pct(s.cobertura, 0) : '∞'}</span></td>
              <td><span class="tag ${em[0]}">${esc(em[1])}</span></td>
              <td class="der">${ic('flecha')}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`;
    },
    alMontar(c) {
      alClic(c, 'data-abrir', (id) => { tokenAbierto = id; T.guardar(); render(); });
      alClic(c, 'data-volver', () => { tokenAbierto = null; render(); });
      const n = el('[data-nuevo]', c); if (n) n.addEventListener('click', nuevaEmision);
      montarDetalle(c);
    },
  };

  function detalle(t) {
    if (!t) { tokenAbierto = null; return '<div class="vacio">Emisión no encontrada.</div>'; }
    const s = T.saludSecurity(t);
    const emi = T.buscar.emisor(t.emisorId);
    const em = ESTADOS[t.estado] || ['', t.estado];
    const sols = T.buscar.solicitudesDe(t.id);
    const tens = E().tenedores.filter((x) => x.tokenId === t.id);
    return `
    <button class="btn chico fantasma" data-volver style="margin-bottom:14px">← Todas las emisiones</button>

    <div class="card"><div class="cuerpo">
      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:260px">
          <div style="display:flex;align-items:center;gap:10px">
            <h2 style="font-size:24px;font-weight:660;letter-spacing:-.02em">${esc(t.simbolo)}</h2>
            <span class="tag ${em[0]}">${esc(em[1])}</span>
            <span class="tag plano">${esc(TIPOS[t.tipo])}</span>
          </div>
          <p class="muted" style="margin-top:6px">${esc(t.nombre)} · ${esc(emi ? emi.nombre : '—')} · ${esc(t.jurisdiccion)}</p>
          <p class="ts mt10">${esc(t.activo.descripcion)}</p>
        </div>
        <div style="text-align:right">
          <div class="faint" style="font-size:10.5px;letter-spacing:.09em;text-transform:uppercase">Precio establecido</div>
          <div class="num" style="font-size:32px;font-weight:660;letter-spacing:-.02em">${fmt.dinero(t.precioUnitario)}</div>
          <div class="ts">fijado por el Comité de Valuación · no flota</div>
        </div>
      </div>
      ${s.alertas.length ? s.alertas.map((a) => `<div class="aviso bad mt16">${ic('alerta')}<div><span class="txt">${esc(a)}</span></div></div>`).join('') : ''}
    </div></div>

    <div class="grid g4 mt16">
      <div class="kpi"><div class="et">Valuación certificada</div><div class="val num">${fmt.dineroCorto(t.valuacion.valorCertificado)}</div>
        <div class="nota">${esc(t.valuacion.valuador)} · ${fmt.fecha(t.valuacion.fecha)}</div></div>
      <div class="kpi acento"><div class="et">Valor emitido</div><div class="val num">${fmt.dineroCorto(s.valorEmitido)}</div>
        <div class="nota">${fmt.num(t.supply.emitido)} tokens × ${fmt.dinero(t.precioUnitario)}</div></div>
      <div class="kpi"><div class="et">ORIGEN asignado</div><div class="val num">${fmt.dineroCorto(t.origenAsignado)}</div>
        <div class="nota">${s.origenOk ? 'Cubre el valor emitido' : 'Insuficiente: bloquea emisión'}</div></div>
      <div class="kpi ${s.cabecera > 0 ? '' : 'bien'}"><div class="et">Cabecera autorizada</div><div class="val num">${fmt.num(s.cabecera)}</div>
        <div class="nota">Tokens autorizados sin emitir</div></div>
    </div>

    <div class="grid g-2-1 mt16">
      <div class="card"><div class="cab"><h3>Supply y límites</h3>
        <div class="der">
          ${s.cabecera > 0 ? `<button class="btn pri chico" data-emitir="${t.id}">${ic('mas')} Emitir ${fmt.num(s.cabecera)}</button>` : ''}
          <button class="btn chico" data-solicitar="${t.id}">${ic('doc')} Solicitar emisión</button>
        </div></div>
        <div class="cuerpo">
          <div class="barra" style="height:11px">
            <i class="ok" style="width:${(t.supply.emitido / Math.max(t.supply.autorizado, 1)) * 100}%"></i>
            <i class="n" style="width:${(s.cabecera / Math.max(t.supply.autorizado, 1)) * 100}%"></i>
          </div>
          <div class="leyenda"><b class="ok">Emitidos ${fmt.num(t.supply.emitido)}</b><b>Cabecera ${fmt.num(s.cabecera)}</b></div>
          <div class="linea"></div>
          <dl class="dl">
            <dt>Techo por valuación</dt><dd class="num">${fmt.num(Math.floor(t.valuacion.valorCertificado / t.precioUnitario))} tokens</dd>
            <dt>Techo por ORIGEN asignado</dt><dd class="num">${fmt.num(Math.floor(t.origenAsignado / t.precioUnitario))} tokens</dd>
            <dt>Autorizado por la Autoridad</dt><dd class="num">${fmt.num(t.supply.autorizado)} tokens</dd>
            <dt>En tesorería del emisor</dt><dd class="num">${fmt.num(t.supply.enTesoreria)}</dd>
            <dt>Quemados</dt><dd class="num">${fmt.num(t.supply.quemado)}</dd>
          </dl>
          <div class="aviso acento mt16">${ic('candado')}<div><b>Por qué no se pueden imprimir tokens</b>
            <span class="txt">El supply autorizado solo sube cuando la Autoridad ORIGEN aprueba una solicitud con causa válida, valuación certificada y respaldo libre. Emitir por encima de la cabecera es imposible desde esta pantalla.</span></div></div>
        </div>
      </div>

      <div>
        <div class="card"><div class="cab"><h3>Valuación</h3>
          <div class="der"><button class="btn chico" data-valuar="${t.id}">Nueva valuación</button></div></div>
          <div class="cuerpo">
            <dl class="dl">
              <dt>Método</dt><dd style="text-align:right;max-width:190px">${esc(t.valuacion.metodo)}</dd>
              <dt>Valuador</dt><dd>${esc(t.valuacion.valuador)}</dd>
              <dt>Informe</dt><dd class="mono">${esc(t.valuacion.informeHash)}</dd>
              <dt>Fecha</dt><dd>${fmt.fecha(t.valuacion.fecha)}</dd>
              <dt>Próxima revisión</dt><dd class="${s.valVence ? 'bad-t' : ''}">${fmt.fecha(t.valuacion.proximaRevision)}</dd>
            </dl>
            <div class="titulo-sec">Historial</div>
            ${sparkline(t.valuacion.historial.map((h) => h.valor))}
            ${t.valuacion.historial.map((h) => `<div style="display:flex;gap:8px;font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--line)">
              <span class="ts">${fmt.fecha(h.fecha)}</span>
              <span class="num" style="margin-left:auto">${fmt.dineroCorto(h.valor)}</span>
              <span class="num faint">@ ${fmt.dinero(h.precio)}</span></div>`).join('')}
          </div>
        </div>

        <div class="card mt16"><div class="cab"><h3>Distribuciones</h3></div><div class="cuerpo">
          <p class="muted" style="font-size:12.5px;line-height:1.55;margin-bottom:12px">${esc(t.dividendo.politica)}</p>
          <dl class="dl">
            <dt>Último pago</dt><dd>${fmt.fecha(t.dividendo.ultimoPago)}</dd>
            <dt>Monto</dt><dd class="num">${fmt.dinero(t.dividendo.montoUltimo)}</dd>
            <dt>Rendimiento</dt><dd class="num ok-t">${fmt.pct(t.dividendo.yield, 1)}</dd>
          </dl>
          <button class="btn chico mt16" data-distribuir="${t.id}" style="width:100%;justify-content:center">Registrar distribución</button>
        </div></div>
      </div>
    </div>

    <div class="grid g2 mt16">
      <div class="card"><div class="cab"><h3>Mercado secundario</h3>
        <div class="der"><span class="tag ${(MERCADO[t.mercado.estado] || [''])[0]}">${esc((MERCADO[t.mercado.estado] || ['', t.mercado.estado])[1])}</span></div></div>
        <div class="cuerpo">
          <dl class="dl">
            <dt>Precio de referencia</dt><dd class="num">${fmt.dinero(t.mercado.referencia)}</dd>
            <dt>Banda permitida</dt><dd class="num">±${fmt.pct(t.mercado.banda * 100, 1)} → ${fmt.dinero(t.mercado.referencia * (1 - t.mercado.banda))} – ${fmt.dinero(t.mercado.referencia * (1 + t.mercado.banda))}</dd>
            <dt>Última operación</dt><dd class="num">${t.mercado.ultimaOperacion ? fmt.dinero(t.mercado.ultimaOperacion) : '—'}</dd>
            <dt>Volumen 30 d</dt><dd class="num">${fmt.dineroCorto(t.mercado.volumen30d)}</dd>
            <dt>Ventanas</dt><dd style="text-align:right;max-width:200px">${esc(t.mercado.ventanas)}</dd>
          </dl>
          <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
            <button class="btn chico" data-mercado="${t.id}">Cambiar régimen</button>
            <button class="btn chico" data-orden="${t.id}">Colocar orden</button>
          </div>
        </div>
      </div>

      <div class="card"><div class="cab"><h3>Cumplimiento</h3></div><div class="cuerpo">
        <dl class="dl">
          <dt>Exención</dt><dd>${esc(t.exencion)}</dd>
          <dt>ISIN</dt><dd class="mono">${esc(t.isin)}</dd>
          <dt>Transfer agent</dt><dd style="text-align:right;max-width:180px">${esc(t.cumplimiento.transferAgent)}</dd>
          <dt>KYC obligatorio</dt><dd>${t.cumplimiento.kyc ? '<span class="ok-t">sí</span>' : 'no'}</dd>
          <dt>Solo acreditados</dt><dd>${t.cumplimiento.acreditados ? '<span class="ok-t">sí</span>' : 'no'}</dd>
          <dt>Lock-up</dt><dd>${new Date(t.lockupHasta) > new Date() ? fmt.fecha(t.lockupHasta) : '<span class="faint">vencido</span>'}</dd>
        </dl>
        <p class="ts mt10">${esc(t.cumplimiento.restricciones)}</p>
        <div class="titulo-sec">Reportes periódicos</div>
        ${(t.cumplimiento.reportes || []).length ? t.cumplimiento.reportes.map((r) => `
          <div style="display:flex;gap:9px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)">
            <div style="flex:1"><b style="font-size:12.5px">${esc(r.tipo)}</b><span class="t2 faint">${esc(r.periodo)} · ${fmt.fecha(r.fecha)}</span></div>
            <span class="tag ${r.estado === 'al_corriente' ? 'ok' : r.estado === 'vencido' ? 'bad' : 'warn'}">${esc(r.estado.replace('_', ' '))}</span>
            ${r.estado !== 'al_corriente' ? `<button class="btn chico" data-reporte="${t.id}|${r.periodo}">Presentar</button>` : ''}
          </div>`).join('') : '<p class="faint" style="font-size:12.5px">Sin reportes registrados.</p>'}
      </div></div>
    </div>

    <div class="grid g2 mt16">
      <div class="card"><div class="cab"><h3>Registro de tenedores</h3>
        <div class="der"><button class="btn chico" data-transferir="${t.id}">Transferir</button></div></div>
        <div class="cuerpo plano tabla-wrap">${tens.length ? `<table class="tabla">
          <thead><tr><th>Tenedor</th><th>Tipo</th><th class="der">Tokens</th><th class="der">%</th><th>Estado</th></tr></thead>
          <tbody>${tens.map((x) => `<tr>
            <td><b>${esc(x.nombre)}</b><span class="t2 mono">${esc(x.genesisId)}</span></td>
            <td>${esc(x.tipo)}<span class="t2">${esc(x.pais)}</span></td>
            <td class="der num">${fmt.num(x.cantidad)}</td>
            <td class="der num">${fmt.pct((x.cantidad / Math.max(t.supply.emitido, 1)) * 100, 1)}</td>
            <td><span class="tag ok">${esc(x.estado)}</span>${x.lockup && new Date(x.lockup) > new Date() ? '<span class="t2">lock-up</span>' : ''}</td>
          </tr>`).join('')}</tbody></table>` : `<div class="vacio">${ic('personas')}<div>Aún no hay tenedores.</div></div>`}
        </div>
      </div>

      <div class="card"><div class="cab"><h3>Expediente ante la Autoridad</h3></div>
        <div class="cuerpo plano tabla-wrap">${sols.length ? `<table class="tabla">
          <thead><tr><th>Solicitud</th><th class="der">Cantidad</th><th class="der">ORIGEN</th><th>Estado</th></tr></thead>
          <tbody>${sols.map((x) => `<tr>
            <td>${esc(T.etiquetaAccion(x.accion))}<span class="t2 mono">${esc(x.id)} · ${fmt.fecha(x.creada)}</span></td>
            <td class="der num">${fmt.num(x.cantidad)}</td>
            <td class="der num">${fmt.dineroCorto(x.origenRequerido)}</td>
            <td><span class="tag ${x.estado === 'aprobada' ? 'ok' : x.estado === 'rechazada' ? 'bad' : 'warn'}">${esc(x.estado.replace('_', ' '))}</span></td>
          </tr>`).join('')}</tbody></table>` : `<div class="vacio">${ic('doc')}<div>Sin solicitudes.</div></div>`}
        </div>
      </div>
    </div>`;
  }

  /** Línea de la valuación en el tiempo: dice más que tres cifras sueltas. */
  function sparkline(valores) {
    if (!valores || valores.length < 2) return '';
    const W = 260, H = 46, min = Math.min(...valores), max = Math.max(...valores), r = max - min || 1;
    const pts = valores.map((v, i) => [(i / (valores.length - 1)) * (W - 8) + 4, H - 6 - ((v - min) / r) * (H - 12)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const ult = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:46px;display:block;margin-bottom:6px" aria-label="Valuación en el tiempo">
      <path d="${d} L${ult[0].toFixed(1)} ${H} L4 ${H} Z" fill="var(--acento-soft)" stroke="none"/>
      <path d="${d}" fill="none" stroke="var(--acento)" stroke-width="2"/>
      <circle cx="${ult[0].toFixed(1)}" cy="${ult[1].toFixed(1)}" r="3" fill="var(--acento)" stroke="none"/>
    </svg>`;
  }

  function montarDetalle(c) {
    alClic(c, 'data-emitir', (id) => ejecutarEmision(id));
    alClic(c, 'data-solicitar', (id) => nuevaSolicitud(id));
    alClic(c, 'data-valuar', (id) => nuevaValuacion(id));
    alClic(c, 'data-mercado', (id) => cambiarMercado(id));
    alClic(c, 'data-orden', (id) => colocarOrden(id));
    alClic(c, 'data-transferir', (id) => transferir(id));
    alClic(c, 'data-distribuir', (id) => distribuir(id));
    alClic(c, 'data-reporte', (v) => {
      const [tokenId, periodo] = v.split('|');
      T.correr('reporte.presentar', { tokenId, periodo }, 'Reporte presentado');
    });
  }

  /* ---------- acciones ---------- */

  function ejecutarEmision(id) {
    const t = T.buscar.security(id);
    const s = T.saludSecurity(t);
    modal({
      titulo: `Emitir ${t.simbolo}`,
      cuerpo: `
        <div class="aviso ok" style="margin-bottom:16px">${ic('check')}<div>
          <b>Emisión ya autorizada</b>
          <span class="txt">La Autoridad ORIGEN autorizó ${fmt.num(s.cabecera)} tokens de cabecera con ${fmt.dineroCorto(t.origenAsignado)} de respaldo comprometido. Emitir dentro de ese límite no requiere nueva aprobación.</span></div></div>
        <div class="campo"><label>Tokens a emitir</label>
          <input type="number" id="q" value="${s.cabecera}" min="1" max="${s.cabecera}">
          <span class="ayuda">Máximo ${fmt.num(s.cabecera)}. Se acreditan a la tesorería del emisor y desde ahí se colocan.</span></div>
        <dl class="dl">
          <dt>Precio establecido</dt><dd class="num">${fmt.dinero(t.precioUnitario)}</dd>
          <dt>Valor de la emisión</dt><dd class="num" id="vv">${fmt.dinero(s.cabecera * t.precioUnitario)}</dd>
        </dl>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Emitir tokens</button>`,
      alAbrir(f) {
        const q = el('#q', f);
        q.addEventListener('input', () => { el('#vv', f).textContent = fmt.dinero(Number(q.value) * t.precioUnitario); });
        el('[data-ok]', f).addEventListener('click', async () => {
          const v = Number(q.value);
          if (await T.correr('token.emitir', { tokenId: id, cantidad: v }, 'Tokens emitidos', `${fmt.num(v)} ${t.simbolo}`)) cerrarModal();
        });
      },
    });
  }

  function nuevaSolicitud(id) {
    const t = T.buscar.security(id);
    const r = T.respaldo();
    const causas = T.CAUSAS.security;
    modal({
      ancho: true,
      titulo: `Solicitar emisión de ${t.simbolo} ante la Autoridad ORIGEN`,
      cuerpo: `
        <div class="pasos">
          <div class="p on"><b>Paso 1</b>Causa y evidencia</div>
          <div class="p"><b>Paso 2</b>Dictamen de la Autoridad</div>
          <div class="p"><b>Paso 3</b>Firmas del Consejo</div>
        </div>
        <div class="aviso acento" style="margin-bottom:18px">${ic('alerta')}<div>
          <b>Solo se emite si hay una razón y hay respaldo</b>
          <span class="txt">Emitir más tokens exige una causa del catálogo, evidencia documental y ORIGEN libre. Hoy hay ${fmt.dineroCorto(r.libre)} disponibles.</span></div></div>
        <div class="campo"><label>Causa de la emisión</label>
          <select id="causa">${causas.map((c) => `<option value="${c.v}">${esc(c.t)}</option>`).join('')}</select>
          <span class="ayuda" id="pide">${esc(causas[0].pide)}</span></div>
        <div class="fila">
          <div class="campo"><label>Tokens a emitir</label><input type="number" id="q" min="1" step="1000" placeholder="0"></div>
          <div class="campo"><label>Precio establecido</label><input type="number" id="p" value="${t.precioUnitario}" step="0.01" readonly>
            <span class="ayuda">Fijo: solo el Comité de Valuación puede moverlo.</span></div>
        </div>
        <div class="campo"><label>Justificación</label>
          <textarea id="m" placeholder="Qué activo nuevo entra, qué informe lo certifica y por qué el mercado necesita estos tokens."></textarea></div>
        <div class="campo"><label>Evidencia documental</label>
          <input id="ev" placeholder="Informe de valuador, acta de asamblea, certificado…">
          <span class="ayuda">Se calcula la huella del documento y se adjunta al expediente.</span></div>
        <div class="card" style="box-shadow:none"><div class="cuerpo">
          <dl class="dl">
            <dt>ORIGEN requerido</dt><dd class="num ac-t" id="req">$0.00</dd>
            <dt>ORIGEN libre hoy</dt><dd class="num">${fmt.dinero(r.libre)}</dd>
            <dt>Valuación certificada</dt><dd class="num">${fmt.dinero(t.valuacion.valorCertificado)}</dd>
            <dt>Valor tras la emisión</dt><dd class="num" id="post">${fmt.dinero(T.saludSecurity(t).valorEmitido)}</dd>
          </dl>
          <div id="dict" class="mt16"></div>
        </div></div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Enviar a la Autoridad</button>`,
      alAbrir(f) {
        const q = el('#q', f), p = el('#p', f), causa = el('#causa', f);
        function recalcular() {
          const req = (Number(q.value) || 0) * (Number(p.value) || 0);
          el('#req', f).textContent = fmt.dinero(req);
          const post = t.supply.autorizado * t.precioUnitario + req; // lo ya autorizado también cuenta contra la valuación
          el('#post', f).textContent = fmt.dinero(post);
          const ch = T.puedeEmitir(req);
          const excedeVal = post > t.valuacion.valorCertificado + 0.01;
          const problemas = ch.faltas.concat(excedeVal ? [`El valor autorizado (${fmt.dineroCorto(post)}) superaría la valuación certificada (${fmt.dineroCorto(t.valuacion.valorCertificado)}). Hace falta una revaluación primero.`] : []);
          el('#dict', f).innerHTML = req <= 0 ? '' : `<div class="aviso ${problemas.length ? 'bad' : 'ok'}">${ic(problemas.length ? 'alerta' : 'check')}
            <div><b>${problemas.length ? 'La Autoridad rechazaría esta solicitud' : 'La solicitud cumple los requisitos de respaldo'}</b>
            <span class="txt">${problemas.length ? esc(problemas.join(' ')) : 'Pasará a la cola para firmas del Consejo y ventana de objeción.'}</span></div></div>`;
        }
        q.addEventListener('input', recalcular); p.addEventListener('input', recalcular);
        causa.addEventListener('change', () => {
          el('#pide', f).textContent = (causas.find((c) => c.v === causa.value) || {}).pide || '';
        });
        el('[data-ok]', f).addEventListener('click', async () => {
          const evn = el('#ev', f).value.trim();
          const r = await T.correr('solicitud.crear', {
            tokenId: t.id, cantidad: Number(q.value), precio: Number(p.value), motivo: el('#m', f).value.trim(), causa: causa.value,
            evidencias: evn ? [{ nombre: evn, tipo: 'Adjunto del solicitante' }] : [],
          }, 'Solicitud enviada', 'Está en la cola de la Autoridad ORIGEN');
          if (r) cerrarModal();
        });
      },
    });
  }

  function nuevaValuacion(id) {
    const t = T.buscar.security(id);
    modal({
      titulo: `Nueva valuación de ${t.simbolo}`,
      cuerpo: `
        <div class="aviso warn" style="margin-bottom:16px">${ic('balanza')}<div>
          <b>Revaluar no emite tokens</b>
          <span class="txt">Una valuación al alza solo abre la puerta a solicitar emisión; el supply no cambia hasta que la Autoridad ORIGEN lo autorice. El precio establecido solo se mueve con acta del Comité.</span></div></div>
        <div class="fila">
          <div class="campo"><label>Valor certificado (USD)</label><input type="number" id="v" value="${t.valuacion.valorCertificado}" step="10000"></div>
          <div class="campo"><label>Precio establecido (USD)</label><input type="number" id="p" value="${t.precioUnitario}" step="0.01"></div>
        </div>
        <div class="campo"><label>Método</label><input id="me" value="${esc(t.valuacion.metodo)}"></div>
        <div class="fila">
          <div class="campo"><label>Valuador independiente</label><input id="va" value="${esc(t.valuacion.valuador)}"></div>
          <div class="campo"><label>Folio del informe</label><input id="inf" placeholder="VAL-…"></div>
        </div>
        <div class="campo mb0"><label>Miembros del Comité que firman</label>
          <div>${E().consejo.map((c, i) => `<label class="check"><input type="checkbox" class="cm" value="${esc(c)}" ${i < 3 ? 'checked' : ''}><span><b>${esc(c)}</b><span>Comité de Valuación</span></span></label>`).join('')}</div>
          <span class="ayuda">Se requieren al menos 3 firmas para asentar la valuación.</span></div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Asentar valuación</button>`,
      alAbrir(f) {
        el('[data-ok]', f).addEventListener('click', async () => {
          const r = await T.correr('valuacion.asentar', {
            tokenId: id, valorCertificado: Number(el('#v', f).value), precioUnitario: Number(el('#p', f).value),
            metodo: el('#me', f).value.trim(), valuador: el('#va', f).value.trim(), informe: el('#inf', f).value.trim(),
            firmas: T.els('.cm:checked', f).map((x) => x.value),
          }, 'Valuación asentada', 'El techo de emisión se recalculó');
          if (r) cerrarModal();
        });
      },
    });
  }

  function cambiarMercado(id) {
    const t = T.buscar.security(id);
    modal({
      titulo: `Régimen de mercado de ${t.simbolo}`,
      cuerpo: `
        <div class="campo"><label>Régimen</label>
          <select id="r">
            <option value="abierto" ${t.mercado.estado === 'abierto' ? 'selected' : ''}>Abierto — negociación continua entre acreditados</option>
            <option value="ventana" ${t.mercado.estado === 'ventana' ? 'selected' : ''}>Por ventanas — solo en horarios definidos</option>
            <option value="suspendido" ${t.mercado.estado === 'suspendido' ? 'selected' : ''}>Suspendido — sin negociación</option>
          </select></div>
        <div class="fila">
          <div class="campo"><label>Banda permitida %</label><input type="number" id="b" value="${(t.mercado.banda * 100).toFixed(1)}" step="0.5" min="0" max="50">
            <span class="ayuda">Techo y piso sobre el precio de referencia. Una orden fuera de banda se rechaza.</span></div>
          <div class="campo"><label>Precio de referencia</label><input type="number" id="ref" value="${t.mercado.referencia}" step="0.01" readonly>
            <span class="ayuda">Es el precio certificado; se mueve con una valuación.</span></div>
        </div>
        <div class="campo mb0"><label>Ventanas de negociación</label><input id="v" value="${esc(t.mercado.ventanas)}"></div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Guardar</button>`,
      alAbrir(f) {
        el('[data-ok]', f).addEventListener('click', async () => {
          const r = await T.correr('mercado.regimen', { tokenId: id, estado: el('#r', f).value, banda: Number(el('#b', f).value) / 100, ventanas: el('#v', f).value.trim() }, 'Régimen actualizado', '');
          if (r) cerrarModal();
        });
      },
    });
  }

  function colocarOrden(id) {
    const t = T.buscar.security(id);
    const min = t.mercado.referencia * (1 - t.mercado.banda);
    const max = t.mercado.referencia * (1 + t.mercado.banda);
    modal({
      titulo: `Colocar orden · ${t.simbolo}`,
      cuerpo: `
        ${t.mercado.estado === 'suspendido' ? `<div class="aviso bad" style="margin-bottom:16px">${ic('alerta')}<div><b>Mercado suspendido</b><span class="txt">No se admiten órdenes hasta que el emisor reanude la negociación.</span></div></div>` : ''}
        <div class="fila t3">
          <div class="campo"><label>Lado</label><select id="l"><option value="compra">Compra</option><option value="venta">Venta</option></select></div>
          <div class="campo"><label>Cantidad</label><input type="number" id="q" min="1" step="100" placeholder="0"></div>
          <div class="campo"><label>Precio</label><input type="number" id="p" value="${t.mercado.referencia}" step="0.01"></div>
        </div>
        <div class="aviso acento">${ic('balanza')}<div><b>Banda de precio</b>
          <span class="txt">Solo se admiten órdenes entre ${fmt.dinero(min)} y ${fmt.dinero(max)} (±${fmt.pct(t.mercado.banda * 100, 1)} sobre el precio certificado de ${fmt.dinero(t.mercado.referencia)}). Fuera de eso, el libro la rechaza.</span></div></div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok ${t.mercado.estado === 'suspendido' ? 'disabled' : ''}>Colocar orden</button>`,
      alAbrir(f) {
        el('[data-ok]', f).addEventListener('click', async () => {
          const r = await T.correr('orden.colocar', { tokenId: id, lado: el('#l', f).value, cantidad: Number(el('#q', f).value), precio: Number(el('#p', f).value) }, 'Orden colocada', 'Visible en la próxima ventana');
          if (r) cerrarModal();
        });
      },
    });
  }

  function transferir(id) {
    const t = T.buscar.security(id);
    const tens = E().tenedores.filter((x) => x.tokenId === id);
    modal({
      titulo: `Transferencia registrada · ${t.simbolo}`,
      cuerpo: `
        <div class="aviso acento" style="margin-bottom:16px">${ic('candado')}<div><b>Transferencia restringida</b>
          <span class="txt">${esc(t.cumplimiento.restricciones)}</span></div></div>
        <div class="fila">
          <div class="campo"><label>De</label><select id="de">${tens.map((x) => `<option value="${x.id}">${esc(x.nombre)} — ${fmt.num(x.cantidad)}</option>`).join('')}</select></div>
          <div class="campo"><label>A</label><select id="a">${tens.map((x) => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('')}</select></div>
        </div>
        <div class="campo mb0"><label>Cantidad</label><input type="number" id="q" min="1" step="100" placeholder="0">
          <span class="ayuda">El transfer agent verifica Genesis ID, perfil de acreditado y lock-up antes de asentar.</span></div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Asentar transferencia</button>`,
      alAbrir(f) {
        el('[data-ok]', f).addEventListener('click', async () => {
          const r = await T.correr('token.transferir', { tokenId: id, de: el('#de', f).value, a: el('#a', f).value, cantidad: Number(el('#q', f).value) }, 'Transferencia asentada', '');
          if (r) cerrarModal();
        });
      },
    });
  }

  function distribuir(id) {
    const t = T.buscar.security(id);
    modal({
      titulo: `Distribución · ${t.simbolo}`,
      cuerpo: `
        <p class="muted" style="font-size:13px;margin-bottom:14px">${esc(t.dividendo.politica)}</p>
        <div class="campo"><label>Monto total a distribuir (USD)</label><input type="number" id="m" min="0" step="1000" placeholder="0">
          <span class="ayuda">Se reparte a prorrata entre los ${fmt.num(t.tenedores)} tenedores registrados.</span></div>
        <div class="campo mb0"><label>Concepto</label><input id="c" placeholder="Distribución semestral 2026-H2"></div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Registrar distribución</button>`,
      alAbrir(f) {
        el('[data-ok]', f).addEventListener('click', async () => {
          const r = await T.correr('distribucion.registrar', { tokenId: id, monto: Number(el('#m', f).value), concepto: el('#c', f).value.trim() }, 'Distribución registrada');
          if (r) cerrarModal();
        });
      },
    });
  }

  function nuevaEmision() {
    modal({
      ancho: true,
      titulo: 'Registrar una nueva emisión',
      cuerpo: `
        <div class="pasos">
          <div class="p on"><b>Paso 1</b>Emisor y activo</div>
          <div class="p"><b>Paso 2</b>Valuación y precio</div>
          <div class="p"><b>Paso 3</b>Autorización ORIGEN</div>
        </div>
        <div class="fila">
          <div class="campo"><label>Símbolo</label><input id="s" placeholder="ONDK" maxlength="8"></div>
          <div class="campo"><label>Nombre</label><input id="n" placeholder="Orden Digital Kapital"></div>
        </div>
        <div class="fila">
          <div class="campo"><label>Emisor</label><select id="em">${E().emisores.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('')}</select></div>
          <div class="campo"><label>Tipo</label><select id="ti">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
        </div>
        <div class="campo"><label>Activo subyacente</label><textarea id="ac" placeholder="Qué respalda al token: reservas, inmueble, participación, flujo…"></textarea></div>
        <div class="fila t3">
          <div class="campo"><label>Valuación certificada (USD)</label><input type="number" id="v" min="0" step="10000" placeholder="0"></div>
          <div class="campo"><label>Precio por token (USD)</label><input type="number" id="p" min="0" step="0.01" placeholder="0.00"></div>
          <div class="campo"><label>Jurisdicción</label><input id="ju" placeholder="México / Panamá"></div>
        </div>
        <div class="fila">
          <div class="campo"><label>Valuador independiente</label><input id="va" placeholder="Firma de valuación"></div>
          <div class="campo"><label>Exención / régimen</label><input id="ex" placeholder="Reg S · Reg D 506(c) · LMV art. 8"></div>
        </div>
        <div class="campo"><label>Contrato en la cadena 5550 (opcional)</label><input id="co" placeholder="0x…" class="mono">
          <span class="ayuda">Si el token ya vive en la cadena, la Autoridad concilia su totalSupply contra lo autorizado aquí.</span></div>
        <div class="aviso acento">${ic('alerta')}<div><b>Queda en borrador</b>
          <span class="txt">La emisión nace sin supply. Para tener tokens hay que solicitar la autorización a la Autoridad ORIGEN, que verifica que exista respaldo libre.</span></div></div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Registrar emisión</button>`,
      alAbrir(f) {
        el('[data-ok]', f).addEventListener('click', async () => {
          const r = await T.correr('security.registrar', {
            simbolo: el('#s', f).value.trim(), nombre: el('#n', f).value.trim(), emisorId: el('#em', f).value, tipo: el('#ti', f).value,
            jurisdiccion: el('#ju', f).value.trim(), exencion: el('#ex', f).value.trim(), activo: el('#ac', f).value.trim(),
            valorCertificado: Number(el('#v', f).value), precioUnitario: Number(el('#p', f).value), valuador: el('#va', f).value.trim(),
            contrato: el('#co', f).value.trim(),
          }, 'Emisión registrada', 'Ahora solicita la autorización a ORIGEN');
          if (r) { cerrarModal(); tokenAbierto = r.resultado.creado; render(); }
        });
      },
    });
  }

  /* ---------- vista: mercado ---------- */
  const mercado = {
    titulo: 'Mercado secundario regulado',
    sub: 'Negociación por ventanas, dentro de banda y solo entre acreditados',
    render() {
      return SEC().map((t) => {
        const ords = E().ordenes.filter((o) => o.tokenId === t.id && o.estado === 'abierta');
        const compras = ords.filter((o) => o.lado === 'compra').sort((a, b) => b.precio - a.precio);
        const ventas = ords.filter((o) => o.lado === 'venta').sort((a, b) => a.precio - b.precio);
        const mejorC = compras[0], mejorV = ventas[0];
        const cruza = mejorC && mejorV && mejorC.precio >= mejorV.precio;
        const min = t.mercado.referencia * (1 - t.mercado.banda), max = t.mercado.referencia * (1 + t.mercado.banda);
        return `
        <div class="card" style="margin-bottom:16px"><div class="cab">
          <h3>${esc(t.simbolo)} — ${esc(t.nombre)}</h3>
          <div class="der">
            <span class="tag ${(MERCADO[t.mercado.estado] || [''])[0]}">${esc((MERCADO[t.mercado.estado] || ['', t.mercado.estado])[1])}</span>
            <button class="btn chico" data-orden="${t.id}">Colocar orden</button>
            <button class="btn chico" data-mercado="${t.id}">Régimen</button>
            ${cruza ? `<button class="btn pri chico" data-cruzar="${t.id}">Cruzar ${fmt.num(Math.min(mejorC.cantidad, mejorV.cantidad))}</button>` : ''}
          </div></div>
          <div class="cuerpo">
            <div class="grid g4" style="margin-bottom:16px">
              <div class="kpi"><div class="et">Referencia certificada</div><div class="val num">${fmt.dinero(t.mercado.referencia)}</div></div>
              <div class="kpi"><div class="et">Banda admitida</div><div class="val num" style="font-size:18px">${fmt.dinero(min)} – ${fmt.dinero(max)}</div>
                <div class="nota">±${fmt.pct(t.mercado.banda * 100, 1)}</div></div>
              <div class="kpi"><div class="et">Mejor compra / venta</div><div class="val num" style="font-size:18px">${mejorC ? fmt.dinero(mejorC.precio) : '—'} / ${mejorV ? fmt.dinero(mejorV.precio) : '—'}</div></div>
              <div class="kpi"><div class="et">Volumen 30 d</div><div class="val num">${fmt.dineroCorto(t.mercado.volumen30d)}</div></div>
            </div>
            ${ords.length ? `<div class="grid g2">
              <div><div class="titulo-sec" style="margin-top:0">Compras</div>
                <table class="tabla"><tbody>${compras.map((o) => `<tr>
                  <td class="num ok-t">${fmt.dinero(o.precio)}</td>
                  <td class="der num">${fmt.num(o.cantidad)}</td>
                  <td class="der ts">${fmt.relativo(o.ts)}</td></tr>`).join('') || '<tr><td class="faint">Sin compras</td></tr>'}</tbody></table></div>
              <div><div class="titulo-sec" style="margin-top:0">Ventas</div>
                <table class="tabla"><tbody>${ventas.map((o) => `<tr>
                  <td class="num bad-t">${fmt.dinero(o.precio)}</td>
                  <td class="der num">${fmt.num(o.cantidad)}</td>
                  <td class="der ts">${fmt.relativo(o.ts)}</td></tr>`).join('') || '<tr><td class="faint">Sin ventas</td></tr>'}</tbody></table></div>
            </div>` : `<div class="vacio">${ic('tienda')}<div>Sin órdenes en el libro.</div></div>`}
          </div>
        </div>`;
      }).join('') + `
      <div class="aviso acento">${ic('balanza')}<div><b>Por qué el precio no flota como en cripto</b>
        <span class="txt">El precio de referencia lo fija el Comité de Valuación contra un informe independiente. El mercado solo puede moverse dentro de la banda; fuera de ella la orden se rechaza y, si el desvío persiste, se suspende la negociación y se convoca una revaluación.</span></div></div>`;
    },
    alMontar(c) {
      alClic(c, 'data-orden', (id) => colocarOrden(id));
      alClic(c, 'data-mercado', (id) => cambiarMercado(id));
      alClic(c, 'data-cruzar', (id) => T.correr('mercado.cruzar', { tokenId: id }, 'Cruce ejecutado'));
    },
  };

  /* ---------- vista: tenedores ---------- */
  const tenedores = {
    titulo: 'Registro de tenedores',
    sub: 'El transfer agent del ecosistema',
    render() {
      const porToken = {};
      E().tenedores.forEach((x) => { (porToken[x.tokenId] = porToken[x.tokenId] || []).push(x); });
      return SEC().map((t) => {
        const lista = (porToken[t.id] || []).slice().sort((a, b) => b.cantidad - a.cantidad);
        const total = lista.reduce((s, x) => s + x.cantidad, 0);
        return `<div class="card" style="margin-bottom:16px"><div class="cab">
          <h3>${esc(t.simbolo)}</h3>
          <div class="der"><span class="tag plano">${fmt.num(lista.length)} registros · ${fmt.num(total)} tokens</span>
          <button class="btn chico" data-transferir="${t.id}">Transferir</button></div></div>
          <div class="cuerpo plano tabla-wrap">${lista.length ? `<table class="tabla">
            <thead><tr><th>Tenedor</th><th>Genesis ID</th><th>Tipo</th><th>País</th><th class="der">Tokens</th><th class="der">%</th><th>Restricción</th></tr></thead>
            <tbody>${lista.map((x) => `<tr>
              <td><b>${esc(x.nombre)}</b><span class="t2">desde ${fmt.fecha(x.desde)}</span></td>
              <td class="mono ts">${esc(x.genesisId)}</td>
              <td>${esc(x.tipo)}</td><td>${esc(x.pais)}</td>
              <td class="der num">${fmt.num(x.cantidad)}</td>
              <td class="der num">${fmt.pct((x.cantidad / Math.max(total, 1)) * 100, 2)}</td>
              <td>${x.lockup && new Date(x.lockup) > new Date()
                ? `<span class="tag warn">lock-up · ${fmt.fecha(x.lockup)}</span>`
                : '<span class="tag ok">libre</span>'}</td>
            </tr>`).join('')}</tbody></table>` : `<div class="vacio">${ic('personas')}<div>Sin tenedores registrados.</div></div>`}
          </div></div>`;
      }).join('');
    },
    alMontar(c) { alClic(c, 'data-transferir', (id) => transferir(id)); },
  };

  /* ---------- vista: cumplimiento ---------- */
  const cumplimiento = {
    titulo: 'Cumplimiento y reportes',
    sub: 'Lo que hay que entregar y cuándo',
    render() {
      const emisores = E().emisores;
      return `
      <div class="card"><div class="cab"><h3>Emisores registrados</h3></div>
        <div class="cuerpo plano tabla-wrap"><table class="tabla">
          <thead><tr><th>Emisor</th><th>Jurisdicción</th><th>LEI</th><th>Registro</th><th>Auditor</th><th>Estado</th></tr></thead>
          <tbody>${emisores.map((e) => `<tr>
            <td><b>${esc(e.nombre)}</b><span class="t2">rep. ${esc(e.representante)}</span></td>
            <td>${esc(e.jurisdiccion)}</td>
            <td class="mono ts">${esc(e.lei)}</td>
            <td class="mono ts">${esc(e.registro)}</td>
            <td>${esc(e.auditor)}</td>
            <td><span class="tag ${e.estado === 'vigente' ? 'ok' : 'warn'}">${esc(e.estado.replace('_', ' '))}</span></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>

      <div class="titulo-sec">Obligaciones periódicas</div>
      <div class="card"><div class="cuerpo plano tabla-wrap"><table class="tabla">
        <thead><tr><th>Token</th><th>Reporte</th><th>Periodo</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
        <tbody>${SEC().flatMap((t) => (t.cumplimiento.reportes || []).map((r) => `<tr>
          <td><b>${esc(t.simbolo)}</b></td><td>${esc(r.tipo)}</td><td>${esc(r.periodo)}</td>
          <td class="ts">${fmt.fecha(r.fecha)} · ${fmt.relativo(r.fecha)}</td>
          <td><span class="tag ${r.estado === 'al_corriente' ? 'ok' : r.estado === 'vencido' ? 'bad' : 'warn'}">${esc(r.estado.replace('_', ' '))}</span></td>
          <td class="der">${r.estado !== 'al_corriente' ? `<button class="btn chico" data-reporte="${t.id}|${r.periodo}">Presentar</button>` : ''}</td>
        </tr>`)).join('') || '<tr><td colspan="6" class="faint">Sin obligaciones registradas.</td></tr>'}</tbody>
      </table></div></div>

      <div class="grid g2 mt16">
        <div class="card"><div class="cab"><h3>Reglas de transferencia</h3></div><div class="cuerpo">
          ${SEC().map((t) => `<div style="padding:10px 0;border-bottom:1px solid var(--line)">
            <b style="font-size:13px">${esc(t.simbolo)}</b>
            <p class="ts" style="margin-top:4px">${esc(t.cumplimiento.restricciones)}</p></div>`).join('')}
        </div></div>
        <div class="card"><div class="cab"><h3>Qué hace distinto a un security token</h3></div><div class="cuerpo">
          <div class="aviso" style="margin-bottom:9px">${ic('escudo2')}<div><b>Valor primero, token después</b>
            <span class="txt">Se certifica el activo, se valúa con un tercero independiente y de ahí sale el precio. El token es el recibo de ese valor, no al revés.</span></div></div>
          <div class="aviso" style="margin-bottom:9px">${ic('candado')}<div><b>Supply cerrado por diseño</b>
            <span class="txt">No hay minería ni inflación programada. El supply solo crece con una causa acreditada y autorización de la Autoridad ORIGEN.</span></div></div>
          <div class="aviso" style="margin-bottom:9px">${ic('personas')}<div><b>Tenedor identificado</b>
            <span class="txt">Cada cartera está atada a un Genesis ID verificado. El transfer agent bloquea lo que no cumpla.</span></div></div>
          <div class="aviso">${ic('balanza')}<div><b>Precio con banda</b>
            <span class="txt">El secundario opera dentro de un rango sobre el valor certificado, como una bolsa con circuit breaker.</span></div></div>
        </div></div>
      </div>`;
    },
    alMontar(c) { montarDetalle(c); },
  };

  /* ---------- vista: libro ---------- */
  const libro = {
    titulo: 'Bitácora de la tesorería',
    sub: () => `${E().libro.length} asientos sellados`,
    render() {
      return `<div class="card"><div class="cuerpo"><div class="linea-tiempo">
        ${E().libro.map((ev) => `<div class="ev ${ev.nivel === 'ok' ? 'ok' : ev.nivel === 'bad' ? 'bad' : ev.nivel === 'warn' ? 'warn' : ''}">
          <b>${esc(ev.detalle)}</b><p>${esc(ev.tipo)} · ${esc(ev.actor)}</p>
          <div class="ts mono">${fmt.fechaHora(ev.ts)} · ${esc(ev.hash)}</div></div>`).join('')}
      </div></div></div>`;
    },
  };

  /* ---------- arranque ---------- */
  let app;
  function render() { if (app) app.render(); }
  app = T.chasis({
    montaje: '#app', marca: 'Tesorería', sub: 'Security tokens', acento: 'security',
    inicio: 'panel',
    secciones: [
      { grupo: 'Tesorería', items: [
        { v: 'panel', t: 'Panel', ic: 'panel' },
        { v: 'tokens', t: 'Emisiones', ic: 'token' },
        { v: 'mercado', t: 'Mercado', ic: 'tienda' },
      ] },
      { grupo: 'Registro', items: [
        { v: 'tenedores', t: 'Tenedores', ic: 'personas' },
        { v: 'cumplimiento', t: 'Cumplimiento', ic: 'escudo2' },
        { v: 'libro', t: 'Bitácora', ic: 'libro' },
      ] },
    ],
    vistas: { panel, tokens, mercado, tenedores, cumplimiento, libro },
  });
  // Al pulsar cualquier entrada del menú se cierra el expediente abierto.
  // En fase de captura, para que corra antes del render del chasis.
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('[data-vista]')) tokenAbierto = null;
  }, true);
})();

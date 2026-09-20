/* ============================================================
   Tesorería de Utility Tokens
   Tokens de uso del ecosistema: no dan propiedad ni dividendo.
   Regla dura: no puede circular un token sin capacidad de
   servicio que lo honre, y la parte redimible necesita ORIGEN.
   ============================================================ */
(function () {
  'use strict';
  const { fmt, esc, ic, el, toast, modal, cerrarModal, medidor, alClic } = T;

  const E = () => T.estado;
  const UTL = () => E().utilities;
  let tokenAbierto = null;

  const ESTADOS = {
    borrador: ['', 'Borrador'], en_registro: ['warn', 'En registro'],
    listado: ['ok', 'Activo'], suspendido: ['bad', 'Suspendido'],
  };

  const totales = () => {
    let circ = 0, pasivo = 0, origen = 0, cap = 0;
    UTL().forEach((t) => {
      const s = T.saludUtility(t);
      circ += s.circulante; pasivo += s.pasivoRedimible; origen += t.origenAsignado; cap += t.capacidad.comprometida;
    });
    return { circ, pasivo, origen, cap };
  };

  /* ---------- panel ---------- */
  const panel = {
    titulo: 'Tesorería de Utility Tokens',
    sub: () => `${UTL().length} tokens de servicio · ${fmt.compacto(totales().circ)} en circulación`,
    render() {
      const tt = totales();
      const alertas = UTL().flatMap((t) => T.saludUtility(t).alertas.map((a) => [t, a]));
      const pend = E().solicitudes.filter((s) => s.tipo === 'utility' && ['en_revision', 'objecion'].includes(s.estado));
      const ratioGlobal = tt.circ > 0 ? (tt.cap / tt.circ) * 100 : Infinity;
      return `
      <div class="grid g4">
        <div class="kpi acento"><div class="et">${ic('token')} Tokens en circulación</div>
          <div class="val num">${fmt.compacto(tt.circ)}</div>
          <div class="nota">Fuera de tesorería y sin quemar</div></div>
        <div class="kpi"><div class="et">${ic('engrane')} Capacidad comprometida</div>
          <div class="val num">${fmt.compacto(tt.cap)}</div>
          <div class="nota">Unidades de servicio contratadas</div></div>
        <div class="kpi"><div class="et">${ic('balanza')} Pasivo redimible</div>
          <div class="val num">${fmt.dineroCorto(tt.pasivo)}</div>
          <div class="nota">Lo que habría que honrar en efectivo</div></div>
        <div class="kpi ${tt.origen >= tt.pasivo ? 'bien' : 'mal'}"><div class="et">${ic('escudo2')} ORIGEN asignado</div>
          <div class="val num">${fmt.dineroCorto(tt.origen)}</div>
          <div class="nota">${tt.origen >= tt.pasivo ? 'Cubre el pasivo redimible' : 'Insuficiente: bloquea emisión'}</div></div>
      </div>

      ${pend.length ? `<div class="aviso warn mt16">${ic('reloj')}<div>
        <b>${pend.length} solicitud(es) ante la Autoridad ORIGEN</b>
        <span class="txt">${pend.map((s) => `${s.simbolo}: ${fmt.num(s.cantidad)} tokens · ${fmt.dineroCorto(s.origenRequerido)} de respaldo (${s.firmas.length}/${s.firmasRequeridas} firmas)`).join(' · ')}</span>
      </div></div>` : ''}
      ${alertas.map(([t, a]) => `<div class="aviso bad mt16">${ic('alerta')}<div><b>${esc(t.simbolo)}</b><span class="txt">${esc(a)}</span></div></div>`).join('')}

      <div class="titulo-sec">Tokens de servicio</div>
      <div class="grid g3">
        ${UTL().map((t) => {
          const s = T.saludUtility(t);
          const em = ESTADOS[t.estado] || ['', t.estado];
          return `<div class="card" data-abrir="${t.id}" style="cursor:pointer">
            <div class="cab"><h3>${esc(t.simbolo)}</h3>
              <div class="der"><span class="tag ${s.salud === 'ok' ? 'ok' : s.salud === 'warn' ? 'warn' : 'bad'}">${s.salud === 'ok' ? 'En regla' : s.salud === 'warn' ? 'Revisar' : 'Alerta'}</span>
              <span class="tag ${em[0]}">${esc(em[1])}</span></div></div>
            <div class="cuerpo">
              <div class="faint" style="font-size:12px;margin-bottom:12px">${esc(t.servicio)}</div>
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
                <div><div class="faint" style="font-size:10.5px;letter-spacing:.09em;text-transform:uppercase">Precio ancla</div>
                  <div class="num" style="font-size:22px;font-weight:650">${fmt.dinero(t.precioAncla)}</div></div>
                <div style="text-align:right"><div class="faint" style="font-size:10.5px;letter-spacing:.09em;text-transform:uppercase">Circulante</div>
                  <div class="num" style="font-size:15px;font-weight:600">${fmt.compacto(s.circulante)}</div></div>
              </div>
              <div class="barra" title="Capacidad de servicio frente al circulante">
                <i class="${s.ratioUtilidad >= 100 ? 'ok' : 'b'}" style="width:${Math.min(100, s.ratioUtilidad)}%"></i>
              </div>
              <div class="ts mt10">Cobertura de servicio ${Number.isFinite(s.ratioUtilidad) ? fmt.pct(s.ratioUtilidad, 1) : '∞'} · ${fmt.compacto(t.capacidad.comprometida)} ${esc(t.capacidad.unidad)}</div>
              <div class="linea" style="margin:13px 0"></div>
              <dl class="dl" style="font-size:12.5px">
                <dt>Redimible</dt><dd class="num">${fmt.pct(t.redimible * 100, 0)}</dd>
                <dt>Pasivo redimible</dt><dd class="num">${fmt.dineroCorto(s.pasivoRedimible)}</dd>
                <dt>ORIGEN asignado</dt><dd class="num ${s.origenOk ? 'ok-t' : 'bad-t'}">${fmt.dineroCorto(t.origenAsignado)}</dd>
              </dl>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="grid g-1-2 mt16">
        <div class="card"><div class="cab"><h3>Prueba de utilidad</h3></div>
          <div class="cuerpo" style="text-align:center">
            ${medidor(Math.min(ratioGlobal, 200), 'servicio', ratioGlobal >= 100 ? 'var(--ok)' : 'var(--bad)', 128)}
            <p class="ts mt10">Capacidad contratada frente a tokens en circulación. Bajo 100% habría tokens que el ecosistema no puede honrar.</p>
          </div></div>
        <div class="card"><div class="cab"><h3>Consumo real contra emisión</h3></div><div class="cuerpo">
          ${UTL().map((t) => {
            const s = T.saludUtility(t);
            const rot = s.circulante > 0 ? (t.consumo30d / s.circulante) * 100 : 0;
            return `<div style="margin-bottom:15px">
              <div style="display:flex;gap:8px;font-size:12.5px;margin-bottom:5px">
                <b>${esc(t.simbolo)}</b>
                <span class="faint">${fmt.compacto(t.consumo30d)} consumidos · ${fmt.compacto(t.quema30d)} quemados (30 d)</span>
                <span class="num" style="margin-left:auto">${fmt.pct(rot, 1)} de rotación</span></div>
              <div class="barra"><i class="a" style="width:${Math.min(100, rot)}%"></i></div>
            </div>`;
          }).join('')}
          <div class="aviso mt16">${ic('fuego')}<div><b>La rotación es la señal</b>
            <span class="txt">Si la gente no consume el token, emitir más solo diluye. La Autoridad ORIGEN pide métricas de consumo antes de autorizar cualquier emisión por demanda.</span></div></div>
        </div></div>
      </div>`;
    },
    alMontar(c) { alClic(c, 'data-abrir', (id) => { tokenAbierto = id; location.hash = 'tokens'; }); },
  };

  /* ---------- tokens / detalle ---------- */
  const tokens = {
    titulo: 'Tokens de servicio',
    sub: () => (tokenAbierto ? 'Expediente del token' : `${UTL().length} utility tokens`),
    render() {
      if (tokenAbierto) return detalle(T.buscar.utility(tokenAbierto));
      return `
      <div class="card"><div class="cab"><h3>Utility tokens del ecosistema</h3>
        <div class="der"><button class="btn pri chico" data-nuevo>${ic('mas')} Registrar token</button></div></div>
        <div class="cuerpo plano tabla-wrap"><table class="tabla">
          <thead><tr><th>Token</th><th>Servicio</th><th class="der">Ancla</th><th class="der">Circulante</th>
            <th class="der">Capacidad</th><th class="der">Cobertura</th><th class="der">ORIGEN</th><th>Estado</th><th></th></tr></thead>
          <tbody>${UTL().map((t) => {
            const s = T.saludUtility(t); const em = ESTADOS[t.estado] || ['', t.estado];
            return `<tr class="click" data-abrir="${t.id}">
              <td><b>${esc(t.simbolo)}</b><span class="t2">${esc(t.nombre)}</span></td>
              <td style="max-width:260px">${esc(t.servicio)}</td>
              <td class="der num">${fmt.dinero(t.precioAncla)}</td>
              <td class="der num">${fmt.num(s.circulante)}</td>
              <td class="der num">${fmt.num(t.capacidad.comprometida)}</td>
              <td class="der"><span class="tag ${s.ratioUtilidad >= 100 ? 'ok' : 'bad'}">${Number.isFinite(s.ratioUtilidad) ? fmt.pct(s.ratioUtilidad, 0) : '∞'}</span></td>
              <td class="der num">${fmt.dineroCorto(t.origenAsignado)}</td>
              <td><span class="tag ${em[0]}">${esc(em[1])}</span></td>
              <td class="der">${ic('flecha')}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`;
    },
    alMontar(c) {
      alClic(c, 'data-abrir', (id) => { tokenAbierto = id; render(); });
      alClic(c, 'data-volver', () => { tokenAbierto = null; render(); });
      const n = el('[data-nuevo]', c); if (n) n.addEventListener('click', nuevoToken);
      montarDetalle(c);
    },
  };

  function detalle(t) {
    if (!t) { tokenAbierto = null; return '<div class="vacio">Token no encontrado.</div>'; }
    const s = T.saludUtility(t);
    const em = ESTADOS[t.estado] || ['', t.estado];
    const cabecera = t.supply.autorizado - t.supply.emitido;
    const sols = T.buscar.solicitudesDe(t.id);
    return `
    <button class="btn chico fantasma" data-volver style="margin-bottom:14px">← Todos los tokens</button>

    <div class="card"><div class="cuerpo">
      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:260px">
          <div style="display:flex;align-items:center;gap:10px">
            <h2 style="font-size:24px;font-weight:660;letter-spacing:-.02em">${esc(t.simbolo)}</h2>
            <span class="tag ${em[0]}">${esc(em[1])}</span>
            <span class="tag plano">Utility</span>
          </div>
          <p class="muted" style="margin-top:6px">${esc(t.nombre)}</p>
          <p class="ts mt10">${esc(t.servicio)}</p>
          <div class="aviso acento mt16">${ic('engrane')}<div><b>Unidad de servicio</b>
            <span class="txt">${esc(t.unidadServicio)}</span></div></div>
        </div>
        <div style="text-align:right">
          <div class="faint" style="font-size:10.5px;letter-spacing:.09em;text-transform:uppercase">Precio ancla</div>
          <div class="num" style="font-size:32px;font-weight:660;letter-spacing:-.02em">${fmt.dinero(t.precioAncla)}</div>
          <div class="ts">anclado al costo del servicio · ${fmt.pct(t.redimible * 100, 0)} redimible</div>
        </div>
      </div>
      ${s.alertas.map((a) => `<div class="aviso bad mt16">${ic('alerta')}<div><span class="txt">${esc(a)}</span></div></div>`).join('')}
    </div></div>

    <div class="grid g4 mt16">
      <div class="kpi acento"><div class="et">Circulante</div><div class="val num">${fmt.compacto(s.circulante)}</div>
        <div class="nota">${fmt.num(t.supply.emitido)} emitidos − ${fmt.num(t.supply.quemado)} quemados − ${fmt.num(t.supply.enTesoreria)} en tesorería</div></div>
      <div class="kpi"><div class="et">Capacidad comprometida</div><div class="val num">${fmt.compacto(t.capacidad.comprometida)}</div>
        <div class="nota">${esc(t.capacidad.unidad)}</div></div>
      <div class="kpi ${s.ratioUtilidad >= 100 ? 'bien' : 'mal'}"><div class="et">Cobertura de servicio</div>
        <div class="val num">${Number.isFinite(s.ratioUtilidad) ? fmt.pct(s.ratioUtilidad, 1) : '∞'}</div>
        <div class="nota">${s.ratioUtilidad >= 100 ? 'Todo el circulante es honrable' : 'Hay tokens sin servicio detrás'}</div></div>
      <div class="kpi ${s.origenOk ? '' : 'mal'}"><div class="et">Pasivo redimible</div><div class="val num">${fmt.dineroCorto(s.pasivoRedimible)}</div>
        <div class="nota">ORIGEN asignado ${fmt.dineroCorto(t.origenAsignado)}</div></div>
    </div>

    <div class="grid g-2-1 mt16">
      <div class="card"><div class="cab"><h3>Supply</h3>
        <div class="der">
          ${cabecera > 0 ? `<button class="btn pri chico" data-emitir="${t.id}">${ic('mas')} Emitir ${fmt.num(cabecera)}</button>` : ''}
          <button class="btn chico" data-solicitar="${t.id}">${ic('doc')} Solicitar emisión</button>
          <button class="btn chico peligro" data-quemar="${t.id}">${ic('fuego')} Quemar</button>
        </div></div>
        <div class="cuerpo">
          <div class="barra" style="height:11px">
            <i class="ok" style="width:${(s.circulante / Math.max(t.supply.maximo, 1)) * 100}%"></i>
            <i class="a" style="width:${(t.supply.enTesoreria / Math.max(t.supply.maximo, 1)) * 100}%"></i>
            <i class="w" style="width:${(cabecera / Math.max(t.supply.maximo, 1)) * 100}%"></i>
          </div>
          <div class="leyenda">
            <b class="ok">Circulante ${fmt.num(s.circulante)}</b>
            <b class="a">Tesorería ${fmt.num(t.supply.enTesoreria)}</b>
            <b class="w">Cabecera ${fmt.num(cabecera)}</b>
            <b>Techo ${fmt.num(t.supply.maximo)}</b>
          </div>
          <div class="linea"></div>
          <dl class="dl">
            <dt>Techo por capacidad de servicio</dt><dd class="num">${fmt.num(t.capacidad.comprometida)} tokens</dd>
            <dt>Techo por ORIGEN asignado</dt><dd class="num">${fmt.num(Math.floor(t.origenAsignado / (t.precioAncla * t.redimible || 1)))} tokens</dd>
            <dt>Techo duro del token</dt><dd class="num">${fmt.num(t.supply.maximo)} tokens</dd>
            <dt>Autorizado por la Autoridad</dt><dd class="num">${fmt.num(t.supply.autorizado)}</dd>
            <dt>Quemados históricos</dt><dd class="num">${fmt.num(t.supply.quemado)}</dd>
          </dl>
          <div class="aviso acento mt16">${ic('candado')}<div><b>El límite que manda es el más bajo de los tres</b>
            <span class="txt">Aunque haya techo duro disponible, no se emite si no hay capacidad de servicio contratada ni ORIGEN que respalde la parte redimible.</span></div></div>
        </div>
      </div>

      <div>
        <div class="card"><div class="cab"><h3>Contrato de capacidad</h3>
          <div class="der"><button class="btn chico" data-capacidad="${t.id}">Ampliar</button></div></div>
          <div class="cuerpo"><dl class="dl">
            <dt>Proveedor</dt><dd style="text-align:right;max-width:180px">${esc(t.capacidad.proveedor)}</dd>
            <dt>Contrato</dt><dd class="mono">${esc(t.capacidad.contrato)}</dd>
            <dt>Comprometida</dt><dd class="num">${fmt.num(t.capacidad.comprometida)}</dd>
            <dt>Unidad</dt><dd>${esc(t.capacidad.unidad)}</dd>
            <dt>Vigencia</dt><dd class="${new Date(t.capacidad.vigencia) - Date.now() < 60 * 86400000 ? 'warn-t' : ''}">${fmt.fecha(t.capacidad.vigencia)}</dd>
          </dl></div>
        </div>

        <div class="card mt16"><div class="cab"><h3>Parámetros económicos</h3>
          <div class="der"><button class="btn chico" data-params="${t.id}">Ajustar</button></div></div>
          <div class="cuerpo"><dl class="dl">
            <dt>Precio ancla</dt><dd class="num">${fmt.dinero(t.precioAncla)}</dd>
            <dt>Porción redimible</dt><dd class="num">${fmt.pct(t.redimible * 100, 0)}</dd>
            <dt>Consumo 30 d</dt><dd class="num">${fmt.num(t.consumo30d)}</dd>
            <dt>Quema 30 d</dt><dd class="num">${fmt.num(t.quema30d)}</dd>
          </dl>
          <button class="btn chico mt16" data-consumo="${t.id}" style="width:100%;justify-content:center">Registrar consumo del periodo</button>
          </div>
        </div>
      </div>
    </div>

    <div class="grid g2 mt16">
      <div class="card"><div class="cab"><h3>Grifos — por dónde entran tokens</h3></div><div class="cuerpo">
        ${t.grifos.length ? t.grifos.map((g) => `<div style="display:flex;gap:9px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)">
          ${ic('mas')}<div style="flex:1"><b style="font-size:13px">${esc(g.nombre)}</b><span class="t2 faint">${esc(g.tasa)}</span></div></div>`).join('')
          : '<p class="faint" style="font-size:12.5px">Sin grifos definidos.</p>'}
      </div></div>
      <div class="card"><div class="cab"><h3>Sumideros — por dónde salen</h3></div><div class="cuerpo">
        ${t.sumideros.length ? t.sumideros.map((g) => `<div style="display:flex;gap:9px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)">
          ${ic('fuego')}<div style="flex:1"><b style="font-size:13px">${esc(g.nombre)}</b><span class="t2 faint">${esc(g.tasa)}</span></div></div>`).join('')
          : '<p class="faint" style="font-size:12.5px">Sin sumideros definidos.</p>'}
      </div></div>
    </div>

    <div class="grid g2 mt16">
      <div class="card"><div class="cab"><h3>Lotes con vesting</h3></div>
        <div class="cuerpo plano tabla-wrap">${t.vesting.length ? `<table class="tabla">
          <thead><tr><th>Lote</th><th class="der">Monto</th><th class="der">Liberado</th><th>Hasta</th></tr></thead>
          <tbody>${t.vesting.map((v) => `<tr>
            <td>${esc(v.lote)}</td><td class="der num">${fmt.num(v.monto)}</td>
            <td class="der num">${fmt.pct(v.liberado * 100, 0)}</td><td class="ts">${fmt.fecha(v.hasta)}</td>
          </tr>`).join('')}</tbody></table>` : `<div class="vacio">${ic('reloj')}<div>Sin lotes con vesting.</div></div>`}
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

  function montarDetalle(c) {
    alClic(c, 'data-emitir', (id) => ejecutarEmision(id));
    alClic(c, 'data-solicitar', (id) => nuevaSolicitud(id));
    alClic(c, 'data-quemar', (id) => quemarTokens(id));
    alClic(c, 'data-capacidad', (id) => ampliarCapacidad(id));
    alClic(c, 'data-params', (id) => ajustarParams(id));
    alClic(c, 'data-consumo', (id) => registrarConsumo(id));
  }

  /* ---------- acciones ---------- */

  function ejecutarEmision(id) {
    const t = T.buscar.utility(id);
    const cabecera = t.supply.autorizado - t.supply.emitido;
    const s = T.saludUtility(t);
    modal({
      titulo: `Emitir ${t.simbolo}`,
      cuerpo: `
        <div class="aviso ok" style="margin-bottom:16px">${ic('check')}<div><b>Emisión autorizada</b>
          <span class="txt">Hay ${fmt.num(cabecera)} tokens de cabecera autorizados por la Autoridad ORIGEN.</span></div></div>
        <div class="campo"><label>Tokens a emitir</label>
          <input type="number" id="q" value="${cabecera}" min="1" max="${cabecera}">
          <span class="ayuda">Entran a la tesorería del emisor; solo cuentan como circulante al distribuirse.</span></div>
        <dl class="dl">
          <dt>Capacidad disponible</dt><dd class="num">${fmt.num(Math.max(0, t.capacidad.comprometida - s.circulante))}</dd>
          <dt>Cobertura tras emitir</dt><dd class="num" id="cob">—</dd>
        </dl>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Emitir</button>`,
      alAbrir(f) {
        const q = el('#q', f);
        const calc = () => {
          const nuevo = s.circulante + Number(q.value || 0);
          el('#cob', f).textContent = nuevo > 0 ? fmt.pct((t.capacidad.comprometida / nuevo) * 100, 1) : '∞';
        };
        q.addEventListener('input', calc); calc();
        el('[data-ok]', f).addEventListener('click', async () => {
          const v = Number(q.value);
          if (await T.correr('token.emitir', { tokenId: id, cantidad: v }, 'Tokens emitidos', `${fmt.num(v)} ${t.simbolo}`)) cerrarModal();
        });
      },
    });
  }

  function nuevaSolicitud(id) {
    const t = T.buscar.utility(id);
    const r = T.respaldo();
    const s = T.saludUtility(t);
    const causas = T.CAUSAS.utility;
    modal({
      ancho: true,
      titulo: `Solicitar emisión de ${t.simbolo} ante la Autoridad ORIGEN`,
      cuerpo: `
        <div class="pasos">
          <div class="p on"><b>Paso 1</b>Causa y capacidad</div>
          <div class="p"><b>Paso 2</b>Dictamen de la Autoridad</div>
          <div class="p"><b>Paso 3</b>Firmas del Consejo</div>
        </div>
        <div class="aviso acento" style="margin-bottom:18px">${ic('engrane')}<div>
          <b>Un utility token no se emite por precio, se emite por uso</b>
          <span class="txt">La Autoridad revisa que exista capacidad de servicio contratada para honrar los tokens nuevos y ORIGEN libre para la parte redimible. Hoy hay ${fmt.dineroCorto(r.libre)} de ORIGEN libre.</span></div></div>
        <div class="campo"><label>Causa de la emisión</label>
          <select id="causa">${causas.map((c) => `<option value="${c.v}">${esc(c.t)}</option>`).join('')}</select>
          <span class="ayuda" id="pide">${esc(causas[0].pide)}</span></div>
        <div class="fila t3">
          <div class="campo"><label>Tokens a emitir</label><input type="number" id="q" min="1" step="1000" placeholder="0"></div>
          <div class="campo"><label>Precio ancla</label><input type="number" id="p" value="${t.precioAncla}" step="0.01" readonly></div>
          <div class="campo"><label>Capacidad nueva</label><input type="number" id="cap" min="0" step="1000" value="0">
            <span class="ayuda">Unidades de servicio que suma el contrato.</span></div>
        </div>
        <div class="campo"><label>Justificación</label>
          <textarea id="m" placeholder="Qué contrato de capacidad respalda la emisión, o qué consumo comprobado la exige."></textarea></div>
        <div class="campo"><label>Evidencia documental</label><input id="ev" placeholder="Contrato de capacidad, métricas de consumo…"></div>
        <div class="card" style="box-shadow:none"><div class="cuerpo">
          <dl class="dl">
            <dt>ORIGEN requerido</dt><dd class="num ac-t" id="req">$0.00</dd>
            <dt>Circulante actual</dt><dd class="num">${fmt.num(s.circulante)}</dd>
            <dt>Cobertura de servicio resultante</dt><dd class="num" id="cob">${Number.isFinite(s.ratioUtilidad) ? fmt.pct(s.ratioUtilidad, 1) : '∞'}</dd>
          </dl>
          <div id="dict" class="mt16"></div>
        </div></div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Enviar a la Autoridad</button>`,
      alAbrir(f) {
        const q = el('#q', f), p = el('#p', f), cap = el('#cap', f), causa = el('#causa', f);
        function recalcular() {
          const cant = Number(q.value) || 0;
          const req = cant * (Number(p.value) || 0) * t.redimible;
          el('#req', f).textContent = fmt.dinero(req);
          const circNuevo = s.circulante + cant;
          const capNueva = t.capacidad.comprometida + (Number(cap.value) || 0);
          const cob = circNuevo > 0 ? (capNueva / circNuevo) * 100 : Infinity;
          el('#cob', f).textContent = Number.isFinite(cob) ? fmt.pct(cob, 1) : '∞';
          const ch = T.puedeEmitir(req);
          const problemas = ch.faltas.slice();
          if (cob < 100) problemas.push(`La cobertura de servicio quedaría en ${fmt.pct(cob, 1)}: habría tokens que el ecosistema no puede honrar.`);
          if (circNuevo + t.supply.enTesoreria > t.supply.maximo) problemas.push(`Se superaría el techo duro de ${fmt.num(t.supply.maximo)} tokens.`);
          el('#dict', f).innerHTML = cant <= 0 ? '' : `<div class="aviso ${problemas.length ? 'bad' : 'ok'}">${ic(problemas.length ? 'alerta' : 'check')}
            <div><b>${problemas.length ? 'La Autoridad rechazaría esta solicitud' : 'La solicitud cumple los requisitos'}</b>
            <span class="txt">${problemas.length ? esc(problemas.join(' ')) : 'Pasará a la cola para firmas del Consejo.'}</span></div></div>`;
        }
        [q, p, cap].forEach((x) => x.addEventListener('input', recalcular));
        causa.addEventListener('change', () => { el('#pide', f).textContent = (causas.find((c) => c.v === causa.value) || {}).pide || ''; });
        el('[data-ok]', f).addEventListener('click', async () => {
          const evn = el('#ev', f).value.trim();
          const capNueva = Number(cap.value) || 0;
          const r = await T.correr('solicitud.crear', {
            tokenId: t.id, cantidad: Number(q.value), precio: Number(p.value), causa: causa.value,
            motivo: el('#m', f).value.trim() + (capNueva ? ` Capacidad adicional contratada: ${fmt.num(capNueva)} ${t.capacidad.unidad}.` : ''),
            capacidadNueva: capNueva || undefined,
            evidencias: evn ? [{ nombre: evn, tipo: 'Adjunto del solicitante' }] : [],
          }, 'Solicitud enviada', 'Está en la cola de la Autoridad ORIGEN');
          if (r) cerrarModal();
        });
      },
    });
  }

  function quemarTokens(id) {
    const t = T.buscar.utility(id);
    const s = T.saludUtility(t);
    modal({
      titulo: `Quemar ${t.simbolo}`,
      cuerpo: `
        <div class="aviso warn" style="margin-bottom:16px">${ic('fuego')}<div><b>Quemar libera respaldo</b>
          <span class="txt">Al quemar, la parte proporcional del ORIGEN asignado vuelve al pozo libre de la Autoridad y queda disponible para otras emisiones.</span></div></div>
        <div class="campo"><label>Tokens a quemar</label><input type="number" id="q" min="1" max="${s.circulante + t.supply.enTesoreria}" placeholder="0">
          <span class="ayuda">Máximo ${fmt.num(s.circulante + t.supply.enTesoreria)} entre circulante y tesorería.</span></div>
        <div class="campo mb0"><label>Motivo</label>
          <select id="m">
            <option>Consumo del servicio (quema automática)</option>
            <option>Recompra en mercado</option>
            <option>Retiro de capacidad de servicio</option>
            <option>Corrección auditada</option>
          </select></div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn peligro" data-ok>Quemar</button>`,
      alAbrir(f) {
        el('[data-ok]', f).addEventListener('click', async () => {
          const r = await T.correr('token.quemar', { tokenId: id, cantidad: Number(el('#q', f).value), motivo: el('#m', f).value }, 'Tokens quemados', undefined, 'warn');
          if (r) cerrarModal();
        });
      },
    });
  }

  function ampliarCapacidad(id) {
    const t = T.buscar.utility(id);
    modal({
      titulo: `Capacidad de servicio · ${t.simbolo}`,
      cuerpo: `
        <p class="muted" style="font-size:13px;margin-bottom:16px">La capacidad es la promesa que el ecosistema puede cumplir. Sin ella, un token en circulación es una deuda sin forma de pagarse.</p>
        <div class="fila">
          <div class="campo"><label>Capacidad comprometida (${esc(t.capacidad.unidad)})</label>
            <input type="number" id="c" value="${t.capacidad.comprometida}" min="0" step="1000"></div>
          <div class="campo"><label>Vigencia</label><input type="date" id="v" value="${new Date(t.capacidad.vigencia).toISOString().slice(0, 10)}"></div>
        </div>
        <div class="fila">
          <div class="campo"><label>Proveedor</label><input id="p" value="${esc(t.capacidad.proveedor)}"></div>
          <div class="campo"><label>Contrato</label><input id="k" value="${esc(t.capacidad.contrato)}"></div>
        </div>
        <div class="campo mb0"><label>Unidad de servicio</label><input id="u" value="${esc(t.capacidad.unidad)}"></div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Guardar</button>`,
      alAbrir(f) {
        el('[data-ok]', f).addEventListener('click', async () => {
          const r = await T.correr('capacidad.actualizar', {
            tokenId: id, comprometida: Number(el('#c', f).value), proveedor: el('#p', f).value.trim(), contrato: el('#k', f).value.trim(),
            unidad: el('#u', f).value.trim(), vigencia: el('#v', f).value || undefined,
          }, 'Capacidad actualizada', '');
          if (r) cerrarModal();
        });
      },
    });
  }

  function ajustarParams(id) {
    const t = T.buscar.utility(id);
    modal({
      titulo: `Parámetros económicos · ${t.simbolo}`,
      cuerpo: `
        <div class="fila">
          <div class="campo"><label>Precio ancla (USD)</label><input type="number" id="p" value="${t.precioAncla}" step="0.01" min="0">
            <span class="ayuda">Anclado al costo real de prestar una unidad de servicio.</span></div>
          <div class="campo"><label>Porción redimible %</label><input type="number" id="r" value="${t.redimible * 100}" min="0" max="100" step="1">
            <span class="ayuda">Cuánto del token puede cambiarse por efectivo. Solo esa parte consume ORIGEN.</span></div>
        </div>
        <div class="campo mb0"><label>Unidad de servicio (texto)</label><input id="u" value="${esc(t.unidadServicio)}"></div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Guardar</button>`,
      alAbrir(f) {
        el('[data-ok]', f).addEventListener('click', async () => {
          const r = await T.correr('utility.parametros', { tokenId: id, precioAncla: Number(el('#p', f).value), redimible: Number(el('#r', f).value) / 100, unidadServicio: el('#u', f).value.trim() }, 'Parámetros actualizados', '');
          if (r) cerrarModal();
        });
      },
    });
  }

  function registrarConsumo(id) {
    const t = T.buscar.utility(id);
    modal({
      titulo: `Consumo del periodo · ${t.simbolo}`,
      cuerpo: `
        <p class="muted" style="font-size:13px;margin-bottom:14px">La telemetría del servicio alimenta la prueba de utilidad. La Autoridad ORIGEN la exige antes de autorizar emisión por demanda.</p>
        <div class="fila">
          <div class="campo"><label>Tokens consumidos (30 d)</label><input type="number" id="c" value="${t.consumo30d}" min="0"></div>
          <div class="campo"><label>Tokens quemados (30 d)</label><input type="number" id="q" value="${t.quema30d}" min="0"></div>
        </div>
        <label class="check"><input type="checkbox" id="ap" checked>
          <span><b>Aplicar la quema al supply</b><span>Descuenta los tokens quemados del circulante y libera el ORIGEN proporcional.</span></span></label>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Registrar</button>`,
      alAbrir(f) {
        el('[data-ok]', f).addEventListener('click', async () => {
          const r = await T.correr('utility.telemetria', { tokenId: id, consumo30d: Number(el('#c', f).value), quema30d: Number(el('#q', f).value), aplicar: el('#ap', f).checked }, 'Telemetría registrada', '');
          if (r) cerrarModal();
        });
      },
    });
  }

  function nuevoToken() {
    modal({
      ancho: true,
      titulo: 'Registrar un utility token',
      cuerpo: `
        <div class="aviso acento" style="margin-bottom:18px">${ic('alerta')}<div><b>Un utility token no es una inversión</b>
          <span class="txt">No da propiedad, ni dividendo, ni expectativa de ganancia. Si la da, es un security token y va en la otra tesorería.</span></div></div>
        <div class="fila">
          <div class="campo"><label>Símbolo</label><input id="s" placeholder="VETA" maxlength="8"></div>
          <div class="campo"><label>Nombre</label><input id="n" placeholder="Veta Wallet Credits"></div>
        </div>
        <div class="campo"><label>Servicio que paga</label><input id="sv" placeholder="Veta Wallet — comisiones de red y envíos"></div>
        <div class="campo"><label>Unidad de servicio</label><input id="us" placeholder="1 VETA = 1 transferencia interna con prioridad">
          <span class="ayuda">Debe ser medible. Si no se puede medir, no se puede probar la utilidad.</span></div>
        <div class="fila t3">
          <div class="campo"><label>Precio ancla (USD)</label><input type="number" id="p" step="0.01" min="0" placeholder="0.00"></div>
          <div class="campo"><label>Redimible %</label><input type="number" id="r" value="0" min="0" max="100"></div>
          <div class="campo"><label>Techo duro</label><input type="number" id="mx" min="0" step="1000" placeholder="0"></div>
        </div>
        <div class="fila">
          <div class="campo"><label>Capacidad inicial comprometida</label><input type="number" id="cp" min="0" step="1000" value="0"></div>
          <div class="campo"><label>Unidad de capacidad</label><input id="cu" placeholder="transferencias, consultas, liquidaciones…"></div>
        </div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" data-ok>Registrar token</button>`,
      alAbrir(f) {
        el('[data-ok]', f).addEventListener('click', async () => {
          const r = await T.correr('utility.registrar', {
            simbolo: el('#s', f).value.trim(), nombre: el('#n', f).value.trim(), servicio: el('#sv', f).value.trim(), unidadServicio: el('#us', f).value.trim(),
            precioAncla: Number(el('#p', f).value), redimible: Number(el('#r', f).value) / 100, maximo: Number(el('#mx', f).value),
            capacidad: Number(el('#cp', f).value), unidadCapacidad: el('#cu', f).value.trim(),
          }, 'Token registrado', 'Ahora solicita la autorización a ORIGEN');
          if (r) { cerrarModal(); tokenAbierto = r.resultado.creado; render(); }
        });
      },
    });
  }

  /* ---------- vista: capacidad ---------- */
  const capacidad = {
    titulo: 'Prueba de utilidad',
    sub: 'Capacidad de servicio contratada contra tokens vivos',
    render() {
      const tt = totales();
      return `
      <div class="aviso ${tt.cap >= tt.circ ? 'ok' : 'bad'}">${ic(tt.cap >= tt.circ ? 'check' : 'alerta')}<div>
        <b>${tt.cap >= tt.circ ? 'Todo el circulante tiene servicio detrás' : 'Hay circulante sin capacidad que lo honre'}</b>
        <span class="txt">Capacidad contratada ${fmt.num(tt.cap)} frente a ${fmt.num(tt.circ)} tokens en circulación.</span></div></div>

      <div class="card mt16"><div class="cuerpo plano tabla-wrap"><table class="tabla">
        <thead><tr><th>Token</th><th>Proveedor / contrato</th><th class="der">Capacidad</th><th class="der">Circulante</th>
          <th class="der">Cobertura</th><th>Vigencia</th><th></th></tr></thead>
        <tbody>${UTL().map((t) => {
          const s = T.saludUtility(t);
          const porVencer = new Date(t.capacidad.vigencia) - Date.now() < 60 * 86400000;
          return `<tr>
            <td><b>${esc(t.simbolo)}</b><span class="t2">${esc(t.capacidad.unidad)}</span></td>
            <td>${esc(t.capacidad.proveedor)}<span class="t2 mono">${esc(t.capacidad.contrato)}</span></td>
            <td class="der num">${fmt.num(t.capacidad.comprometida)}</td>
            <td class="der num">${fmt.num(s.circulante)}</td>
            <td class="der"><span class="tag ${s.ratioUtilidad >= 100 ? 'ok' : 'bad'}">${Number.isFinite(s.ratioUtilidad) ? fmt.pct(s.ratioUtilidad, 1) : '∞'}</span></td>
            <td class="${porVencer ? 'warn-t' : ''}">${fmt.fecha(t.capacidad.vigencia)}<span class="t2">${fmt.relativo(t.capacidad.vigencia)}</span></td>
            <td class="der"><button class="btn chico" data-capacidad="${t.id}">Ampliar</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div></div>

      <div class="grid g2 mt16">
        <div class="card"><div class="cab"><h3>Qué separa a un utility de un security</h3></div><div class="cuerpo">
          <div class="tabla-wrap"><table class="tabla">
            <thead><tr><th></th><th>Utility</th><th>Security</th></tr></thead>
            <tbody>
              <tr><td class="faint">Qué entrega</td><td>Acceso a un servicio</td><td>Derecho patrimonial</td></tr>
              <tr><td class="faint">Precio</td><td>Anclado al costo del servicio</td><td>Valuación independiente certificada</td></tr>
              <tr><td class="faint">Por qué se emite</td><td>Hay capacidad y consumo</td><td>Hay activo certificado</td></tr>
              <tr><td class="faint">Rendimiento</td><td>Ninguno</td><td>Dividendo o participación</td></tr>
              <tr><td class="faint">Secundario</td><td>Libre entre usuarios</td><td>Ventanas, banda y acreditados</td></tr>
              <tr><td class="faint">Respaldo ORIGEN</td><td>Solo la parte redimible</td><td>El total del valor emitido</td></tr>
            </tbody></table></div>
        </div></div>
        <div class="card"><div class="cab"><h3>Regla de oro</h3></div><div class="cuerpo">
          <div class="aviso acento" style="margin-bottom:9px">${ic('escudo2')}<div><b>Ningún token sin respaldo</b>
            <span class="txt">Aquí el respaldo es doble: capacidad de servicio para el uso y ORIGEN para la parte redimible. Si falta cualquiera de los dos, la Autoridad niega la emisión.</span></div></div>
          <div class="aviso" style="margin-bottom:9px">${ic('fuego')}<div><b>Lo consumido se quema</b>
            <span class="txt">Cuando el servicio se presta, el token desaparece y libera su respaldo. Eso mantiene el circulante pegado al uso real.</span></div></div>
          <div class="aviso">${ic('reloj')}<div><b>Capacidad con vencimiento</b>
            <span class="txt">Si un contrato de capacidad vence sin renovarse, la cobertura cae y el sistema bloquea nuevas emisiones de ese token.</span></div></div>
        </div></div>
      </div>`;
    },
    alMontar(c) { alClic(c, 'data-capacidad', (id) => ampliarCapacidad(id)); },
  };

  /* ---------- vista: economía ---------- */
  const economia = {
    titulo: 'Economía del token',
    sub: 'Grifos, sumideros y rotación real',
    render() {
      return `
      ${UTL().map((t) => {
        const s = T.saludUtility(t);
        const rot = s.circulante > 0 ? (t.consumo30d / s.circulante) * 100 : 0;
        const neto = t.consumo30d - t.quema30d;
        return `<div class="card" style="margin-bottom:16px"><div class="cab">
          <h3>${esc(t.simbolo)} — ${esc(t.nombre)}</h3>
          <div class="der">
            <button class="btn chico" data-consumo="${t.id}">Telemetría</button>
            <button class="btn chico" data-params="${t.id}">Parámetros</button>
            <button class="btn chico peligro" data-quemar="${t.id}">Quemar</button>
          </div></div>
          <div class="cuerpo">
            <div class="grid g4" style="margin-bottom:16px">
              <div class="kpi"><div class="et">Rotación 30 d</div><div class="val num">${fmt.pct(rot, 1)}</div>
                <div class="nota">Consumo sobre circulante</div></div>
              <div class="kpi"><div class="et">Quemados 30 d</div><div class="val num">${fmt.compacto(t.quema30d)}</div>
                <div class="nota">${fmt.dineroCorto(t.quema30d * t.precioAncla)} de servicio prestado</div></div>
              <div class="kpi"><div class="et">Circulante neto</div><div class="val num">${fmt.compacto(s.circulante)}</div>
                <div class="nota">${neto >= 0 ? 'Consumo por encima de la quema' : 'Quema por encima del consumo'}</div></div>
              <div class="kpi"><div class="et">Valor del circulante</div><div class="val num">${fmt.dineroCorto(s.circulante * t.precioAncla)}</div>
                <div class="nota">${fmt.pct(t.redimible * 100, 0)} redimible</div></div>
            </div>
            <div class="grid g2">
              <div><div class="titulo-sec" style="margin-top:0">Grifos</div>
                ${t.grifos.length ? t.grifos.map((g) => `<div style="font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--line)">
                  <b>${esc(g.nombre)}</b><span class="t2 faint">${esc(g.tasa)}</span></div>`).join('')
                  : '<p class="faint" style="font-size:12.5px">Sin grifos.</p>'}</div>
              <div><div class="titulo-sec" style="margin-top:0">Sumideros</div>
                ${t.sumideros.length ? t.sumideros.map((g) => `<div style="font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--line)">
                  <b>${esc(g.nombre)}</b><span class="t2 faint">${esc(g.tasa)}</span></div>`).join('')
                  : '<p class="faint" style="font-size:12.5px">Sin sumideros.</p>'}</div>
            </div>
          </div>
        </div>`;
      }).join('')}
      <div class="aviso acento">${ic('balanza')}<div><b>Equilibrio, no especulación</b>
        <span class="txt">Un utility sano tiene sumideros tan fuertes como sus grifos. Si el circulante crece mientras la rotación cae, el token se está usando como apuesta y no como servicio: ahí la Autoridad congela la emisión.</span></div></div>`;
    },
    alMontar(c) { montarDetalle(c); },
  };

  /* ---------- vista: bitácora ---------- */
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
    montaje: '#app', marca: 'Tesorería', sub: 'Utility tokens', acento: 'utility',
    inicio: 'panel',
    secciones: [
      { grupo: 'Tesorería', items: [
        { v: 'panel', t: 'Panel', ic: 'panel' },
        { v: 'tokens', t: 'Tokens', ic: 'token' },
        { v: 'economia', t: 'Economía', ic: 'grafico' },
      ] },
      { grupo: 'Respaldo', items: [
        { v: 'capacidad', t: 'Prueba de utilidad', ic: 'escudo2' },
        { v: 'libro', t: 'Bitácora', ic: 'libro' },
      ] },
    ],
    vistas: { panel, tokens, economia, capacidad, libro },
    tour: () => [
      { vista: 'panel', titulo: 'Tesorería de Utility Tokens', texto: 'VETA, OGS y MTP pagan un servicio. No dan propiedad ni rendimiento, y solo circulan mientras exista capacidad contratada que los honre.' },
      { sel: '.grid.g4', titulo: 'Capacidad contra circulante', texto: 'La <b>capacidad comprometida</b> es la promesa que el ecosistema puede cumplir. El <b>pasivo redimible</b> es la parte que se puede cambiar por efectivo, y solo esa consume ORIGEN.', pos: 'abajo' },
      { sel: '.medidor', titulo: 'Prueba de utilidad', texto: 'Capacidad entre circulante. Bajo 100 % hay tokens que nadie puede honrar: la Autoridad bloquea emisión y hay que ampliar capacidad o quemar.', pos: 'derecha' },
      { sel: '[data-vista="economia"]', titulo: 'Grifos y sumideros', texto: 'Por dónde entran tokens y por dónde salen. Lo consumido se quema y libera respaldo. Si la rotación cae, el token se está usando como apuesta.', pos: 'derecha' },
      { sel: '[data-guia]', titulo: 'Volver a ver esto', texto: 'Repite el recorrido cuando quieras. La explicación completa con simulador está en <b>Cómo funciona</b>.', pos: 'izquierda' },
    ],
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('[data-vista]')) tokenAbierto = null;
  }, true);
})();

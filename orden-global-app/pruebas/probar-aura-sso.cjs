// ═══ LA VUELTA A AU-RA ═══════════════════════════════════════════════════
// node pruebas/probar-aura-sso.cjs
//
// src/auraSso.js no tiene imports a propósito: aquí se lee, se le quitan los
// `export` y se evalúa tal cual — las MISMAS reglas que corren en el teléfono.
//
// Lo que se exige (el contrato con AU-RA):
//   · `vuelta` de una lista cerrada, comparada ENTERA; lo demás (o nada: las
//     APK viejas) vuelve a `ultronfp://sso`. Sin redirección abierta.
//   · cada negativa del puente con SU código: sin-gid, gid-pendiente,
//     no-vinculada, correo-sin-confirmar, limite, red, fallo. Antes todo 403
//     era «sin-gid».
//   · sin Genesis ID se ofrece sacarlo; en revisión se vuelve con
//     `gid-pendiente`; el pedido guardado vence en media hora.
//   · y que la pantalla y la del trámite usen de verdad estas reglas.
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');
const fuente = leer('src/auraSso.js');
if (/^import /m.test(fuente)) throw new Error('src/auraSso.js tiene que seguir sin imports');
const m = new Function(fuente.replace(/^export /gm, '') + `
return { VUELTAS_AURA, AURA_VIVE_MS, vueltaDe, pedidoValido, enlaceDeVuelta, codigoAura,
  gidEmpezado, trasSinGid, pedidoParaGuardar, pedidoGuardadoVivo, alTerminarAlta };`)();

let pasan = 0;
const fallos = [];
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { pasan += 1; return; }
  fallos.push(nombre + (detalle ? `  (${detalle})` : ''));
};
const q = (url) => Object.fromEntries(new URLSearchParams(String(url).split('?')[1] || ''));

// ── 1. la vuelta ──────────────────────────────────────────────────────────
prueba('la lista es exactamente la del contrato',
  JSON.stringify(m.VUELTAS_AURA) === JSON.stringify(['ultronfp://sso', 'https://aura-fp.onrender.com/sso']));
prueba('sin vuelta (APK vieja) → ultronfp://sso', m.vueltaDe(undefined) === 'ultronfp://sso' && m.vueltaDe('') === 'ultronfp://sso');
prueba('la web de AU-RA vale', m.vueltaDe('https://aura-fp.onrender.com/sso') === 'https://aura-fp.onrender.com/sso');
for (const mala of [
  'https://malo.example/robar', 'https://aura-fp.onrender.com/otra', 'https://aura-fp.onrender.com/sso/',
  'https://aura-fp.onrender.com/sso.malo.example', 'http://aura-fp.onrender.com/sso', 'ultronfp://sso/../x',
  'javascript:alert(1)', 'ULTRONFP://SSO', ' ultronfp://sso', 'ultronfp://sso?pase=robado',
]) {
  prueba(`«${mala}» se ignora → ultronfp://sso`, m.vueltaDe(mala) === 'ultronfp://sso');
}
const RETO = 'r'.repeat(43);
{
  const u = m.enlaceDeVuelta({ pase: 'P.A.SE', estado: 'estado-1234', vuelta: 'https://aura-fp.onrender.com/sso' });
  prueba('con pase: pase y eco del estado, en la web de AU-RA',
    u.startsWith('https://aura-fp.onrender.com/sso?') && q(u).pase === 'P.A.SE' && q(u).estado === 'estado-1234' && !('error' in q(u)), u);
  const e = m.enlaceDeVuelta({ error: 'gid-pendiente', estado: 'estado-1234', vuelta: 'https://malo.example' });
  prueba('con error: error y estado, y una vuelta ajena no se sigue',
    e === 'ultronfp://sso?error=gid-pendiente&estado=estado-1234', e);
}
prueba('el pedido de AU-RA se valida (reto de 43, estado 8-64)',
  m.pedidoValido({ reto: RETO, estado: 'estado-1234' }) && !m.pedidoValido({ reto: 'corto', estado: 'estado-1234' })
    && !m.pedidoValido({ reto: RETO, estado: 'x' }));

// ── 2. los códigos ────────────────────────────────────────────────────────
const CASOS = [
  [{ estado: 403, codigo: 'CORREO_NO_VERIFICADO' }, 'correo-sin-confirmar'],
  [{ estado: 403, codigo: 'GID_SIN_IDENTIDAD' }, 'sin-gid'],
  [{ estado: 403, codigo: 'GID_PENDIENTE' }, 'gid-pendiente'],
  [{ estado: 403, codigo: 'CUENTA_NO_VINCULADA' }, 'no-vinculada'],
  [{ estado: 429, codigo: 'LIMITE' }, 'limite'],
  [{ estado: 429 }, 'limite'],
  [{ estado: 504, codigo: 'GENESIS_RED' }, 'red'],
  [{ estado: 500, code: 'servidor' }, 'red'],
  [{ code: 'red' }, 'red'],
  [{ code: 'timeout' }, 'red'],
  [{ estado: 403, codigo: 'GID_NO_DISPONIBLE' }, 'fallo'],
  [{ estado: 403, codigo: 'SESION_GID_AJENO' }, 'fallo'],
  [{ estado: 400, error: 'Destino del pase inválido' }, 'fallo'],
  // Un backend de antes de los códigos: la frase, y lo que se sabe del trámite.
  [{ estado: 403, error: 'Esa cuenta no está atada a este GID en esta aplicación' }, 'no-vinculada'],
  [{ estado: 403, error: 'Todavía no hay una identidad verificada' }, 'sin-gid', null],
  [{ estado: 403, error: 'Todavía no hay una identidad verificada' }, 'sin-gid', { estado: 'iniciada' }],
  [{ estado: 403, error: 'Todavía no hay una identidad verificada' }, 'gid-pendiente', { estado: 'en-revision', verificada: false }],
];
for (const [r, esperado, gid] of CASOS) {
  prueba(`${JSON.stringify(r)} → ${esperado}`, m.codigoAura(r, gid) === esperado, m.codigoAura(r, gid));
}

// ── 3. sin Genesis ID ─────────────────────────────────────────────────────
prueba('sin identidad → ofrecer sacarlo', m.trasSinGid(null, 'sin-gid').hacer === 'alta' && !m.trasSinGid(null, 'sin-gid').aMedias);
prueba('iniciada vacía → ofrecer sacarlo (no «a medias»)', m.trasSinGid({ estado: 'iniciada', paso: 'datos' }, 'sin-gid').aMedias === false);
prueba('a medias → ofrecer TERMINARLO', m.trasSinGid({ estado: 'datos', paso: 'documento' }, 'gid-pendiente').aMedias === true);
prueba('en revisión → volver con gid-pendiente, sin otro trámite',
  JSON.stringify(m.trasSinGid({ estado: 'en-revision', paso: 'revision' }, 'sin-gid')) === JSON.stringify({ hacer: 'volver', error: 'gid-pendiente' }));
prueba('rechazada o suspendida → volver con fallo (sin contarle a AU-RA cuál)',
  m.trasSinGid({ paso: 'rechazada' }, 'gid-pendiente').error === 'fallo' && m.trasSinGid({ paso: 'suspendida' }, 'gid-pendiente').error === 'fallo');
prueba('al terminar: verificado → permiso; en revisión → volver; a medias → nada',
  m.alTerminarAlta('listo') === 'permiso' && m.alTerminarAlta('revision') === 'volver'
    && m.alTerminarAlta('documento') === null && m.alTerminarAlta('rostro') === null && m.alTerminarAlta('cargando') === null);

// ── 4. el pedido guardado ─────────────────────────────────────────────────
{
  const ahora = 1_000_000;
  const g = m.pedidoParaGuardar({ reto: RETO, estado: 'estado-1234', vuelta: 'https://malo.example', fase: 'alta', extra: 'no' }, ahora);
  prueba('se guarda lo justo, con la vuelta ya saneada y media hora de plazo',
    JSON.stringify(Object.keys(g).sort()) === JSON.stringify(['estado', 'fase', 'hasta', 'reto', 'vuelta'])
      && g.vuelta === 'ultronfp://sso' && g.hasta === ahora + 30 * 60 * 1000, JSON.stringify(g));
  prueba('vivo dentro del plazo', m.pedidoGuardadoVivo(g, ahora + 29 * 60 * 1000)?.fase === 'alta');
  prueba('vencido no revive', m.pedidoGuardadoVivo(g, ahora + 30 * 60 * 1000) === null);
  prueba('uno sin forma no revive', m.pedidoGuardadoVivo({ ...g, reto: 'x' }, ahora) === null && m.pedidoGuardadoVivo(null, ahora) === null);
}

// ── 5. las pantallas usan estas reglas ────────────────────────────────────
const pantalla = leer('src/screens/PaseAura.js');
const tramite = leer('src/screens/Onboard.js');
const app = leer('App.js');
prueba('PaseAura toma las reglas de src/auraSso.js', /from '\.\.\/auraSso'/.test(pantalla));
prueba('PaseAura ya no escribe la vuelta a mano', !/const VUELTA = 'ultronfp:\/\/sso'/.test(pantalla));
prueba('PaseAura ya no manda «sin-gid» para todo', !/volver\(\{ error: 'sin-gid' \}\)/.test(pantalla));
prueba('PaseAura pide el pase para aura y pulse2chat, con el reto', /aud: \['aura', 'pulse2chat'\], reto: pedido\.reto/.test(pantalla));
prueba('el enlace pasa `vuelta` a la pantalla', /vuelta: p\.vuelta/.test(app));
prueba('el trámite pinta el aviso de AU-RA y decide con alTerminarAlta',
  /<AvisoAura /.test(tramite) && /alTerminarAlta\(paso\)/.test(tramite));
prueba('el trámite no manda al pasaporte si AU-RA espera', /paso !== 'listo' \|\| pedidoAura/.test(tramite));

console.log(`\nLa vuelta a AU-RA: ${pasan} pasan · ${fallos.length} fallan`);
for (const f of fallos) console.log('  ✗ ' + f);
process.exit(fallos.length ? 1 : 0);

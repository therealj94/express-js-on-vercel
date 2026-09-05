'use client';
// EL CROMO: poco, pero denso. Arriba a la izquierda, la casa y qué cerebro
// piensa. Arriba a la derecha, la hora y un riel de telemetría con lo vivo:
// ORIGEN, onza, bloques, USDT, pendientes, nodo, voz. Ni hamburguesa ni
// engranaje: el menú sale con un toque largo sobre el núcleo del ser, o con
// el botón de voz. Y la puerta, cuando no hay sesión: un vidrio en el vacío.
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useOs } from '@/lib/os-store';
import { os } from './VoiceOrbInput';

function Reloj() {
  const [hora, setHora] = useState('');
  useEffect(() => {
    const tic = () => setHora(new Date().toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Tegucigalpa' }));
    tic(); const id = setInterval(tic, 10_000); return () => clearInterval(id);
  }, []);
  return <span className="font-mono tabular-nums text-hielo/90">{hora}</span>;
}

function Puerta() {
  const [correo, setCorreo] = useState(''); const [clave, setClave] = useState(''); const [error, setError] = useState(''); const [ocupado, setOcupado] = useState(false);
  const entrar = async (e: React.FormEvent) => {
    e.preventDefault(); setOcupado(true); setError('');
    try { await api.entrar(correo.trim(), clave); useOs.getState().setNecesitaEntrar(false); void os.iniciar(); }
    catch (x) { setError((x as { status?: number }).status === 401 ? 'Correo o clave incorrectos.' : 'No pude entrar. Probá de nuevo.'); }
    finally { setOcupado(false); }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-6">
      <form onSubmit={entrar} className="aparece burbuja aura rounded-3xl px-7 py-7 w-full max-w-[380px] text-center">
        <div className="font-marca tracking-[.32em] text-[22px] text-hielo">AURA</div>
        <div className="font-mono text-[9.5px] tracking-hud text-cian mt-1 mb-6">ORDEN GLOBAL · SOLO LA JUNTA</div>
        <input value={correo} onChange={(e) => setCorreo(e.target.value)} type="email" autoComplete="username" placeholder="Tu correo" required
          className="w-full mb-3 rounded-2xl bg-vacio/60 border border-cian/20 px-4 py-3 text-[15px] text-hielo outline-none focus:border-cian/60" />
        <input value={clave} onChange={(e) => setClave(e.target.value)} type="password" autoComplete="current-password" placeholder="Tu clave" required
          className="w-full mb-4 rounded-2xl bg-vacio/60 border border-cian/20 px-4 py-3 text-[15px] text-hielo outline-none focus:border-cian/60" />
        <button disabled={ocupado} className="w-full rounded-2xl py-3 text-[15px] font-semibold text-abismo bg-cian/90 hover:bg-cian disabled:opacity-60">{ocupado ? 'Entrando…' : 'Entrar'}</button>
        {error && <div className="mt-3 text-[13px] text-[#FF8A8A]" aria-live="polite">{error}</div>}
      </form>
    </div>
  );
}

const usd = (n: number | null | undefined, dec = 2) => (n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
const num = (n: number | null | undefined) => (n == null ? '—' : '#' + n.toLocaleString('en-US'));

/** El riel de telemetría: cada fila es un dato real, leído hace menos de 30 s. */
function Riel() {
  const vivo = useOs((s) => s.vivo); const yo = useOs((s) => s.yo); const pendientes = useOs((s) => s.pendientes);
  const voces = useOs((s) => s.voces); const vozId = useOs((s) => s.vozId); const silencio = useOs((s) => s.silencio);
  const abiertos = pendientes.filter((p) => p.estado !== 'hecho').length;
  const voz = voces.find((v) => v.id === vozId)?.nombre || (yo?.voz ? 'ElevenLabs' : 'navegador');
  const filas: [string, string, 'ok' | 'mal' | 'neutro'][] = [
    ['ORIGEN', vivo?.origen ? usd(vivo.origen.origenUsd, 4) : '—', vivo?.origen ? 'ok' : 'neutro'],
    ['ONZA', vivo?.origen?.oroOnzaUsd ? usd(vivo.origen.oroOnzaUsd) : '—', vivo?.origen?.oroOnzaUsd ? 'ok' : 'neutro'],
    ['5550', num(vivo?.ordenex?.bloque5550), vivo?.ordenex?.vivo ? 'ok' : vivo ? 'mal' : 'neutro'],
    ['8532', num(vivo?.ordenscan?.bloque8532), vivo?.ordenscan?.vivo ? 'ok' : vivo ? 'mal' : 'neutro'],
    ['USDT', vivo?.ordenex?.compraUsdt || '—', vivo?.ordenex?.compraUsdt === 'abierta' ? 'ok' : 'neutro'],
    ['AUCORP', !vivo ? '—' : vivo.aucorp?.vivo ? 'viva' : 'no contesta', !vivo ? 'neutro' : vivo.aucorp?.vivo ? 'ok' : 'mal'],
    ['WALLET', !vivo ? '—' : vivo.wallet?.vivo ? 'viva' : 'no contesta', !vivo ? 'neutro' : vivo.wallet?.vivo ? 'ok' : 'mal'],
    ['GENESIS', !vivo ? '—' : vivo.genesis?.vivo ? 'viva' : 'no contesta', !vivo ? 'neutro' : vivo.genesis?.vivo ? 'ok' : 'mal'],
    ['PENDIENTES', String(abiertos), abiertos ? 'neutro' : 'ok'],
    ['CEREBRO', yo ? (yo.donde === 'nodo' ? 'nodo · ' + yo.modelo.replace(/^nodo:/, '') : yo.modelo) : '—', yo?.cerebro ? 'ok' : 'mal'],
    ['VOZ', silencio ? 'en silencio' : voz, silencio ? 'neutro' : 'ok'],
  ];
  return (
    <div className="mt-2 grid grid-cols-[auto_auto] gap-x-3 gap-y-[3px] font-mono text-[9.5px] tracking-[.14em] leading-[13px] select-none">
      {filas.map(([k, v, e]) => (
        <div key={k} className="contents">
          <span className="text-bruma/60 text-right">{k}</span>
          <span className={`tabular-nums ${e === 'ok' ? 'text-cian/90' : e === 'mal' ? 'text-bruma/50 line-through decoration-bruma/40' : 'text-hielo/70'}`}>{v}</span>
        </div>
      ))}
    </div>
  );
}

export default function HUDChrome() {
  const vivo = useOs((s) => s.vivo);
  const yo = useOs((s) => s.yo);
  const necesitaEntrar = useOs((s) => s.necesitaEntrar);
  const bootComplete = useOs((s) => s.bootComplete);
  const aviso = useOs((s) => s.aviso);
  const silencio = useOs((s) => s.silencio);
  const voces = useOs((s) => s.voces); const vozId = useOs((s) => s.vozId);
  const [menu, setMenu] = useState(false);

  useEffect(() => { void os.iniciar(); }, []);
  useEffect(() => { if (!aviso) return; const id = setTimeout(() => useOs.getState().avisar(null), 4200); return () => clearTimeout(id); }, [aviso]);
  useEffect(() => {
    const abrir = () => setMenu((m) => !m);
    window.addEventListener('aura:menu', abrir); return () => window.removeEventListener('aura:menu', abrir);
  }, []);

  const cadena = vivo?.ordenex?.vivo ? 'CADENA 5550 • sincronizada' : vivo ? 'CADENA 5550 • sin lectura' : 'CADENA 5550';
  const enEspanol = voces.filter((v) => v.idioma === 'es');
  const otras = voces.filter((v) => v.idioma !== 'es').slice(0, 6);

  return (
    <>
      <div className="fixed top-0 inset-x-0 z-40 flex justify-between items-start px-5 pt-4 pointer-events-none select-none">
        <div>
          <div className="font-mono text-[11px] tracking-hud text-hielo/85">ORDEN GLOBAL<span className="text-cian/70"> · AURA OS</span></div>
          {yo && bootComplete && (
            <div className="mt-1 font-mono text-[9.5px] tracking-[.14em] text-bruma/60 leading-[13px]">
              {yo.miembro.nombre.toUpperCase()}<br />
              {yo.donde === 'nodo' ? 'PENSANDO EN NUESTRO NODO' : 'PENSANDO CON CLAUDE'}<br />
              21 HERRAMIENTAS · {yo.saber?.total ?? '—'} SECCIONES DE SABER
            </div>
          )}
        </div>
        <div className="font-mono text-[10.5px] tracking-hud text-bruma/85 text-right leading-5 pointer-events-auto">
          <Reloj /><br />
          <span className={vivo?.ordenex?.vivo ? 'text-cian/80' : 'text-bruma/60'}>{cadena}</span>
          {bootComplete && !necesitaEntrar && (
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={() => os.silenciar(!silencio)} className={`font-mono text-[9.5px] tracking-hud px-2 py-[2px] rounded-full border ${silencio ? 'border-bruma/30 text-bruma/60' : 'border-cian/40 text-cian'}`} title={silencio ? 'Encender la voz' : 'Callar a Aura'}>
                {silencio ? 'VOZ APAGADA' : 'VOZ'}
              </button>
              <button onClick={() => setMenu(true)} className="font-mono text-[9.5px] tracking-hud px-2 py-[2px] rounded-full border border-bruma/30 text-bruma/70" title="Elegir voz, panel clásico, salir">···</button>
            </div>
          )}
          {bootComplete && !necesitaEntrar && <div className="hidden min-[900px]:block"><Riel /></div>}
        </div>
      </div>
      {/* el boot: solo una palabra que se apaga */}
      {!bootComplete && !necesitaEntrar && (
        <div className="fixed inset-0 z-30 grid place-items-center pointer-events-none">
          <div className="font-marca tracking-[.4em] text-[13px] text-cian/60 late">AURA</div>
        </div>
      )}
      {necesitaEntrar && <Puerta />}
      {aviso && <div className="fixed left-1/2 -translate-x-1/2 bottom-28 z-50 aparece burbuja mia rounded-full px-4 py-2 text-[13px] text-hielo">{aviso}</div>}
      {/* el menú: toque largo sobre el pecho, o los tres puntos */}
      {menu && (
        <div className="fixed inset-0 z-50" onClick={() => setMenu(false)}>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 aparece burbuja aura rounded-2xl px-5 py-4 w-[min(92vw,360px)] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="font-mono text-[9.5px] tracking-hud text-cian mb-2">{yo ? yo.miembro.nombre.toUpperCase() : 'AURA'}</div>
            <div className="text-[12px] text-bruma mb-3 leading-5">
              {yo?.donde === 'nodo' ? 'Pensando en nuestro nodo' : yo?.modelo || '—'}<br />
              {yo?.voz ? 'Voz de ElevenLabs' : 'Voz del navegador'} · {yo?.memoria === 'mongo' ? 'memoria guardada' : 'memoria provisional'}
            </div>
            {yo?.voz && (
              <div className="mb-3">
                <div className="font-mono text-[9.5px] tracking-hud text-bruma/70 mb-1">LA VOZ DE AURA · tocá para oírla</div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => os.probarVoz(null)} className={`text-[12px] px-2.5 py-1 rounded-full border ${!vozId ? 'border-cian text-cian' : 'border-cian/25 text-hielo/80'}`}>La de la casa</button>
                  {enEspanol.map((v) => (
                    <button key={v.id} onClick={() => os.probarVoz(v.id)} className={`text-[12px] px-2.5 py-1 rounded-full border ${vozId === v.id ? 'border-cian text-cian' : 'border-cian/25 text-hielo/80'}`} title={[v.genero, v.edad, v.acento].filter(Boolean).join(' · ')}>
                      {v.nombre}
                    </button>
                  ))}
                </div>
                {otras.length > 0 && (
                  <details className="mt-2">
                    <summary className="font-mono text-[9.5px] tracking-hud text-bruma/50 cursor-pointer">OTRAS (EN INGLÉS, HABLAN ESPAÑOL CON ACENTO)</summary>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {otras.map((v) => <button key={v.id} onClick={() => os.probarVoz(v.id)} className={`text-[12px] px-2.5 py-1 rounded-full border ${vozId === v.id ? 'border-cian text-cian' : 'border-cian/25 text-hielo/80'}`}>{v.nombre}</button>)}
                    </div>
                  </details>
                )}
              </div>
            )}
            <button onClick={() => os.silenciar(!silencio)} className="block text-[13px] text-hielo py-1.5">{silencio ? 'Encender la voz' : 'Callar a Aura'}</button>
            <a href="/clasico/" className="block text-[13px] text-hielo py-1.5">Panel clásico (pendientes, biblioteca, hilos)</a>
            <button onClick={async () => { await api.salir().catch(() => {}); location.reload(); }} className="block text-[13px] text-hielo py-1.5">Salir</button>
          </div>
        </div>
      )}
    </>
  );
}

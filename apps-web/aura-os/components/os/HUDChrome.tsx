'use client';
// EL CROMO: lo mínimo. Arriba a la izquierda, la casa. Arriba a la derecha, la
// hora y la cadena. Ni hamburguesa ni engranaje: el menú sale con un toque
// largo sobre el núcleo del ser. Y la puerta, cuando no hay sesión: un vidrio
// en el vacío, no una página de login.
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
  return <span className="font-mono tabular-nums">{hora}</span>;
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

export default function HUDChrome() {
  const vivo = useOs((s) => s.vivo);
  const yo = useOs((s) => s.yo);
  const necesitaEntrar = useOs((s) => s.necesitaEntrar);
  const bootComplete = useOs((s) => s.bootComplete);
  const aviso = useOs((s) => s.aviso);
  const [menu, setMenu] = useState(false);

  useEffect(() => { void os.iniciar(); }, []);
  useEffect(() => { if (!aviso) return; const id = setTimeout(() => useOs.getState().avisar(null), 4200); return () => clearTimeout(id); }, [aviso]);
  useEffect(() => {
    const abrir = () => setMenu((m) => !m);
    window.addEventListener('aura:menu', abrir); return () => window.removeEventListener('aura:menu', abrir);
  }, []);

  const bloque = vivo?.ordenex?.bloque5550;
  const cadena = vivo?.ordenex?.vivo ? `CADENA 5550 • sincronizada${bloque ? ' #' + bloque.toLocaleString('en-US') : ''}` : vivo ? 'CADENA 5550 • sin lectura' : 'CADENA 5550';

  return (
    <>
      <div className="fixed top-0 inset-x-0 z-40 flex justify-between items-start px-5 pt-4 pointer-events-none select-none">
        <div className="font-mono text-[11px] tracking-hud text-hielo/85">ORDEN GLOBAL<span className="text-cian/70"> · AURA OS</span></div>
        <div className="font-mono text-[10.5px] tracking-hud text-bruma/85 text-right leading-5">
          <Reloj /><br />
          <span className={vivo?.ordenex?.vivo ? 'text-cian/80' : 'text-bruma/60'}>{cadena}</span>
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
      {/* el menú del núcleo: toque largo sobre el pecho */}
      {menu && (
        <div className="fixed inset-0 z-50" onClick={() => setMenu(false)}>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 aparece burbuja aura rounded-2xl px-5 py-4 min-w-[240px]" onClick={(e) => e.stopPropagation()}>
            <div className="font-mono text-[9.5px] tracking-hud text-cian mb-3">{yo ? yo.miembro.nombre.toUpperCase() : 'AURA'}</div>
            <div className="text-[12px] text-bruma mb-3 leading-5">
              {yo?.donde === 'nodo' ? 'Pensando en nuestro nodo' : yo?.modelo || '—'}<br />
              {yo?.voz ? 'Voz de ElevenLabs' : 'Voz del navegador'} · {yo?.memoria === 'mongo' ? 'memoria guardada' : 'memoria provisional'}
            </div>
            <a href="/clasico/" className="block text-[13px] text-hielo py-1.5">Panel clásico (pendientes, biblioteca, hilos)</a>
            <button onClick={async () => { await api.salir().catch(() => {}); location.reload(); }} className="block text-[13px] text-hielo py-1.5">Salir</button>
          </div>
        </div>
      )}
    </>
  );
}

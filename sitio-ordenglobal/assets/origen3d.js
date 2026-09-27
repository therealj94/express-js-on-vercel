/* ════════════════════════════════════════════════════════════════════════════
   ORIGEN, en 3D · la explicación del tráiler «La misma regla», con scroll

   Un gramo de oro martillado. Se marca en 55 porciones, una sale sola y es
   un gramín: un ORIGEN. Después sube y baja con el oro. El scroll lleva la
   cuenta; cada paso tiene su frase abajo, como en el tráiler.

   Este archivo solo decide: si hay WebGL y no hay movimiento reducido, pide la
   escena (assets/origen3d-escena.js, con Three.js adentro) cuando la sección se
   acerca, con la misma versión ?v= que él. Si algo falla, queda el disco plano.
   ════════════════════════════════════════════════════════════════════════════ */
const sec = document.querySelector('.origen3d');
const html = document.documentElement;
const quieto = !html.classList.contains('anima');

function hayWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

if (sec && !quieto && hayWebGL()) {
  html.classList.add('con3d');
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) { io.disconnect(); import(new URL('origen3d-escena.js' + new URL(import.meta.url).search, import.meta.url).href).then((m) => m.arrancar(sec)).catch(() => html.classList.remove('con3d')); }
  }, { rootMargin: '120% 0px' });
  io.observe(sec);
}


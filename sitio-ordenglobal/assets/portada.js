/* ── EL MENÚ DEL TELÉFONO ───────────────────────────────────────────────────
   La barra no tenía nada debajo de 860 px: los enlaces estaban escondidos con
   `display:none` y no había con qué abrirlos. Esto es el botón que faltaba. */
(function(){
  var b = document.querySelector('.menuBtn'), n = document.getElementById('nav');
  if (!b || !n) return;
  /* El botón de crear cuenta entra al menú SOLO en el teléfono: en la barra
     no cabe. Moviéndolo siempre, en escritorio quedaba dentro de `.nav` y la
     regla `.nav a{color:var(--bruma)}` le ganaba por especificidad al oro del
     botón: se veía el texto en celeste sobre el dorado. Ahora va y vuelve con
     el ancho de la pantalla. */
  var cta = document.querySelector('.barra .btn');
  var barra = document.querySelector('.barra .env');
  var angosto = matchMedia('(max-width:860px)');
  function acomodar() {
    if (!cta) return;
    if (angosto.matches) { if (cta.parentNode !== n) n.appendChild(cta); }
    else if (cta.parentNode !== barra) barra.appendChild(cta);
  }
  acomodar();
  angosto.addEventListener('change', acomodar);
  function poner(abierto){
    b.setAttribute('aria-expanded', String(abierto));
    n.classList.toggle('abierto', abierto);
  }
  b.addEventListener('click', function(){
    poner(b.getAttribute('aria-expanded') !== 'true');
  });
  // Tocar un enlace cierra: si no, el menú tapa aquello a lo que se acaba de ir.
  n.addEventListener('click', function(e){ if (e.target.closest('a')) poner(false); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') poner(false); });
})();

/* ── EL CIELO DE LA CASA ────────────────────────────────────────────────────
   El mismo `galaxia.js` que dibuja la puerta de app.vetawallet.com, del mismo
   archivo y no una imitación: es la diferencia entre parecerse y ser la misma
   casa. Se monta solo detrás de la ENTRADA —abajo vuelve la fotografía de
   marca— y el propio módulo se queda quieto si el navegador pide menos
   movimiento. Si por lo que sea no cargó, no pasa nada: detrás hay fondo. */
(function(){
  var el = document.getElementById('galaxia');
  if (el && window.GALAXIA) { try { window.GALAXIA.montar(el); } catch (e) {} }
})();

/* ── SOLO LO REAL SE MUEVE ──────────────────────────────────────────────────
   Dos datos vivos, de las mismas fuentes que la billetera. Si una fuente no
   contesta, queda el guion: un numero inventado que se mueve es peor que
   ninguno, porque parece comprobado. */
(function(){
  var OZ = 31.1035, GRAMIN = 55;
  var $ = function(id){ return document.getElementById(id); };
  function precio(){
    fetch('https://api.gold-api.com/price/XAU').then(function(r){ return r.json(); }).then(function(j){
      var onza = Number(j && j.price); if(!isFinite(onza) || onza <= 0) return;
      var gramo = onza / OZ, origen = gramo / GRAMIN;
      $('precio').textContent = '$' + origen.toFixed(2);
      $('oro').textContent = 'gramo $' + gramo.toFixed(2);
    }).catch(function(){});
  }
  var pidiendo = false;
  function cadena(){
    if(pidiendo) return; pidiendo = true;
    fetch('https://rpc.ordenglobal-rpc.com/', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_getBlockByNumber', params:['latest', false] }) })
    .then(function(r){ return r.json(); }).then(function(j){
      var b = j && j.result; if(!b) return;
      var n = parseInt(b.number, 16); if(!isFinite(n)) return;
      var txt = n.toLocaleString('es-ES').replace(/\./g, ' ');
      $('bloque').textContent = txt;
      var b2 = $('bloque2'); if (b2) b2.textContent = txt;
      if(b.hash) $('hash').textContent = b.hash;
    }).catch(function(){}).finally(function(){ pidiendo = false; });
  }
  precio(); cadena();
  setInterval(function(){ if(!document.hidden) precio(); }, 600000);
  setInterval(function(){ if(!document.hidden) cadena(); }, 20000);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) cadena(); });
})();

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
      $('bloque').textContent = txt; $('bloque2').textContent = txt;
      if(b.hash){ $('hash').textContent = b.hash; $('hash2').textContent = b.hash; }
    }).catch(function(){}).finally(function(){ pidiendo = false; });
  }
  precio(); cadena();
  setInterval(function(){ if(!document.hidden) precio(); }, 600000);
  setInterval(function(){ if(!document.hidden) cadena(); }, 20000);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) cadena(); });
})();

/* Markdown → HTML, chico y sin dependencias. Lo usan el panel (en el
 * navegador) y el servidor (para bajar un documento como HTML), y por eso va
 * envuelto para los dos.
 *
 * Cubre lo que ULTRON escribe: títulos, párrafos, listas, tablas, negrita,
 * cursiva, código, citas, enlaces y reglas. Todo el texto se ESCAPA antes de
 * pintarse: lo que sale del modelo es texto, nunca HTML, y un documento que
 * cite un «<script>» de un contrato tiene que enseñarlo, no ejecutarlo. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.MARKDOWN = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Lo de dentro de una línea: negrita, cursiva, código, enlaces. */
  function enLinea(t) {
    let s = esc(t);
    s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  function aHtml(md) {
    const lineas = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    const salida = [];
    let i = 0;
    const parrafo = [];
    const cerrarParrafo = () => { if (parrafo.length) { salida.push(`<p>${enLinea(parrafo.join(' '))}</p>`); parrafo.length = 0; } };

    while (i < lineas.length) {
      const l = lineas[i];

      // código
      if (/^```/.test(l)) {
        cerrarParrafo();
        const buf = []; i++;
        while (i < lineas.length && !/^```/.test(lineas[i])) buf.push(lineas[i++]);
        i++;
        salida.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }
      // título
      const h = l.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (h) { cerrarParrafo(); salida.push(`<h${h[1].length}>${enLinea(h[2])}</h${h[1].length}>`); i++; continue; }
      // regla
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { cerrarParrafo(); salida.push('<hr>'); i++; continue; }
      // tabla
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lineas.length && /^\s*\|?\s*:?-{2,}/.test(lineas[i + 1])) {
        cerrarParrafo();
        const celdas = (x) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const cab = celdas(l); i += 2;
        const filas = [];
        while (i < lineas.length && /^\s*\|.*\|\s*$/.test(lineas[i])) filas.push(celdas(lineas[i++]));
        salida.push('<div class="tabla"><table><thead><tr>' + cab.map((c) => `<th>${enLinea(c)}</th>`).join('') + '</tr></thead><tbody>'
          + filas.map((f) => '<tr>' + f.map((c) => `<td>${enLinea(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
        continue;
      }
      // cita
      if (/^\s*>\s?/.test(l)) {
        cerrarParrafo();
        const buf = [];
        while (i < lineas.length && /^\s*>\s?/.test(lineas[i])) buf.push(lineas[i++].replace(/^\s*>\s?/, ''));
        salida.push(`<blockquote>${aHtml(buf.join('\n'))}</blockquote>`);
        continue;
      }
      // listas (con anidación por sangría de dos o más espacios)
      if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
        cerrarParrafo();
        const items = [];
        const ordenada = /^\s*\d+[.)]\s+/.test(l);
        while (i < lineas.length && /^\s*([-*+]|\d+[.)])\s+/.test(lineas[i])) {
          const m = lineas[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          items.push({ nivel: Math.floor(m[1].length / 2), texto: m[3] });
          i++;
          // continuación de un ítem, sangrada
          while (i < lineas.length && /^\s{2,}\S/.test(lineas[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lineas[i])) {
            items[items.length - 1].texto += ' ' + lineas[i].trim(); i++;
          }
        }
        const tag = ordenada ? 'ol' : 'ul';
        let html = `<${tag}>`, nivel = 0;
        for (const it of items) {
          while (nivel < it.nivel) { html += `<${tag}>`; nivel++; }
          while (nivel > it.nivel) { html += `</${tag}>`; nivel--; }
          html += `<li>${enLinea(it.texto)}</li>`;
        }
        while (nivel-- > 0) html += `</${tag}>`;
        salida.push(html + `</${tag}>`);
        continue;
      }
      // vacío
      if (!l.trim()) { cerrarParrafo(); i++; continue; }
      parrafo.push(l.trim()); i++;
    }
    cerrarParrafo();
    return salida.join('\n');
  }

  return { aHtml, esc };
});

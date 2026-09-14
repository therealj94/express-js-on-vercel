// Enruta el turno: Qwen 3.8 27B en el nodo para lo de todos los días;
// Claude solo cuando el trabajo es largo (código, contrato, muchas manos)
// y la casa NO está en modo «solo nosotros».
//
// No reemplaza ULTRON_CEREBRO. Si la junta eligió «nodo», acá no se sale.

const PESADO = [
  /\b(pr|pull request|repo_proponer|desplegar|refactor|contrato|escritura|patch)\b/i,
  /\b(mejor(a|ar)|reescrib|implement|arquitect)/i,
  /\b(plan\s+completo|memor[áa]ndum|due diligence|comparar tres)\b/i,
  /\b(debug|stack trace|typeerror|uncaught)\b/i,
  /\b(estrateg|hoja de ruta|roadmap|plan de|armar un plan|trabajo largo)\b/i,
  /\b(sub(i|í|ir)|entreg(a|ar)|documento completo|propuesta)\b/i,
];

function pedidoDe(args) {
  const t = String(args?.texto || args?.mensaje || args?.pregunta || '');
  if (t) return t;
  const msgs = args?.mensajes || args?.historial || [];
  if (Array.isArray(msgs) && msgs.length) {
    const last = msgs[msgs.length - 1];
    return String(last?.content || last?.texto || last?.mensaje || '');
  }
  return '';
}

function esPesado(texto) {
  const t = String(texto || '');
  if (t.length > 4000) return true;
  return PESADO.some((re) => re.test(t));
}

function decidir(args, { modo, claudeOn } = {}) {
  const texto = pedidoDe(args);
  const pesado = esPesado(texto);
  if (!pesado) return { cerebro: 'nodo', motivo: 'turno corto: Qwen 27B' };
  if (modo === 'nodo') return { cerebro: 'nodo', motivo: 'pesado, pero modo solo-nosotros' };
  if (!claudeOn) return { cerebro: 'nodo', motivo: 'pesado, sin Claude' };
  return { cerebro: 'claude', motivo: 'turno pesado: Claude' };
}

module.exports = { decidir, esPesado, pedidoDe };

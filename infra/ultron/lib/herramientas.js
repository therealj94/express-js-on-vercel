(archivo completo — se inserta el nuevo objeto en el arreglo de herramientas después de `proponer_envio`, y su caso en `correrAdentro` después del caso `proponer_envio`)

// ── EN EL ARREGLO DE HERRAMIENTAS (después de proponer_envio, línea ~206) ──
{
  name: 'avisar_numero',
  description: 'Prepara un WhatsApp para un número externo (no miembro de la junta). El número va con código de país, ej. +504 9878-2176. NO lo manda: la persona lo confirma en el panel.',
  input_schema: { type: 'object', properties: { numero: { type: 'string', description: 'Número con código de país, ej. +504 9878-2176' }, texto: { type: 'string' } }, required: ['numero', 'texto'] },
},

// ── EN correrAdentro (después del case 'proponer_envio', línea ~972) ──
case 'avisar_numero': {
  const numero = String(entrada.numero || '').trim();
  if (!numero) return 'Falta el número de destino.';
  if (!/^\+?[0-9\s-]{7,15}$/.test(numero)) return `El número «${numero}» no parece válido. Se espera formato +504 9878-2176.`;
  if (!entrada.texto) return 'Falta el texto del mensaje.';
  const p = { id: `env-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, canal: 'whatsapp',
    a: { nombre: numero, correo: null, whatsapp: numero },
    asunto: null, texto: entrada.texto, propuestoPor: ctx.miembro.correo, externo: true };
  ctx.envios.push(p);
  return `Envío preparado (${p.id}) por WhatsApp a ${numero} (externo). NO se ha mandado: la persona lo confirma en el panel.`;
}

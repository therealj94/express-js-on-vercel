'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RUTA = process.env.ULTRON_HABILIDADES || path.join(__dirname, '..', 'habilidades');

function nombreLimpio(x) {
  return String(x || '').trim().toLowerCase().replace(/\s+/g, '-');
}

function rutaDe(nombre) {
  const n = nombreLimpio(nombre);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(n)) throw Object.assign(new Error(`Nombre de habilidad inválido: «${x}».`), { codigo: 'NOMBRE' });
  return path.join(RUTA, `${n}.md`);
}

async function leerTodos() {
  if (!fs.existsSync(RUTA)) return [];
  const nombres = fs.readdirSync(RUTA).filter((f) => f.endsWith('.md'));
  const salida = [];
  for (const n of nombres) {
    try {
      const texto = fs.readFileSync(path.join(RUTA, n), 'utf8');
      const titulo = (texto.match(/^#\s*(.+)$/m) || [])[1] || n.replace(/\.md$/, '');
      const resumen = (texto.match(/^##\s*Para qué\s*\n+([\s\S]+?)(?=\n##|\n$)/m) || [])[1];
      salida.push({ nombre: n.replace(/\.md$/, ''), titulo: titulo.trim(), resumen: (resumen || '').trim().slice(0, 240) });
    } catch {}
  }
  return salida;
}

async function listar() {
  return leerTodos();
}

async function ver(nombre) {
  const r = rutaDe(nombre);
  if (!fs.existsSync(r)) throw Object.assign(new Error(`No hay ninguna habilidad llamada «${nombre}».`), { codigo: 'NO_EXISTE' });
  return fs.readFileSync(r, 'utf8');
}

async function crear({ nombre, paraQue, pasos }) {
  const n = nombreLimpio(nombre);
  if (!n) throw Object.assign(new Error('Hace falta un nombre.'), { codigo: 'NOMBRE' });
  if (!fs.existsSync(RUTA)) fs.mkdirSync(RUTA, { recursive: true });
  const r = path.join(RUTA, `${n}.md`);
  if (fs.existsSync(r)) throw Object.assign(new Error(`Ya existe una habilidad llamada «${nombre}».`), { codigo: 'YA_EXISTE' });
  const md = `# ${String(nombre).trim()}

## Para qué

${String(paraQue || '').trim()}

## Pasos

${String(pasos || '').trim()}
`;
  fs.writeFileSync(r, md, 'utf8');
  return { nombre: n, ruta: r };
}

async function borrar(nombre) {
  const r = rutaDe(nombre);
  if (!fs.existsSync(r)) throw Object.assign(new Error(`No hay ninguna habilidad llamada «${nombre}».`), { codigo: 'NO_EXISTE' });
  fs.unlinkSync(r);
  return { nombre: nombreLimpio(nombre) };
}

async function usar(nombre) {
  const n = nombreLimpio(nombre);
  if (!n) throw Object.assign(new Error('Hace falta el nombre de la habilidad.'), { codigo: 'NOMBRE' });
  const h = (await listar()).find((x) => x.nombre === n);
  if (!h) throw Object.assign(new Error(`No hay ninguna habilidad llamada «${n}».`), { codigo: 'NO_EXISTE' });
  return h;
}

module.exports = { listar, ver, crear, borrar, usar };

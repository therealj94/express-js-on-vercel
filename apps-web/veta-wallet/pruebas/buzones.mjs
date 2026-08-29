/* Que no volvamos a publicar una dirección que no recibe.
 *
 *   node pruebas/buzones.mjs
 *
 * POR QUE EXISTE
 *
 * `vetawallet.com` no tenía registro MX, así que soporte@ y privacidad@ —que
 * estaban escritas 27 veces en los términos, la política de privacidad y la
 * página de borrado de cuenta— rebotaban todo lo que les llegara. La política
 * promete ese buzón para ejercer los derechos sobre los datos personales, y las
 * tiendas exigen un contacto vivo para pedir la baja. Nadie lo notó durante
 * meses, porque una dirección muerta no avisa: solo falla del lado de quien
 * escribe.
 *
 * Ahora los buzones existen. Lo que esta prueba impide es que alguien publique
 * mañana `ayuda@vetawallet.com` en una página nueva, sin darse cuenta de que
 * hace falta además una regla de recepción — y que vuelva a pasar lo mismo.
 *
 * DOS MITADES, Y LA SEGUNDA ES OPCIONAL A PROPOSITO
 *
 *  1. Contra la lista de abajo. Corre en cualquier sitio, sin credenciales, y
 *     es la que va a saltar en el momento de escribir la dirección nueva.
 *  2. Contra las reglas de SES de verdad, si hay credenciales de AWS a mano.
 *     Es la que se entera de lo contrario: que alguien borre una regla y las
 *     páginas se queden apuntando al vacío.
 *
 * La lista no es la fuente de la verdad —lo es SES— pero sí es lo que hace que
 * la prueba sirva en una máquina cualquiera. Si se añade una aquí sin crear su
 * regla, la mitad 2 lo canta.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const AQUI = new URL('.', import.meta.url).pathname;
const SITIO = join(AQUI, '..');
const RAIZ = join(SITIO, '..', '..');

// Las direcciones @vetawallet.com que TIENEN buzón. Al añadir una aquí hay que
// crear también su regla de recepción en SES (conjunto `veta-entrante`).
const CON_BUZON = new Set(['soporte@vetawallet.com', 'privacidad@vetawallet.com']);

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};

// Todo lo que se publica de cara al mundo: el sitio, los documentos legales de
// la app móvil, y la carpeta legal que no se publica pero de la que se copian
// cosas (de ahí salió la página de borrado).
function archivos() {
  const out = [];
  for (const f of readdirSync(SITIO)) {
    if (f.endsWith('.html') || f === 'i18n.js') out.push(join(SITIO, f));
  }
  for (const dir of [join(RAIZ, 'veta-wallet-app', 'legal'), join(RAIZ, 'veta-wallet-legal')]) {
    try {
      for (const f of readdirSync(dir)) {
        if (f.endsWith('.md') || f.endsWith('.html')) out.push(join(dir, f));
      }
    } catch { /* la carpeta puede no existir */ }
  }
  return out;
}

const donde = new Map();   // direccion -> archivos donde aparece
for (const ruta of archivos()) {
  const texto = readFileSync(ruta, 'utf8');
  for (const dir of texto.match(/[a-zA-Z0-9._%-]+@vetawallet\.com/g) || []) {
    if (!donde.has(dir)) donde.set(dir, new Set());
    donde.get(dir).add(ruta.replace(RAIZ + '/', ''));
  }
}

console.log(`\n── ${donde.size} dirección(es) @vetawallet.com publicadas ──────────────`);

for (const [dir, archs] of [...donde].sort()) {
  comprobar(CON_BUZON.has(dir), `${dir} tiene buzón`,
    CON_BUZON.has(dir) ? '' : `publicada en: ${[...archs].join(', ')}\n           `
      + 'hay que crearle su regla de recepción en SES, o quitarla de las páginas');
}

// ── Contra SES de verdad, si se puede ───────────────────────────────────────
let reales = null;
try {
  const salida = execFileSync('python3', ['-c', `
import json,boto3,os
import glob
# LAS LLAVES NO LLEVAN LA RUTA ESCRITA.
# Aca habia una ruta absoluta con el identificador de UNA sesion de trabajo
# dentro. Fuera de esa sesion no existe, y el fichero no puede vivir en el
# repositorio porque son credenciales. Se busca donde suele estar, o se dice
# por AWS_LLAVES.
p = os.environ.get("AWS_LLAVES") or next(
    iter(sorted(glob.glob("/tmp/claude-*/*/*/scratchpad/aws_llaves.json"))), "")
if not p:
    raise SystemExit("No encuentro aws_llaves.json. Pasalo en AWS_LLAVES.")
c=json.load(open(p))
s=boto3.Session(aws_access_key_id=c["AccessKeyId"],aws_secret_access_key=c["SecretAccessKey"],region_name="us-east-1")
a=s.client("ses").describe_active_receipt_rule_set()
r=set()
for x in a["Rules"]:
    if x["Enabled"]: r|={y.lower() for y in x.get("Recipients",[])}
print(json.dumps(sorted(r)))
`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 });
  reales = new Set(JSON.parse(salida));
} catch {
  console.log('\n  (sin credenciales de AWS: no se coteja contra las reglas reales)');
}

if (reales) {
  console.log('\n── contra las reglas de recepción de SES ───────────────────────');
  for (const dir of donde.keys()) {
    comprobar(reales.has(dir.toLowerCase()), `SES atiende ${dir}`,
      reales.has(dir.toLowerCase()) ? '' : 'la página la publica y SES la rechaza');
  }
  const sobran = [...CON_BUZON].filter((d) => !reales.has(d));
  comprobar(sobran.length === 0, 'la lista de arriba no promete buzones que ya no existan',
    sobran.length ? `sin regla en SES: ${sobran.join(', ')}` : '');
}

if (fallos) { console.log(`\n${fallos} comprobación(es) fallaron`); process.exit(1); }
console.log('\nTodo en verde');

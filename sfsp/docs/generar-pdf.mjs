/* Genera los PDF a partir de sus HTML. Chromium sin cabeza, sin descargar nada.
   Las fuentes están en fuentes/, con su licencia, para que el resultado no
   dependa de lo que tenga instalado la máquina. */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env['CHROME_BIN'] ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

for (const nombre of ['DONDE-ESTAMOS', 'PRESENTACION']) {
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
    '--allow-file-access-from-files',
    `--print-to-pdf=${join(aqui, `${nombre}.pdf`)}`,
    `file://${join(aqui, `${nombre}.html`)}`,
  ], { stdio: 'ignore', timeout: 180_000 });
  console.log(`docs/${nombre}.pdf`);
}

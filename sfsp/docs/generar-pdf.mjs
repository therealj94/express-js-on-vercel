/* Genera el PDF a partir del HTML. Chromium sin cabeza, sin descargar nada. */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env['CHROME_BIN'] ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  '--no-pdf-header-footer',
  `--print-to-pdf=${join(aqui, 'DONDE-ESTAMOS.pdf')}`,
  `file://${join(aqui, 'DONDE-ESTAMOS.html')}`,
], { stdio: 'inherit', timeout: 120_000 });
console.log('PDF generado en docs/DONDE-ESTAMOS.pdf');

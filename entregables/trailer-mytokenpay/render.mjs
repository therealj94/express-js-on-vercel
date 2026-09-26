// Renderiza el trailer cuadro por cuadro y mezcla el audio.
//
//   node render.mjs 16x9            → salida/mytokenpay-trailer-16x9.mp4
//   node render.mjs 9x16            → salida/mytokenpay-trailer-9x16.mp4
//   node render.mjs 16x9 --fotos 3,14.8,24.5   → salida/fotos/*.jpg para revisar
//
// Necesita ffmpeg en el PATH y Chromium de Playwright.
import { createServer } from 'node:http'
import { readFile, mkdir, rm, access } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { extname, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

let chromium
try { ({ chromium } = await import('playwright')) } catch { ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs')) }

const AQUI = dirname(fileURLToPath(import.meta.url))
const FORMATO = process.argv[2] === '9x16' ? '9x16' : '16x9'
const iFotos = process.argv.indexOf('--fotos')
const FOTOS = iFotos > 0 ? process.argv[iFotos + 1].split(',').map(Number) : null
const [W, H] = FORMATO === '9x16' ? [1080, 1920] : [1920, 1080]
const FPS = 30
const CUADROS = join(AQUI, '.cuadros')
const SALIDA = join(AQUI, 'salida')

const ff = (args, opciones = {}) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit', ...opciones })
  if (r.status !== 0) throw new Error('ffmpeg falló: ' + args.join(' '))
}

// 1. cuadros de los planos de ambiente
for (const b of ['calle', 'cafe']) {
  const dir = join(CUADROS, b)
  try { await access(join(dir, '0151.jpg')) } catch {
    await mkdir(dir, { recursive: true })
    ff(['-i', join(AQUI, 'media/broll', b + '.mp4'), '-vf', 'fps=30,scale=1920:1080', '-q:v', '2', join(dir, '%04d.jpg')])
  }
}

// 2. servidor local
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' }
const sv = createServer(async (q, r) => {
  const ruta = decodeURIComponent(q.url.split('?')[0])
  const p = ruta.startsWith('/cuadros/') ? join(CUADROS, ruta.slice(9)) : join(AQUI, ruta)
  try { r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' }); r.end(await readFile(p)) }
  catch { r.writeHead(404); r.end() }
})
await new Promise(ok => sv.listen(0, ok))

const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] })
const pg = await nav.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
pg.on('pageerror', e => console.error('página:', e.message))
await pg.goto(`http://127.0.0.1:${sv.address().port}/escenas.html?formato=${FORMATO}`, { waitUntil: 'networkidle' })
await pg.evaluate(() => window.listo)
const DUR = await pg.evaluate(() => window.DURACION)

if (FOTOS) {
  await mkdir(join(SALIDA, 'fotos'), { recursive: true })
  for (const t of FOTOS) {
    await pg.evaluate(t => window.cuadro(t), t)
    await pg.screenshot({ path: join(SALIDA, 'fotos', `${FORMATO}-${t.toFixed(2)}.jpg`), type: 'jpeg', quality: 88 })
  }
  await nav.close(); sv.close(); process.exit(0)
}

// 3. video mudo: cada captura va directo a ffmpeg por una tubería
await mkdir(SALIDA, { recursive: true })
const mudo = join(CUADROS, `mudo-${FORMATO}.mp4`)
const enc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mudo], { stdio: ['pipe', 'inherit', 'inherit'] })
const total = Math.round(DUR * FPS)
const inicio = Date.now()
for (let i = 0; i < total; i++) {
  await pg.evaluate(t => window.cuadro(t), i / FPS)
  const buf = await pg.screenshot({ type: 'jpeg', quality: 94 })
  if (!enc.stdin.write(buf)) await new Promise(ok => enc.stdin.once('drain', ok))
  if (i % 150 === 0) console.log(`cuadro ${i}/${total} · ${((Date.now() - inicio) / 1000).toFixed(0)} s`)
}
enc.stdin.end()
await new Promise(ok => enc.on('close', ok))
await nav.close(); sv.close()

// 4. audio. Los tiempos están en el reloj del corte maestro; el vertical salta
//    la escena de Genesis ID y todo lo que viene después se corre DESPLAZA segundos.
const SALTO = 26.2, DESPLAZA = 8.2, VOZ = 1.0, MUSICA = 4.8
const v = FORMATO === '9x16'
const aCorte = t => (v && t >= 34.3 ? t - DESPLAZA : t)
const efectos = [
  ['neon', 0.78, 0.45], ['paso', 4.5, 0.3], ['neon', 6.15, 0.4], ['neon', 11.4, 0.35], ['paso', 12.6, 0.3],
  ['cobro', 16.62, 0.55], ['paso', 17.1, 0.3], ['paso', 19.3, 0.3], ['cobro', 23.15, 0.55], ['paso', 30.55, 0.3], ['neon', 34.55, 0.45],
].filter(([, t]) => !v || t < SALTO || t >= 34.3).map(([n, t, g]) => [n, aCorte(t), g])

const A = f => join(AQUI, 'media/audio', f)
const entradas = ['-i', A('musica.mp3'), '-i', A('voz.mp3'), '-i', A('sfx-neon.mp3'), '-i', A('sfx-cobro.mp3'), '-i', A('sfx-paso.mp3')]
const idx = { neon: 2, cobro: 3, paso: 4 }
const cuenta = { neon: 0, cobro: 0, paso: 0 }
efectos.forEach(([n]) => cuenta[n]++)
let g = ''
for (const n of Object.keys(idx)) g += `[${idx[n]}]aformat=channel_layouts=stereo,asplit=${cuenta[n]}${Array.from({ length: cuenta[n] }, (_, i) => `[${n}${i}]`).join('')};`
const usados = { neon: 0, cobro: 0, paso: 0 }
const sfx = efectos.map(([n, t, gan], i) => { g += `[${n}${usados[n]++}]adelay=${Math.round(t * 1000)}:all=1,volume=${gan}[e${i}];`; return `[e${i}]` })
const fin = DUR
if (!v) {
  g += `[0]atrim=start=${MUSICA},asetpts=PTS-STARTPTS[m0];`
  g += `[1]aformat=channel_layouts=stereo,adelay=${VOZ * 1000}:all=1,asplit=2[voz][lado];`
} else {
  g += `[0]asplit=2[ma][mb];[ma]atrim=start=${MUSICA}:end=${MUSICA + SALTO},asetpts=PTS-STARTPTS[m1];`
  g += `[mb]atrim=start=${MUSICA + SALTO + DESPLAZA},asetpts=PTS-STARTPTS[m2];[m1][m2]acrossfade=d=0.12[m0];`
  g += `[1]aformat=channel_layouts=stereo,asplit=2[va][vb];[va]atrim=end=25.3,adelay=${VOZ * 1000}:all=1[v1];`
  g += `[vb]atrim=start=33.55,asetpts=PTS-STARTPTS,adelay=${Math.round((33.55 + VOZ - DESPLAZA) * 1000)}:all=1[v2];`
  g += `[v1][v2]amix=inputs=2:normalize=0,asplit=2[voz][lado];`
}
g += `[m0]volume=0.62,afade=t=out:st=${(fin - 2.7).toFixed(2)}:d=2.6[m];`
g += `[m][lado]sidechaincompress=threshold=0.035:ratio=5:attack=20:release=450[mdu];`
g += `[mdu][voz]${sfx.join('')}amix=inputs=${2 + sfx.length}:normalize=0,atrim=end=${fin},loudnorm=I=-14:TP=-1.5:LRA=11[aud]`

const final = join(SALIDA, `mytokenpay-trailer-${FORMATO}.mp4`)
ff([...entradas, '-i', mudo, '-filter_complex', g, '-map', '5:v', '-map', '[aud]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', final])
console.log('listo:', final)

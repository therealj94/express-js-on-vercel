import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
const RAIZ = process.argv[2], PUERTO = +process.argv[3]
const T = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf','.json':'application/json','.ico':'image/x-icon' }
createServer(async (q, r) => {
  let p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]))
  try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html') } catch { p = join(RAIZ, 'index.html') }
  try { r.writeHead(200, { 'Content-Type': T[extname(p)] || 'application/octet-stream' }); r.end(await readFile(p)) } catch { r.writeHead(404); r.end() }
}).listen(PUERTO)

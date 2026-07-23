#!/usr/bin/env node
// Deja el ecosistema en "modo conectado": detecta tu IP local y escribe el
// archivo .env de cada app apuntando al motor Genesis ID real. Después solo
// corres el backend y cada app con Expo.
import { networkInterfaces } from 'os'
import { writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 4000

function lanIP() {
  const ifaces = networkInterfaces()
  const candidates = []
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) candidates.push({ name, address: net.address })
    }
  }
  // preferir rangos privados típicos de Wi-Fi
  const pref = candidates.find((c) => /^192\.168\./.test(c.address)) ||
    candidates.find((c) => /^10\./.test(c.address)) ||
    candidates.find((c) => /^172\.(1[6-9]|2\d|3[01])\./.test(c.address)) ||
    candidates[0]
  return pref ? pref.address : null
}

const ip = process.argv[2] || lanIP()
if (!ip) {
  console.error('\n✖ No pude detectar tu IP local. Pásala manualmente:\n  npm run connect -- 192.168.1.50\n')
  process.exit(1)
}
const url = `http://${ip}:${PORT}`

const targets = [
  { label: 'Veta Wallet', file: join(__dirname, '..', 'veta-wallet-app', '.env') },
  { label: 'MyTokenPay', file: join(__dirname, '..', 'mytokenpay-app', 'mobile', '.env') },
]

let wrote = 0
for (const t of targets) {
  const dir = dirname(t.file)
  if (!existsSync(dir)) {
    console.warn(`⚠ No encontré ${t.label} en ${dir} — omitido.`)
    continue
  }
  writeFileSync(t.file, `EXPO_PUBLIC_GENESIS_URL=${url}\n`)
  console.log(`✓ ${t.label}: ${t.file} → ${url}`)
  wrote++
}

console.log(`
────────────────────────────────────────────────────────
  Modo conectado listo (IP detectada: ${ip})
────────────────────────────────────────────────────────
  1) Motor Genesis ID (esta carpeta):
       npm install && npm run dev
     Admin en vivo:  ${url}/admin

  2) En cada app, reinicia Expo con caché limpio para tomar el .env:
       (veta-wallet-app)      npx expo start -c
       (mytokenpay-app/mobile) npx expo start -c

  Tu teléfono y tu compu deben estar en la MISMA red Wi-Fi.
  Lo que registres/verifiques en una app se verá en la otra y en /admin.
────────────────────────────────────────────────────────
`)
if (!wrote) process.exit(1)

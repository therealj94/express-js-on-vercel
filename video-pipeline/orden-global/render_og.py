"""Renderiza trailer.html cuadro a cuadro: python3 render.py DESDE HASTA DIR [t1,t2,... para pruebas]"""
import sys, asyncio, os
from playwright.async_api import async_playwright
CH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
async def main():
    a, b, d = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    ts = [float(x) for x in sys.argv[4].split(',')] if len(sys.argv) > 4 else None
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path=CH, args=ARGS)
        pg = await br.new_page(viewport={'width': 1080, 'height': 1920})
        pg.on('console', lambda m: print('consola:', m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: print('ERROR:', e))
        await pg.goto('http://127.0.0.1:8767/og.html')
        await pg.wait_for_function('window.LISTO === true', timeout=180000)
        lista = [(f'{d}/t{t:05.2f}.jpg', t) for t in ts] if ts else [(f'{d}/{n:05d}.jpg', n / 30) for n in range(a, b)]
        for f, t in lista:
            await pg.evaluate(f'window.setT({t})')
            await pg.screenshot(path=f, type='jpeg', quality=94)
        await br.close()
asyncio.run(main())

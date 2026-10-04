import sys
from playwright.sync_api import sync_playwright
url, sal = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width':1080,'height':1920})
    pg.on('console', lambda m: print('consola:', m.text))
    pg.on('pageerror', lambda e: print('error:', e))
    pg.goto(url); pg.wait_for_function('window.LISTO === true', timeout=180000)
    pg.screenshot(path=sal); b.close()

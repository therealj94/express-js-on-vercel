from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
    pg = b.new_page(viewport={'width':1080,'height':1920})
    pg.on('pageerror', lambda e: print('error:', e))
    for i in range(1,18):
        pg.goto(f'http://127.0.0.1:8765/cuadros.html?f={i}'); pg.wait_for_function('window.LISTO === true', timeout=30000)
        pg.screenshot(path=f'../cuadros/K{i:02d}.png')
    b.close()

from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width':1080,'height':1920})
    pg.on('pageerror', lambda e: print('error:', e))
    pg.goto('http://127.0.0.1:8765/orbe.html?clean'); pg.wait_for_timeout(4000)
    pg.screenshot(path='../F03a_orbe.png')
    pg.evaluate("window.AuraFace.setState('speaking'); window.AuraFace.say('Hola', {dur: 2.5})")
    for i,ms in enumerate([700,700,900]):
        pg.wait_for_timeout(ms); pg.screenshot(path=f'../F03b_hola_{i}.png')
    print(pg.evaluate("JSON.stringify(window.AuraFace.stats)"))
    b.close()

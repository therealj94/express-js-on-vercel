"""Captura el tráiler cuadro a cuadro y lo codifica en H.264.

Uso:
  python3 capturar.py muestras 1.0 3.0 7.5     # PNG sueltos para revisar
  python3 capturar.py video salida.mp4          # 900 cuadros → MP4 sin audio
"""
import base64, os, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

AQUI = Path(__file__).resolve().parent
FFMPEG = os.environ.get('FFMPEG', '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2')
CHROME = os.environ.get('CHROME', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
FPS, DUR = 30, 30


def abrir(p):
    nav = p.chromium.launch(executable_path=CHROME, args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
        '--allow-file-access-from-files'])
    pag = nav.new_page(viewport={'width': 1080, 'height': 1920})
    errores = []
    pag.on('pageerror', lambda e: errores.append(str(e)))
    pag.on('console', lambda m: m.type == 'error' and errores.append(m.text))
    pag.goto((AQUI / 'trailer.html').as_uri())
    pag.wait_for_function('window.listo !== undefined')
    pag.evaluate('window.listo')
    if errores:
        raise SystemExit('\n'.join(errores))
    return nav, pag


def cuadro(pag, t):
    url = pag.evaluate(f'renderFrame({t})')
    return base64.b64decode(url.split(',', 1)[1])


def main():
    modo = sys.argv[1]
    with sync_playwright() as p:
        nav, pag = abrir(p)
        if modo == 'muestras':
            dest = Path(os.environ.get('DEST', '/tmp/claude-0/trailer-muestras'))
            dest.mkdir(parents=True, exist_ok=True)
            for s in sys.argv[2:]:
                t0 = time.time()
                (dest / f't{float(s):05.2f}.jpg').write_bytes(cuadro(pag, float(s)))
                print(s, f'{time.time() - t0:.2f}s')
        else:
            salida = sys.argv[2]
            ff = subprocess.Popen([FFMPEG, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS),
                                   '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
                                   '-pix_fmt', 'yuv420p', '-movflags', '+faststart', salida], stdin=subprocess.PIPE)
            t0 = time.time()
            for f in range(FPS * DUR):
                ff.stdin.write(cuadro(pag, f / FPS))
                if f % 60 == 0:
                    print(f, f'{time.time() - t0:.0f}s', flush=True)
            ff.stdin.close()
            ff.wait()
        nav.close()


if __name__ == '__main__':
    main()

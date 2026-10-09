"""Fija el cuerpo: pega la foto original debajo de la línea y (con borde suave) sobre el clip de lipsync,
así solo se anima la cabeza y no aparecen alas. Uso: python3 fija.py clip.mp4 foto.png y salida.mp4 [pluma]"""
import sys, cv2, numpy as np, subprocess
clip, foto, y0, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]; pl = int(sys.argv[5]) if len(sys.argv) > 5 else 140
v = cv2.VideoCapture(clip); fps = v.get(5); w, h = int(v.get(3)), int(v.get(4))
st = cv2.resize(cv2.imread(foto), (w, h), interpolation=cv2.INTER_AREA).astype(np.float32)
m = np.clip((np.arange(h)[:, None] - (y0 - pl / 2)) / pl, 0, 1).astype(np.float32); m = m * m * (3 - 2 * m); m = np.repeat(m, w, 1)[..., None]
p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', str(fps), '-i', '-', '-i', clip,
                      '-map', '0:v', '-map', '1:a?', '-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p', '-c:a', 'copy', out], stdin=subprocess.PIPE)
# color: igualar el brillo de la foto al primer cuadro del clip en la zona fija
ok, f0 = v.read(); zona = slice(y0, h)
g = (f0[zona].astype(np.float32).mean((0, 1)) + 1) / (st[zona].mean((0, 1)) + 1); st = np.clip(st * g, 0, 255)
while ok:
    f = f0.astype(np.float32); p.stdin.write((f * (1 - m) + st * m).astype(np.uint8).tobytes()); ok, f0 = v.read()
p.stdin.close(); p.wait(); print('ok', out)

"""Versión de 43 s: inserta un puente nocturno de 16 pulsos entre el verso y el coro (en b(41)).
Puente = la caída instrumental del jingle (b15–b23) dos veces: primero filtrada (lejana, «de noche»), luego abierta.
El último medio pulso queda en silencio para que el golpe de bajo marque la entrada del coro."""
import numpy as np, subprocess, json
SR = 48000; BEAT = 0.5357; B0 = -0.012; b = lambda n: B0 + n * BEAT
y = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', 'musica/v2_C.mp3', '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout, np.float32).reshape(-1, 2).copy()
I = lambda t: int(round(t * SR))
corte = b(41) - .02; INS = 16 * BEAT
X = y[I(b(15)):I(b(23))].copy()                       # 8 pulsos instrumentales
def paso_bajo(a, fc):
    from scipy.signal import butter, sosfiltfilt
    return sosfiltfilt(butter(4, fc, fs=SR, output='sos'), a, axis=0).astype(np.float32)
n = len(X); env = np.linspace(0, 1, n)[:, None]
A1 = paso_bajo(X, 500) * 1.25                          # 8 pulsos lejanos
A2 = X * 1.0                                           # 8 pulsos abiertos
# barrido de filtro en la 2.ª mitad del primer bloque para abrir hacia el segundo
lp_hi = paso_bajo(X, 2500); A1[n // 2:] = A1[n // 2:] * (1 - env[:n - n // 2] ) + lp_hi[n // 2:] * env[:n - n // 2]
P = np.concatenate([A1, A2])
P = P[:I(INS)] if len(P) >= I(INS) else np.pad(P, ((0, I(INS) - len(P)), (0, 0)))
P[-I(BEAT * .5):] *= np.linspace(1, 0, I(BEAT * .5))[:, None] ** 3     # hueco antes del coro
pre, post = y[:I(corte)].copy(), y[I(corte):].copy()
cf = I(.25); pre_tail = pre[-cf:] * np.linspace(1, 0, cf)[:, None]          # la cola de «mí» se funde con el puente
P[:cf] = P[:cf] * np.linspace(0, 1, cf)[:, None] + pre_tail
pre = pre[:-cf]
post[:I(.012)] *= np.linspace(0, 1, I(.012))[:, None]
out = np.concatenate([pre, P, post])
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', 'musica/v2_C_ext.wav'], input=out.tobytes())
json.dump({'corte': round(corte, 4), 'ins': INS, 'dur': len(out) / SR}, open('musica/ext.json', 'w'))
print('dur', len(out) / SR, 'inserción en', corte, '+', INS)

"""Sonido del anuncio B, hecho sobre los tiempos reales del montaje.

El ventilador es el hilo del bucle: el mismo zumbido en 1985, 2005 y hoy.
Y en el segundo 35,9 —cuando ella sale a la calle— desaparece de golpe.
Ese silencio repentino es el respiro de toda la pieza y no cuesta nada.
"""
import numpy as np, soundfile as sf
SR, D = 48000, 64.33
N = int(SR*D); t = np.arange(N)/SR
rng = np.random.default_rng(11)

def pb(x, c):
    a = np.exp(-2*np.pi*c/SR); y = np.zeros_like(x); p = 0.0
    for i, v in enumerate(x):
        p = (1-a)*v + a*p; y[i] = p
    return y

def ventana(a, b, s=0.3, e=0.3):
    v = np.zeros(N); i0, i1 = int(a*SR), int(b*SR)
    v[i0:i1] = 1.0
    ns, ne = int(s*SR), int(e*SR)
    v[i0:i0+ns] = np.linspace(0,1,ns); v[i1-ne:i1] = np.linspace(1,0,ne)
    return v

ruido = pb(rng.standard_normal(N), 2200)

# El ventilador: zumbido grave con una palpitación lenta, como un aspa girando.
aspa = 0.5 + 0.5*np.sin(2*np.pi*1.35*t)
vent = (0.055*np.sin(2*np.pi*104*t) + 0.03*np.sin(2*np.pi*156*t)) * (0.75+0.25*aspa)
vent += pb(rng.standard_normal(N), 700)*0.02*aspa

# Sala de espera: el ventilador y un rumor bajo. Cada época, una capa más.
sala = (vent + pb(ruido,1200)*0.030) * ventana(0.0, 11.96)      # 1985
sala += (vent + pb(ruido,1400)*0.038) * ventana(11.96, 23.92)   # 2005
sala += (vent + pb(ruido,1700)*0.048) * ventana(23.92, 35.88)   # hoy, la más ruidosa
calle = pb(ruido,900)*0.030 * ventana(35.9, 57.26, 0.5, 1.2)    # y aquí ya no hay ventilador

def golpe(cuando, f, dur, niv, ruidoso=0.4):
    n = int(dur*SR); e = np.exp(-np.arange(n)/(dur*0.22*SR))
    x = (np.sin(2*np.pi*f*np.arange(n)/SR)*(1-ruidoso)
         + rng.standard_normal(n)*ruidoso) * e * niv
    s = np.zeros(N); i = int(cuando*SR); m = min(n, N-i); s[i:i+m] += x[:m]
    return s

def roce(cuando, dur=0.45, niv=0.05):
    n = int(dur*SR); b = rng.standard_normal(n); b -= pb(b, 800)
    env = np.hanning(n) * (0.6+0.4*rng.random(n))
    s = np.zeros(N); i = int(cuando*SR); m = min(n, N-i); s[i:i+m] += (b*env*niv)[:m]
    return s

fx = (roce(5.6) + roce(17.6) + roce(29.6)                    # la carpeta al deslizarse
      + golpe(9.6, 150, 0.30, 0.10) + roce(9.9, 0.5, 0.055)  # y al volver, tres veces
      + golpe(21.6, 150, 0.30, 0.10) + roce(21.9, 0.5, 0.055)
      + golpe(33.6, 150, 0.30, 0.10) + roce(33.9, 0.5, 0.055))

x = sala + calle + fx
x /= np.max(np.abs(x)) + 1e-9
x *= 0.40
sf.write("amb_b.wav", np.column_stack([x, x]), SR)
print(f"amb_b.wav {D}s · pico {20*np.log10(np.max(np.abs(x))):.1f} dBFS")
print("el ventilador se corta en el segundo 35,9")

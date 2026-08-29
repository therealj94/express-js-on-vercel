# Modo calidad — cerrar la brecha con Seedance 2.5

Premisa distinta a `COSTOS.md`: pocas tomas, cada una lo mejor posible, con muchos
intentos por toma. Eso cambia la GPU, el modo de trabajo y el orden del pipeline.

---

## 1. La GPU cambia: 96 GB en BF16, no 32 GB cuantizados

| GPU | $/h en Vast | Precisión de H3 | Para calidad |
|---|---|---|---|
| **RTX PRO 6000 WS 96 GB** | **~$0.67** | **BF16 completo** (61.7 GB difusión + 48 GB text encoder) | **Esta.** Sin cuantizar, sin offload, sin thrashing |
| RTX PRO 6000 Server 96 GB | ~$0.97 | BF16 | Igual, más cara |
| RTX 5090 32 GB | ~$0.35 | INT8 / FP8 | Solo para barridos de semillas baratos |

La cuantización a INT8 se nota exactamente donde importa en modo calidad: microtextura
de piel, pelo, reflejos, bordes en movimiento. Por **$0.32/h de diferencia** trabajas en
BF16 — es la mejora de calidad más barata de todo el pipeline, y no requiere tocar un
prompt.

---

## 2. La cadena que de verdad cierra la brecha

El modelo es solo un eslabón. Seedance no gana por magia, gana por *pipeline*. Este es
el equivalente reconstruible:

```
1. STILL      Qwen-Image / FLUX  ->  primer frame a alta resolución
                                     composición, luz, encuadre, personaje
                                     coste: segundos, céntimos
2. MOVIMIENTO H3 Ref2VA (I2V)    ->  anima desde ese still
                                     + hasta 9 img / 3 vídeo / 3 audio de referencia
3. SELECCIÓN  6-10 semillas       ->  832x480, 5 s, elige UNA
                                     coste: ~$0.03 cada intento
4. UPSCALE    SeedVR2             ->  768p -> 2K/4K, consistencia temporal
                                     sustituye al Regenerate-2K cerrado de MiniMax
5. FLUIDEZ    RIFE / GIMM-VFI     ->  24 -> 48/60 fps si el movimiento lo pide
6. ACABADO    DaVinci Resolve     ->  grade, grano, mezcla de audio (gratis)
```

**El paso 1 es el que más calidad aporta y casi nadie lo hace.** Un I2V desde un still
excelente supera siempre a un T2V, porque dejas de rezarle al muestreador para que
acierte la composición: ya la fijaste tú, a resolución alta, por céntimos. El vídeo solo
tiene que mover algo que ya está bien.

El paso 4 es el segundo: el 768p nativo de H3 no compite con el 4K de Seedance, pero
768p bien generado + SeedVR2 sí aguanta la comparación en un plano de 5–10 s.

`02_install_cloud.sh` instala SeedVR2, la interpolación de frames y el modelo de imagen
cuando `QUALITY_CHAIN=1` (por defecto).

---

## 3. Modo de trabajo: interactivo, no cola desatendida

La cola de `03_run_queue.py` es para volumen. En modo calidad se usa distinto:

- **Interactivo por túnel SSH** para componer la toma:
  `ssh -p PUERTO -L 8188:127.0.0.1:8188 root@HOST` y trabajas en ComfyUI como si fuera local.
- **La cola, solo para barridos de semillas.** Usa `seeds: [101,102,...]` en el job: genera
  8 candidatos de la misma toma mientras tú revisas los anteriores. Es la forma correcta
  de "equivocarse barato".
- **Escalera de resolución.** Nunca explores a resolución final: 832×480 / 5 s para elegir,
  y solo la ganadora sube a 768p + SeedVR2. Explorar en alta es tirar dinero.

Regla práctica: **10 intentos malos a $0.03 valen más que 1 intento caro.** El error es
el método, no un fallo — por eso conviene que cada intento sea trivialmente barato.

---

## 4. Costo real del modo calidad

Sesión típica: 4 h en RTX PRO 6000 WS a $0.67/h.

| | |
|---|---|
| Compute por sesión | **$2.70** |
| Instalación + descarga en frío (~45 min) | $0.50 |
| Tráfico (~70 GB) | ~$0.70 |
| **Sesión completa** | **~$4** |
| Rinde | 20–40 candidatos + 3–6 tomas finales con upscale |
| **3 sesiones al mes** | **~$12** |
| Las mismas 6 tomas finales en Seedance 2.5, sin intentos fallidos | ~$7 |
| Con 8 intentos por toma (realista) | ~$55 |

Ahí está el punto: **la API es más barata si aciertas a la primera; alquilar es más
barato porque no aciertas a la primera.** Cuando iteras mucho, el costo marginal del
intento decide, y el tuyo es $0.03 contra $1.15.

---

## 5. Dónde Seedance 2.5 sigue ganando, y qué hacer

| Ventaja de Seedance | Alternativa local |
|---|---|
| Tomas de 30 s, hasta ~3 min | H3 llega a 15 s (~30 s extendido). **Corta más**: planos de 5–8 s bien montados leen mejor que uno largo mediocre |
| 4K nativo | 768p + SeedVR2 a 2K/4K. Diferencia pequeña tras el grade |
| Coherencia en tomas largas | LoRA de personaje en Wan 2.2 + referencias Ref2VA de H3 |
| Edición interactiva, timestamps por segundo | Montaje en DaVinci. Más trabajo manual, mismo resultado |
| 50 referencias, whitebox 3D, greenscreen | 9 img + 3 vídeo + 3 audio en H3. Suficiente para plano único |

**Uso honesto de la API:** guárdala para la toma héroe que no logres clavar en local.
No es rendirse, es asignar bien el presupuesto — $1.15 en el plano que abre la pieza está
bien gastado.

---

## 6. Los tres errores que cuestan calidad (y no dinero)

1. **Explorar a resolución final.** Cada intento cuesta 5× más y ves lo mismo.
2. **T2V cuando podías hacer I2V.** Estás delegando la composición a la suerte.
3. **Saltarse el grade.** Un clip sin corrección de color se ve "de IA" aunque el modelo
   sea perfecto. DaVinci es gratis y aporta más que subir de 30 a 50 pasos de sampler.

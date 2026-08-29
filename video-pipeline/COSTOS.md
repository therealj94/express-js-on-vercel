# Modelo de costos — pipeline alquilado (agosto 2026)

> **Desglose actualizado y de abajo hacia arriba en [`COSTOS_REALES.md`](./COSTOS_REALES.md)**,
> calculado con `tools/costo.py`. Este documento explica la mecánica de cobro de Vast;
> las cifras finales están allí.

Decisión tomada: **alquilar, no comprar**. Una RTX 5090 en calle está en $4,700–5,000
(MSRP $1,999) por la crisis de GDDR7, que no se normaliza antes de Q4-2026. La misma
GPU en Vast.ai cuesta $0.31–0.45/h; el punto de equilibrio de la compra son ~18,500
horas de render.

---

## 1. Las tres líneas de la factura

`total = (compute $/h × horas) + (storage $/GB-h × GB × horas asignadas) + (ancho de banda × $/GB)`

| Concepto | Rango típico | Comentario |
|---|---|---|
| Compute RTX 5090 | $0.31–0.45/h | Blackwell: FP8 y NVFP4 nativos, que es lo que usan los checkpoints de H3 |
| Compute A100 80 GB | $0.80–1.40/h | **Evitar**: Ampere emula FP8/FP4, pagas más por ir más lento |
| Storage | $0.10–0.15/GB/mes | **Se cobra igual con la instancia detenida** |
| Ancho de banda | $0–0.02/GB según host | Filtrado en `01_vast_create_pod.sh` con `inet_down_cost` |

### La trampa que hay que evitar

Mantener un volumen de 350 GB con los pesos entre sesiones cuesta **$35–52 al mes**,
más que todo el compute de una producción normal. Y *detener* la instancia no para el
cobro de disco: solo destruirla lo hace.

**Regla operativa: destruir siempre.** Volver a bajar los pesos cada sesión (~70 GB a
>500 Mbps ≈ 15 min ≈ $0.09 de compute + ~$0.70 de tráfico) sale entre 20 y 50 veces
más barato que dejar el disco vivo. Por eso `04_collect_and_shutdown.sh` destruye por
defecto y `02_install_cloud.sh` es idempotente y re-descargable.

---

## 2. Costo por clip (5 s, 832×480, 30 pasos, RTX 5090)

| | Tiempo | Costo |
|---|---|---|
| Generación H3 | 2–5 min | **$0.02–0.04** |
| Generación Wan 2.2 14B | 3–6 min | $0.02–0.05 |
| Clip de 15 s a 768p | 15–25 min | $0.09–0.19 |
| API MiniMax H3 (~$0.08/s) | inmediato | $0.40 |
| API Seedance 2.5 (~$0.23/s) | inmediato | $1.15 |

Alquilar sale ~10× más barato que la API de H3 por clip — **una vez que la cola está
definida**. Iterar prompts sobre GPU alquilada anula esa ventaja, porque pagas por hora
mientras piensas.

---

## 3. Presupuestos mensuales

Incluyen el arranque en frío (instalación + descarga ≈ 45 min por sesión) y un 30 % de
margen por tomas descartadas.

| Escenario | Clips/mes | Sesiones | Horas GPU | **Costo/mes** |
|---|---|---|---|---|
| Piloto — validar el flujo | 50 | 2 | ~6 h | **$5–8** |
| Producción — contenido regular | 200 | 4 | ~14 h | **$12–20** |
| Estudio — campaña completa | 1,000 | 12 | ~60 h | **$55–85** |
| Lo mismo vía API de H3 | 200 | — | — | $80 |
| Lo mismo vía API Seedance 2.5 | 200 | — | — | $230 |

Comparación honesta: por debajo de ~50 clips al mes **la API sale mejor**, porque el
arranque en frío domina la factura y no gastas tiempo en operar nada.

---

## 4. Beneficios y contrapartidas

**A favor del alquiler**
- Capex cero y sin exposición a un mercado de GPUs con precios al doble.
- Cambias de GPU según la toma: 5090 para la cola, 96 GB solo el día que entrenes un LoRA.
- Sin límites de contenido, sin cuotas por segundo, sin cola de proveedor.
- Los pesos de H3 y Wan 2.2 son tuyos: LoRAs propios, control total del sampler.
- Escala horizontal: 4 pods en paralelo cuestan lo mismo que uno durante 4× el tiempo, y entregan hoy.

**En contra**
- Arranque en frío de 30–45 min por sesión (mitigado con colas grandes, no con muchas pequeñas).
- El local **no** iguala la demo de la API: `Context-IR` y `Regenerate-2K` de MiniMax no son públicos; el upscale a 2K lo pones tú (SeedVR2 / Topaz).
- Riesgo de host: por eso los filtros `reliability > 0.99` y `verified=true`.
- Una instancia olvidada factura sola. De ahí `watchdog_spend.sh` y `MAX_SPEND_USD`.
- Licencia de H3: el despliegue local con pesos está excluido en US/EU/UK/KR, y organizaciones con ingresos ≥ US$20M requieren autorización previa.

---

## 5. Higiene de costos (lo que de verdad ahorra dinero)

1. **Una cola grande al mes, no cinco pequeñas.** El arranque en frío es el gasto fijo.
2. **Prototipa por API, produce alquilando.** Prompts cerrados antes de encender la GPU.
3. **832×480 y 5 s para elegir tomas**; sube resolución y duración solo en la elegida.
4. **`MAX_SPEND_USD` siempre puesto.** El watchdog rescata las salidas antes de destruir.
5. **`AUTO_DESTROY=1`.** Un pod olvidado un fin de semana son ~$35 en compute más disco.
6. **Nada de instancias interrumpibles** para colas largas: `INTERRUPTIBLE=0` por defecto.
7. **Verifica el manifiesto antes de destruir** — ya lo hace `04_collect_and_shutdown.sh`.

# 🔥 Configuración TURBO 10% — hoja de valores (cuenta $1000, XAUUSDm, servidor GMT+0)

Riesgo real por operación: **10%** · TP2: **3R** · Umbral efectivo: **62**

> El modo Turbo **multiplica tu riesgo ×2**. Por eso se pone `5.0` y no `10.0`.
> Turbo también baja el umbral 8 puntos (70 → 62), sube el TP2 a 3R mínimo
> y reduce la espera entre entradas a la mitad.

## Parámetros a cambiar (F7 sobre el gráfico → "Parámetros de entrada")

### ⚙️ General
| Parámetro | Valor |
|-----------|-------|
| Score mínimo | `70` (Turbo lo baja solo a 62) |
| Ventana de operación | `0` (solo killzones) |
| Minutos mínimos entre entradas | `60` (Turbo lo reduce solo a 30) |

### 🕐 Sesiones — TUS horarios (servidor GMT+0)
| Parámetro | Valor |
|-----------|-------|
| Killzone Londres: inicio | `07:00` |
| Killzone Londres: fin | `10:00` |
| Killzone Nueva York: inicio | `12:30` |
| Killzone Nueva York: fin | `15:30` |
| Londres+NY completo: inicio | `06:00` |
| Londres+NY completo: fin | `21:00` |

### 🎚 Lote y agresividad ← **el corazón de esta configuración**
| Parámetro | Valor |
|-----------|-------|
| Lote (0=auto · 1=fijo) | `0` |
| **Agresividad** | **`2`** (Turbo) |

### 💰 Riesgo y protección
| Parámetro | Valor | Por qué |
|-----------|-------|---------|
| **Riesgo por operación (%)** | **`5.0`** | ×2 del Turbo = **10% real** |
| Máximo de operaciones por día | `6` | |
| Máximo de pérdidas por día | `2` | Peor día: −19% |
| **Freno de emergencia diario (%)** | **`20.0`** | ⚠️ Obligatorio: con 3% se apagaría tras la primera pérdida |
| **Objetivo diario (%)** | **`20.0`** | Un TP2 completo = +20% → día cerrado |
| Objetivo diario ($) | `0` | Se usa el % |
| Límite de pérdida diaria ($) | `0` | Se usa el % |
| Cerrar posición al llegar al objetivo | `true` | Asegura el resultado |
| Spread máximo ($) | `0.35` | Si omite muchas señales, sube a `0.45` |

### 🚪 Salida inteligente ← **más importante que nunca al 10%**
| Parámetro | Valor | Por qué |
|-----------|-------|---------|
| Vigilar la salud | `true` | |
| **Salud mínima antes de cerrar** | **`45`** | Sube de 40 a 45: sale antes. A 10%, cortar en −0.5R en vez de −1R salva $50 cada vez |
| Velas de gracia | `2` | |
| Contar estancamiento | `true` | |

### 🎯 SL / TP — no tocar
Ya están afinados. Turbo sube el TP2 a 3R y ciñe el trailing a 1.2×ATR automáticamente.

### 🔔 Notificaciones
| Parámetro | Valor |
|-----------|-------|
| Push al móvil | `true` (tras configurar tu MetaQuotes ID) |

---

## Tus números con $1000

| Evento | Resultado |
|--------|-----------|
| 1 operación ganadora completa (TP1 1R + TP2 3R) | **+$200 (+20%)** → objetivo del día, bot descansa |
| 1 pérdida | −$100 (−10%) |
| 2 pérdidas → día cerrado | **−$190 (−19%)** |
| Salida inteligente temprana | ≈ −$40 a −$60 en vez de −$100 |
| Racha de 5 pérdidas | −41% |
| Racha de 7 pérdidas | −52% |

**El compuesto trabaja a tu favor:** el riesgo es % del equity, así que al crecer la cuenta el lote sube solo. Tres días buenos seguidos: $1000 → $1200 → $1440 → $1728.

---

## Antes de darle a Aceptar

1. **Verifica el apalancamiento** de tu cuenta: con 10% de riesgo el lote sube bastante. Si es menor a 1:200, el bot recortará el lote por margen (es una protección, pero opera más chico de lo que esperas).
2. **Corre el Probador (Ctrl+R)** con esta configuración y 6 meses. Mira **"Reducción máxima de balance"**. Es el número que te dice si esta configuración habría sobrevivido el año.
3. **Vigila los primeros 10 trades a diario.** Al 10%, dos días malos cambian la cuenta de forma seria.

---

## Si quieres bajar un escalón después

Cambia solo **Riesgo por operación** de `5.0` a:
- `3.5` → 7% real
- `2.5` → 5% real (agresivo pero mucho más sostenible)
- `1.5` → 3% real

Nada más hay que tocar; el resto de la configuración Turbo sigue funcionando igual.

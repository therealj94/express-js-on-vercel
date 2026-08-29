# Camino sin terminal — todo desde el navegador (iPad incluido)

No necesitas SSH, ni clave SSH, ni instalar nada en tu equipo. El pod se instala
solo al arrancar y ComfyUI queda accesible desde el navegador con usuario y clave.

---

## 1. Preparar (una vez)

- **Acepta la licencia**: entra a `huggingface.co/MiniMaxAI/MiniMax-H3` con tu cuenta
  y pulsa aceptar. Sin esto la descarga falla y pagas 30 min de GPU para nada.
- **Token de HF** tipo *read* a mano (`huggingface.co/settings/tokens`).

## 2. Crear la plantilla en Vast

`cloud.vast.ai` → **Templates** → **New Template**:

| Campo | Valor |
|---|---|
| Image | `pytorch/pytorch:2.7.0-cuda12.8-cudnn9-devel` |
| Docker options | `-p 8188:8188` |
| Disk | `350` GB |
| Environment | `HF_TOKEN` = tu token · `UI_PASS` = la clave que quieras para entrar · `UI_USER` = tu usuario |
| On-start Script | pega **todo** el contenido de [`cloud/onstart.sh`](./cloud/onstart.sh) |

Guarda la plantilla. Solo se hace una vez: las siguientes sesiones la reutilizas.

## 3. Buscar máquina y arrancar

**Search** → filtros en la barra superior:

- GPU: **RTX PRO 6000 WS** (96 GB) — o RTX 5090 si buscas lo más barato
- Precio máximo: **$1.00/h**
- **Verified** activado
- Reliability: **> 0.99**
- Download: **> 500 Mbps**
- Ordenar por **precio ascendente**

Elige la primera de la lista → **Rent** con tu plantilla seleccionada.

## 4. Esperar y entrar

**Instances** → tu instancia → botón **Logs**. Verás el progreso del `onstart`.
Tarda 30–45 min. Al final el log imprime:

```
LISTO. Abre el puerto 8188 desde el panel de Vast.
Usuario: ...
Clave  : ...
```

Entonces, en la tarjeta de la instancia, pulsa el botón de **puertos** (el icono junto
a la IP) y abre el `8188`. Se abre ComfyUI en el navegador y te pide usuario y clave.

Ya estás generando. En ComfyUI: **Workflow → Browse Templates** → plantillas de
*MiniMax H3* y *Wan 2.2*, listas para usar con los pesos ya descargados.

## 5. Bajar los clips y destruir

- Los vídeos salen en la pestaña de resultados de ComfyUI: **descárgalos desde ahí**
  (pulsación larga en iPad → Guardar).
- Luego **Instances → Destroy**. No "Stop": detener no para el cobro del disco.

> Si el saldo llega a $0 las instancias se detienen pero **no** se destruyen, y el disco
> sigue acumulando cargos. Destruir es lo único que corta la factura del todo.

---

## Diferencias con el camino por terminal

| | Sin terminal | Con terminal (`run_all.sh`) |
|---|---|---|
| Instalación | automática al arrancar | automática |
| Generar 1 clip a la vez | ✅ | ✅ |
| Cola desatendida de 96 clips | ❌ | ✅ |
| Descarga masiva de resultados | uno a uno desde el navegador | `rsync` de todo |
| Destrucción automática al terminar | manual | automática + watchdog de gasto |

Para calibrar tomas —que es lo que harás las primeras sesiones— el camino del navegador
sobra. Cuando pases a producir tandas grandes, el terminal ahorra tiempo real.

# MiniMax H3 en AWS (Mumbai)

**27-sep-2026.** Complementa a `MINIMAX_H3.md` (lo que ya funciona en Vast).
El pod corre **el mismo `cloud/onstart.sh` en la misma imagen Docker**: el
runner, la cola desatendida, la entrega a Hugging Face y `encolar.py` no
cambian. Lo nuevo es el anfitrión (`cloud/aws_arranque.sh`) y el mando
(`tools/aws_api.py`).

---

## 0. Por qué Mumbai

La licencia de MiniMax H3 **excluye EE. UU., la UE, Reino Unido y Corea del
Sur**: ni usar el modelo ni mostrar lo que genera. Regiones de AWS con `g7e`
(RTX PRO 6000 Blackwell, 96 GB, la misma tarjeta que en Vast):

| Región | ¿Permitida? | Cupo On-Demand | Precio |
|---|---|---|---|
| us-east-1 / us-east-2 / us-west-2 | ❌ EE. UU. | — | — |
| eu-central-1 / eu-north-1 / eu-west-2 | ❌ UE / RU | — | — |
| ap-northeast-2 | ❌ Corea | — | — |
| ap-northeast-1 (Tokio) | ✅ | **0** | $4.88/h |
| **ap-south-1 (Mumbai)** | ✅ | **384 vCPU** | **$5.49/h** · Spot ~$2.04/h |

`aws_api.py` se niega a correr en una región excluida.

**Tampoco se pueden mostrar los vídeos** en esos territorios sin autorización
de MiniMax (`api@minimax.io`). Para Honduras y Latinoamérica la exclusión no
aplica. Confírmalo con un abogado antes de pautar.

H100 (`p5`) no sirve: el codificador de texto es `nvfp4`, que solo corre de
forma nativa en Blackwell.

---

## 1. Lo que ya está hecho [medido]

| | |
|---|---|
| Bucket | `og-video-cache-548380372606-ap-south-1`: privado, cifrado, `trabajos/` y `logs/` caducan a los 30 días |
| Rol del pod | `og-video-pod`: **solo** lee y escribe en ese bucket. Ni EC2 ni IAM |
| Grupo de seguridad | `og-video-sin-entradas`: **cero** reglas de entrada. Nada alcanza al pod |
| Cupo Spot G/VT | pedido 16 vCPU el 27-sep (gratis). Mientras llega: On-Demand |
| AMI | *Deep Learning Base OSS Nvidia Driver (Ubuntu 22.04)*, la más nueva en cada `create` |
| Prueba en seco | `create --seco` en `g7e.2xlarge`, spot y on-demand: OK |

---

## 2. Cómo se usa

```bash
cd video-pipeline
python3 tools/aws_api.py status                    # ¿hay algo cobrando?
python3 tools/aws_api.py precios
python3 tools/aws_api.py create --job prompts/q_aws_prueba.json \
    --env HF_TOKEN=$HF_TOKEN --env HF_REPO=Therealjose54/orden-global-videos \
    --env ESPERA_MIN=45 [--spot] [--horas 8]
python3 tools/aws_api.py logs <i-...>              # cada minuto; avisa si lleva >12 min quieto
python3 tools/encolar.py prompts/otra_cola.json    # siguiente tanda, sin apagar (igual que Vast)
python3 tools/encolar.py --fin                     # termina y la máquina se destruye sola
python3 tools/aws_api.py status                    # confirmar, nunca de memoria
```

`create` comprueba antes de crear: que no haya otra instancia de vídeo viva,
que vayan `HF_TOKEN` y `HF_REPO`, y que el grupo no tenga entradas. Después
**lee** de EC2 que apagar = destruir y que el disco se borra con la máquina.

`destroy <i-...>` solo acepta instancias con la etiqueta `Proyecto=video`: las
de Aura, OGB y Ordenex no se pueden tocar desde aquí.

---

## 3. No volver a bajarlo todo: la caché en S3

```
s3://og-video-cache-548380372606-ap-south-1/
  cache/models/...        los pesos tal cual quedan en ComfyUI/models
  cache/entorno.tar.zst   /workspace/venv + ComfyUI (código y nodos, sin pesos)
  cache/manifest.txt      "tamaño ruta" de cada peso. Se sube EL ÚLTIMO
  trabajos/<fecha>/       paquete del trabajo + secretos (se borran al leerlos)
  logs/<i-...>.log        el onstart.log, cada minuto
```

- **Primera sesión (siembra):** instala desde Hugging Face como siempre.
  Cuando `onstart.sh` confirma que no hubo `FALLO DEFINITIVO` en los pesos,
  escribe `/workspace/.instalado` y el anfitrión sube pesos y entorno a S3
  **mientras se generan los clips**. De EC2 a S3 en la misma región no se cobra
  transferencia.
- **Siguientes:** si existe `manifest.txt`, se restaura todo con `s5cmd` (64
  conexiones) y se comprueba el tamaño de cada fichero. Lo que no cuadra se
  borra y `onstart.sh` lo vuelve a bajar de HF: `baja()` salta lo que ya está
  completo.
- Almacenamiento: ~52 GB × $0.025 ≈ **$1.30/mes**.
- Para rehacer la caché (por ejemplo, con otro modelo): borrar
  `cache/manifest.txt` y la siguiente sesión siembra de nuevo.

En Vast nada de esto se activa: `onstart.sh` solo salta ficheros que ya
existen, y en un pod nuevo no existe ninguno.

---

## 4. Seguridad de gasto: dentro de la máquina

1. **`shutdown -h +HORAS`** es la primera línea del arranque. Tope duro, pase
   lo que pase, aunque este contenedor se reinicie.
2. **Apagar = destruir** (`InstanceInitiatedShutdownBehavior=terminate`) y el
   disco se borra con la máquina: no queda nada cobrando.
3. Se apaga sola al ver `TRABAJO COMPLETO` en el log (esperando, como mucho
   30 min, a que termine la siembra), o si el contenedor muere por lo que sea.
4. `logs` avisa si el log lleva más de 12 min sin moverse → `destroy`.

---

## 5. Costes esperados

| | Mumbai On-Demand $5.49 | Mumbai Spot ~$2.04 | Vast ~$1.20 |
|---|---|---|---|
| Arranque sin caché (~40 min) | ~$3.70 | ~$1.40 | ~$0.80 |
| Arranque con caché (~10 min, a medir) | ~$0.90 | ~$0.35 | — |
| Clip de calidad (~9,5 min) | ~$0.87 | ~$0.32 | ~$0.19 |
| **Prueba: siembra + 4 clips** | **~$7–8** | ~$3 | — |
| Tanda de 60 clips con caché | ~$53 | ~$20 | ~$13 |

Spot puede ser interrumpido. No se pierde lo hecho: el runner entrega cada clip
a HF al salir y el manifiesto salta lo ya generado.

---

## 6. El orden para dar AWS por bueno

- [x] Infraestructura, `aws_api.py`, arranque, prueba en seco.
- [x] Prueba de fontanería en una `t3.large` sin GPU, 27-sep, ~$0.01
      (`i-0814b7a75911bc15e`): log en S3 al minuto, secretos borrados de S3 al
      leerlos, `docker run` sin GPU → `APAGADO` → EC2 dice
      `Instance initiated shutdown`, estado `terminated`, **cero discos**
      restantes. Bajar la imagen de Docker tardó **6 min** en esa máquina
      pequeña; en la `g7e` debería ser menos. Si pesa, se guarda también en S3.
- [ ] **Sesión de siembra** en `g7e.2xlarge` con `prompts/q_aws_prueba.json`:
      los 4 primeros planos de *La llave*, idénticos salvo el id (`_aws1`),
      para compararlos lado a lado con los de Vast. Tope `--horas 3`.
- [ ] Ver en el log: `VRAM ... -> bf16`, `CACHÉ SEMBRADA`, 4 × `entregado:`,
      `APAGADO: TRABAJO COMPLETO`, y `status` vacío.
- [ ] Bajar los 4 clips de HF, MD5, y comparar con los de Vast.
- [ ] Segunda sesión corta para medir el arranque con caché.

# Tu parte

Todo lo demás está escrito, probado y en el repo. Esto es lo único que requiere tu
identidad, tu tarjeta o tu criterio artístico — y por eso no puedo hacerlo yo.

---

## A. Cuatro cosas de una sola vez (~20 minutos)

**1. Cuenta en Vast.ai + saldo**
`vast.ai` → registro → Billing → carga **$25** (cubre el mes 1 completo).
Luego Account → **API key** → cópiala.

**2. Token de Hugging Face**
`huggingface.co/settings/tokens` → New token → tipo **read** → cópialo.

**3. Aceptar la licencia de MiniMax H3** ← el que todos olvidan
Entra a `huggingface.co/MiniMaxAI/MiniMax-H3` con tu cuenta y pulsa aceptar.
Sin esto la descarga falla con 403 **a los 30 minutos** de instalación, con la GPU
ya facturando.

**4. Clave SSH en Vast**
```bash
ssh-keygen -t ed25519 -C "video-pipeline"    # Enter a todo
cat ~/.ssh/id_ed25519.pub                    # pégala en vast.ai -> Account -> SSH Keys
```

---

## B. Un comando (y esperar)

```bash
git clone <este-repo> && cd video-pipeline
pip install --upgrade vastai
cp .env.example .env && $EDITOR .env         # pega VAST_API_KEY y HF_TOKEN. Nada más.
cp prompts/queue.example.json prompts/queue.json

./run_all.sh --setup
```

`run_all.sh` hace el resto solo: preflight, elige el host fiable más barato, crea el pod,
instala todo, baja los pesos, convierte los workflows a formato API y te imprime el
comando del túnel. Si algo falla, se detiene antes de gastar de más.

Con `--setup` deja el pod vivo para que trabajes. **Sin** `--setup` hace además la cola
entera, se descarga los clips y destruye la instancia sin que intervengas.

---

## C. Lo único creativo: elegir

Con el túnel abierto y ComfyUI en tu navegador:

1. **El still.** Genera imágenes con FLUX.2 hasta que una te guste **de verdad**. Aquí se
   gana la toma; no pases al vídeo con un frame mediocre.
2. **Las semillas.** 8 candidatos de vídeo desde ese still. **Elige uno.**
3. **Anota qué funcionó** — prompt y escala del LoRA. Eso es tu receta y no la tengo yo.

Al terminar, **siempre**:
```bash
./04_collect_and_shutdown.sh
```

---

## D. Después: dime y sigo yo

Pásame:
- La salida de `./00_preflight.sh` si algo sale en rojo.
- `logs_install.txt` o `logs_queue.txt` si algo falla.
- **El tiempo real de un clip** — con ese dato `tools/costo.py` deja de estimar y te da
  tu presupuesto verdadero.
- Los prompts que quieras para el tráiler: te armo la cola JSON completa.

---

## Lo que NO tienes que hacer

Ni instalar drivers, CUDA o Python. Ni buscar hosts a mano. Ni exportar workflows desde
el navegador. Ni calcular cuántos frames son 5 segundos. Ni acordarte de apagar el pod.
Todo eso ya está resuelto en el repo.

**Regla única que sí depende de ti: destruye el pod al terminar.** El disco se cobra
aunque la instancia esté detenida.

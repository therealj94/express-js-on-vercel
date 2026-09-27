#!/usr/bin/env python3
"""Escribe PELICULA4.md («Una misma mañana») desde prompts/pelicula4_una_misma_manana.json.

El JSON es el plan definitivo (tres directores, jurado, síntesis, cuatro
críticos y corrección) con la voz ya generada y medida en `voz_medida`. Este
script no inventa nada: ordena el plan para que José lo lea y lo apruebe.

    python3 montaje/plan_misma_manana.py
"""
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
P = json.loads((RAIZ / "prompts/pelicula4_una_misma_manana.json").read_text())


def tc(t):
    return f"{int(t // 60)}:{t % 60:04.1f}"


def c1(x):
    return f"{x:.1f}".replace(".", ",")


def celda(s):
    return str(s).replace("|", "/").replace("\n", " ")


t0, t = {}, 0.0
for x in P["tomas"]:
    t0[x["id"]] = t; t += x["dur_s"]
total = t
voz = P["voz_medida"]
gen = [x for x in P["tomas"] if x["fuente"] == "GENERADA"]
clips = sum(x["tomas_a_generar"] for x in gen)

out = [f"""# Película 4 — «{P['titulo']}»

**{tc(total)} en 9:16, con cortes de 60 y 30 s y una versión B sin archivo.** Es el plan para aprobar antes de encender la GPU.

**Cómo se hizo.** La estructura es la que pidió José: Bukele → siete países a la misma hora → ORIGEN → unir sin dejar de ser soberanos, con Morazán → un centavo y el pago llega en segundos → Genesis ID → tokenizar empresas con las reglas de cada país adentro → «Esto lo hicimos por vos».

Se armó así:
- tres directores, con enfoques de emoción, claridad y estadista, propusieron tres tratamientos;
- un jurado de tres los comparó;
- se sintetizó el plan;
- cuatro críticos le encontraron 90 fallas, que se corrigieron;
- después se grabó cada frase con la voz de Lucía y se midió.

Todo cabe: ninguna frase pisa a la siguiente.

## Lo que José tiene que decidir

1. **Su voz para la firma.** «Esto lo hicimos por vos. Para unir Centroamérica.» La dice el fundador, grabada en un cuarto en silencio con el teléfono, sin IA. Si prefiere no hacerlo, la dice Lucía.
2. **Cómo se dice «Genesis ID».** Hoy la voz dice «Génesis ai-dí». ¿Se dice así o «Génesis i-de»?
3. **El archivo original de Bukele** (Foro Regional Esquipulas, 25-sep-2018) y su permiso. Sin eso, la versión que se publica es la B, que abre con la pregunta en la voz de Lucía.
4. **«Un centavo de dólar»:** formalizar en acta la comisión de 0,01 USD (decisión D02) y confirmar que el costo de red no se suma. Si no, la frase cambia a «…desde tu teléfono…».
5. **Casting de los personajes nuevos:**
   - Rosa, taller de uniformes en Panamá;
   - Aurelio, cooperativa de café en Guatemala;
   - Marcus, pescador garífuna en Belice;
   - Mercedes, panadería de rosquillas en Nicaragua;
   - Andrés, transportista en Costa Rica.

   Lucía y don Chepe ya tienen foto.

## Concepto

{P['concepto']}

**Frase central:** {P['frase_central']}

## Las fórmulas de dirección

""" + "\n\n".join(P["formulas"]) + f"""

## Estructura

| # | Secuencia | Tiempo | Para qué | Emoción |
|---|---|---|---|---|
""" + "\n".join(f"| {s['n']} | {s['nombre']} | {tc(s['inicio_s'])}–{tc(s['fin_s'])} | {celda(s['proposito'])} | {celda(s['emocion'])} |" for s in P["secuencias"]) + f"""

## Guion con tiempos medidos

Voz de Lucía (la de «Un martes»), don Chepe con su voz de «Un martes» y José en la firma (provisional hasta que la grabe). Cada duración es la del audio generado.

| TC | Quién | Texto | Dura |
|---|---|---|---|
""" + "\n".join(f"| {tc(v['t'])} | {v['quien'].title()} | {celda(v['escrito'])} | {c1(v['dur'])} s |" for v in voz) + f"""

## La pantalla dividida en siete

{P['pantalla_dividida']}

```
   ┌───────────────┬───────────────┐
   │   GUATEMALA   │    BELICE     │   ← GT–BZ cosida
   ├─────────┬─────┴───┬───────────┤
   │   EL    │HONDURAS │ NICARAGUA │   ← GT–SV, GT–HN, SV–HN, HN–NI cosidas
   │SALVADOR │         │           │
   ├─────────┴─────┬───┴───────────┤
   │    PANAMÁ     │  COSTA RICA   │   ← NI–CR, CR–PA cosidas
   └───────────────┴───────────────┘
   05:59 → 06:00 (PANAMÁ 07:00): las siete puertas se abren en el mismo fotograma
```

## Tokenizar, con las reglas de cada país adentro

{P['tokenizacion']}

## Tomas

{len(P['tomas'])} tomas: {len(gen)} generadas → {clips} clips; el resto es archivo, gráfico o composición hecha en código.
"""]

sec = None
nombres = {s["n"]: s["nombre"] for s in P["secuencias"]}
for x in P["tomas"]:
    if x["secuencia"] != sec:
        sec = x["secuencia"]
        out.append(f"\n**{sec}. {nombres.get(sec, '')}**\n")
        out.append("| TC | Toma | Fuente | Imagen y acción | Cámara | Texto en pantalla | Sonido | Transición |")
        out.append("|---|---|---|---|---|---|---|---|")
    ref = f" · foto: {x['ref']}" if x.get("ref") else ""
    out.append(f"| {tc(t0[x['id']])} | {x['id']} · {c1(x['dur_s'])} s | {x['fuente']}{ref} | {celda(x['imagen'])} | {celda(x['camara'])} | "
               f"{celda(x['texto_pantalla']) or '—'} | {celda(x['sonido'])} | {celda(x['transicion'])} |")

out.append(f"""

## Música y sonido

{P['musica']}

## Versiones

**60 s**

| TC | Imagen | Voz |
|---|---|---|
""" + "\n".join(f"| {v['tc']} | {celda(v['imagen'])} | {celda(v['voz'])} |" for v in P["version_60"]) + """

**30 s**

| TC | Imagen | Voz |
|---|---|---|
""" + "\n".join(f"| {v['tc']} | {celda(v['imagen'])} | {celda(v['voz'])} |" for v in P["version_30"]) + f"""

**Versión B (sin archivo):** {P['version_b']}

## Portada y publicación

**Portada:** {P['portada']}

**Texto de publicación:**

> """ + P["publicacion"].replace("\n", "\n> ") + """

## Personajes

| Quién | Rol | Casting |
|---|---|---|
""" + "\n".join(f"| {p['id'].title()} | {celda(p['rol'])} | {p['casting']} |" for p in P["personajes"]) + f"""

## Notas internas

""" + "\n".join(f"- {n}" for n in P["notas_internas"]) + """

**Nota técnica, corregida por nosotros:** """ + P["_nota_tecnica"] + """

## Riesgos

""" + "\n".join(f"- {n}" for n in P["riesgos"]) + """

## Qué cambió frente al plan anterior («Abrir»)

""" + "\n".join(f"- {n}" for n in P["cambios_vs_plan_anterior"]) + """

## Prompts de generación

Completos en `prompts/pelicula4_una_misma_manana.json` (campo `prompt_h3` de cada toma). Las 90 fallas que encontró la crítica, con su arreglo, están en `prompts/pelicula4_hallazgos_critica.json`.
""")

(RAIZ / "PELICULA4.md").write_text("\n".join(out))
print(f"PELICULA4.md: {len(P['tomas'])} tomas, {tc(total)}, {len(voz)} líneas de voz, {len(gen)} generadas → {clips} clips")

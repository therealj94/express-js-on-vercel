#!/usr/bin/env python3
"""Imagina el vídeo que saldría de un prompt, antes de gastar la GPU.

Nace de un patrón que se repitió todo el día: los prompts sonaban bien
escritos y producían planos que no contaban lo que debían. La sonda lo
detectaba DESPUÉS de generar. Esto lo intenta detectar antes, y es gratis.

    export GEMINI_API_KEY=...
    python3 auditar.py -g ../prompts/parte2_llave.json
"""
import argparse, json, os, sys, time
from pathlib import Path

MODELOS = ("gemini-3-flash-preview", "gemini-flash-latest", "gemini-3.1-flash-lite")


def pregunta(c, texto):
    ultimo = ""
    for _ in range(6):
        for m in MODELOS:
            try:
                return c.models.generate_content(model=m, contents=texto).text
            except Exception as e:
                ultimo = str(e)[:90]
        time.sleep(10)
    return f"(sin respuesta: {ultimo})"


def main():
    a = argparse.ArgumentParser()
    a.add_argument("-g", "--guion", required=True)
    a = a.parse_args()
    g = json.loads(Path(a.guion).read_text())
    from google import genai
    c = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    planos = "\n\n".join(
        # Los shotlist nuevos traen 'id' y heredan la duración de defaults;
        # los guiones viejos traen 'titulo' y 'segundos'. Vale cualquiera.
        f"PLANO {i} — {s.get('titulo') or s['id']} "
        f"({s.get('segundos', g.get('defaults', {}).get('duration_s', '?'))}s)\n"
        f"INTENCIÓN: {s.get('nota') or s.get('_nota', '(sin nota)')}\n"
        f"PROMPT: {s['still']} || MOVIMIENTO: {s['motion']}"
        for i, s in enumerate(g["shots"], 1))

    p = f"""Eres director de fotografía y vas a auditar los prompts de un anuncio
antes de que se generen con un modelo de vídeo. Responde en español, directo.

LO QUE EL ANUNCIO QUIERE CONTAR:
{json.dumps(g.get('la_idea') or g.get('historia') or g.get('idea') or g.get('_nota'), ensure_ascii=False, indent=1)}

LOS PLANOS:
{planos}

Para CADA plano dime en una línea:
- QUÉ SALDRÁ: lo que un modelo de vídeo produciría de verdad con ese texto.
- ¿TRANSMITE?: sí o no, y si no, qué falta.

Y al final, por separado:
A) Los 3 planos con MÁS riesgo de no transmitir, y la frase exacta que
   añadirías o quitarías de su prompt para arreglarlo.
B) ¿Se entiende la historia viendo solo los planos, sin voz? Si no, en qué
   punto se rompe.
C) Una cosa que le falta a la pieza entera."""
    print(pregunta(c, p))


if __name__ == "__main__":
    sys.exit(main())

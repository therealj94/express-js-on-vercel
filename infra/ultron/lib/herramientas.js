        case 'habilidad_usar': {
          const nombreH = (entrada.nombre || '').trim();
          if (!nombreH) return 'Hace falta el nombre de la habilidad. Ejemplo: {"nombre": "cuidar-a-ultron"}.';
          const h = await aprender.usar(nombreH);
          return `## Habilidad «${h.nombre}»${h.origen === 'aprendida' ? ' (aprendida, v' + h.version + ')' : ''}\nCuándo: ${h.cuando}\n\n${h.contenido}`;
        }
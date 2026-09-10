# Poner todo en tu Mac — para que sea permanente

Hasta hoy trabajamos en una máquina en la nube que **se borra sola**. Ya pasó:
el 19 de agosto el contenedor se reinició y se llevó el PDF del presupuesto y
los mensajes de la campaña. Lo que estaba en GitHub y lo desplegado sobrevivió
sin un rasguño; lo que estaba suelto, no.

Esta guía pone el taller en tu Mac. Desde ahí, nada se borra solo.

---

## Antes de empezar: qué se pierde hoy y qué no

| | En la nube (hoy) | En tu Mac |
|---|---|---|
| Código que subo a GitHub | Sobrevive | Sobrevive |
| Sitios desplegados (vetawallet.com) | Sobreviven | Sobreviven |
| PDFs, guiones, borradores | **Se borran** | Quedan |
| Historial de la conversación | Se corta al reiniciarse | `claude --resume` lo retoma |
| Tus llaves (AWS, Heroku) | Hay que volver a ponerlas cada vez | Se ponen una vez |
| Velocidad | Espera de arranque | Instantáneo |

---

## Paso 1 · Instalar Claude Code

Hay dos caminos. **Elegí el primero si no vivís en la terminal.**

### Camino A — la app de escritorio (recomendado para vos)

Claude Code tiene aplicación de Mac con ventanas y botones. Hace lo mismo que
la terminal, sin escribir comandos.

1. Descargala: https://claude.com/download
2. Abrí el `.dmg` y arrastrá la app a Aplicaciones
3. Abrila e iniciá sesión con la misma cuenta que usás en claude.ai

> **Requisitos:** macOS 13 o más nuevo, 4 GB de RAM, y una cuenta Pro, Max o
> Team. La cuenta gratuita de Claude no incluye Claude Code.

### Camino B — la terminal (si querés todo el poder)

Abrí la app **Terminal** (Cmd+Espacio, escribí «Terminal», Enter) y pegá:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Comprobá que quedó bien:

```bash
claude --version     # tiene que imprimir un número de versión
claude doctor        # diagnóstico completo, sin abrir sesión
```

La primera vez que corras `claude` se abre el navegador para que inicies sesión.

> Se actualiza solo en segundo plano. No hay que hacer nada más.

---

## Paso 2 · Las herramientas de base

Solo si elegiste el Camino B, o si querés que yo pueda desplegar desde tu Mac.

Instalá **Homebrew** (el instalador de programas de Mac) pegando esto en la
Terminal:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Cuando termine, instalá lo demás de un tirón:

```bash
brew install git gh node python@3.12 awscli
```

Qué hace cada uno:

| Programa | Para qué lo necesitamos |
|---|---|
| `git` | Guardar y subir el código |
| `gh` | Hablar con GitHub (crear ramas, ver PRs) |
| `node` | Correr los backends de la billetera |
| `python` | Generar los PDF de la Junta |
| `awscli` | Desplegar la web y consultar los costos de AWS |

---

## Paso 3 · Traer el proyecto

Elegí dónde va a vivir. Lo normal es una carpeta en tu usuario:

```bash
mkdir -p ~/orden-global
cd ~/orden-global
gh auth login                                  # iniciás sesión en GitHub una vez
gh repo clone therealj94/express-js-on-vercel
cd express-js-on-vercel
git checkout claude/veta-wallet-phantom-design-7syah8
```

> Si `gh` te da problemas, esto hace lo mismo:
> `git clone https://github.com/therealj94/express-js-on-vercel.git`

**Lo que viene adentro del repo, gratis:**

- Toda la web de Veta Wallet, Genesis ID, el explorador y la app
- Los documentos de la Junta (`documentos-junta/`), presupuesto incluido
- Los mensajes de la campaña (`campana-sorteo/`)
- **Tus siete agentes** (`.claude/agents/`): el contador de la nube, el
  cerrajero de seguridad, el centinela del dinero, el vigía de la cadena, el
  cirujano de despliegues, el escudero de Chainlist y el cronista

Ese último punto importa: al abrir Claude Code dentro de esta carpeta, el
equipo entero está disponible desde el primer minuto. No hay que reconstruirlo.

---

## Paso 4 · Las llaves

Esto es lo único delicado. **Ninguna llave está escrita en el repo ni en esta
guía** — y así tiene que seguir. Las sacás del origen y las ponés en tu Mac una
sola vez.

### AWS (para desplegar la web y ver los costos)

```bash
aws configure
```

Te va a pedir cuatro cosas. Las dos primeras las sacás de la consola de AWS →
IAM → tu usuario → «Security credentials» → «Create access key»:

- Access Key ID
- Secret Access Key
- Región por defecto: `us-east-1`
- Formato: `json`

Quedan guardadas en `~/.aws/credentials`, en tu disco, cifrado por macOS. No
las pega nadie en un chat ni viajan a ningún lado.

### Heroku (para los cinco backends)

```bash
brew install heroku/brew/heroku
heroku login
```

Se abre el navegador y listo. No hay que copiar ningún token a mano.

### Las demás cuentas

Estas se manejan desde su panel web, no hace falta configurarlas en la Mac:

| Servicio | Dónde | Para qué |
|---|---|---|
| Render | dashboard.render.com | Genesis ID |
| MongoDB Atlas | cloud.mongodb.com | La base de datos |
| Expo EAS | expo.dev | Las actualizaciones de la app |
| Twilio | console.twilio.com | El WhatsApp de negocio |

> **Regla que no se rompe:** una contraseña o una llave nunca se escribe en un
> documento, ni en un mensaje, ni en el repositorio. Si alguna vez necesito una
> para trabajar, te la pido en el momento y la usás vos, o la ponés en tu Mac
> donde solo tu Mac la lea.

---

## Paso 5 · Agent Reach (opcional, para ver internet)

Le da a Claude Code la capacidad de leer páginas limpias, YouTube, Twitter/X,
Reddit, Instagram y LinkedIn — útil para vigilar qué se dice de la campaña sin
pagar APIs.

Abrí Claude Code dentro de la carpeta del proyecto y pegale esta frase:

```
Instalame Agent Reach siguiendo esta guía:
https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md
```

Él hace el resto. Después, `agent-reach doctor` te dice qué canal funciona.

Ojo con dos cosas: los canales de Twitter, Instagram y Reddit piden **tus
cookies de sesión** — quedan solo en tu Mac, pero es tu cuenta la que navega.
Y buena parte del catálogo es de plataformas chinas que a nosotros no nos
sirven. Lo valioso para Orden Global: web limpia, YouTube, X, Reddit,
Instagram, LinkedIn y RSS.

---

## Cómo se trabaja a partir de ahora

Abrís la Terminal y:

```bash
cd ~/orden-global/express-js-on-vercel
claude
```

O abrís la app de escritorio y elegís esa carpeta.

Tres comandos que te van a servir:

| Comando | Qué hace |
|---|---|
| `claude --resume` | Retoma una conversación anterior, con todo el contexto |
| `/agents` | Ver y usar tus siete agentes |
| `/cost` | Cuánto llevás gastado en la sesión |

**Lo que cambia:** los archivos que generemos quedan en tu disco. Los PDF, los
guiones, los borradores — todo aparece en la carpeta y no se borra nunca.

**Lo que NO cambia:** los despliegues siguen yendo a la nube (AWS, Heroku,
Render). Tu Mac es el taller, no el servidor. Si apagás la Mac, vetawallet.com
sigue en línea igual.

---

## Si algo falla

| Síntoma | Qué hacer |
|---|---|
| `command not found: claude` | Cerrá la Terminal y abrila de nuevo |
| `command not found: brew` | Homebrew no terminó de instalarse; corré su instalador otra vez |
| Claude pide iniciar sesión y no abre el navegador | Corré `claude doctor` y seguí lo que diga |
| No me deja clonar el repo | `gh auth login` otra vez, y elegí «HTTPS» |

Para todo lo demás: abrí Claude Code y contale el error tal cual aparece. Es
literalmente para lo que sirve.

---

## Lo que queda pendiente de tu lado

Nada de esto lo puedo hacer yo — necesita tu usuario y tu tarjeta:

1. **`GENESIS_ARCHIVO_CLAVE` en Render.** Sin esa variable, la conservación
   cifrada de documentos sigue apagada. Panel de Render → genesis-id →
   Environment → Add Environment Variable.
2. **Confirmar el plan de Render.** El blueprint del repo dice «free», y en
   free el servicio se duerme. Tiene que decir Starter en el panel.
3. **Verificar el negocio en Meta Business Manager**, para que el número de
   Twilio no quede limitado en volumen.
4. **El contrato de Nexus por escrito**, atado a entregables y fechas, antes
   de girar los 3.500.

# Bucket de resultados — guía de 10 minutos

**Cuándo hacerlo:** después de que una sesión haya funcionado de punta a punta, y
con la GPU **apagada**. Añadir piezas nuevas durante una validación hace que un
fallo no se sepa de cuál de las dos viene, y rellenar formularios con la GPU
encendida es pagar por hora mientras se hacen trámites.

## Qué desbloquea

Hoy los clips solo salen del pod descargándolos a mano desde el navegador. Con un
bucket, el pod los sube solo cada minuto y pasan a ser alcanzables por nombre de
dominio — que es lo único que este entorno puede alcanzar. Eso permite:

- Correr el **QC automático** sobre los clips y decir cuáles tienen morphing
  antes de que nadie los mire
- Aplicar el **acabado** (2.39:1, curva de color, grano, 48 fps) y devolver los
  finales montables
- **Montar al ritmo** de una pista de música
- Guardar **imágenes de referencia** para que el pod las use como primer fotograma

Y una ventaja que no es menor: los resultados sobreviven aunque la instancia
muera de golpe, que ya ha pasado.

## Coste

Backblaze B2: **~$6 por TB al mes**, es decir **~$1.20/mes por 200 GB**, con
salida gratis hasta 3× lo almacenado. Google Drive también sirve si se prefiere
no crear cuentas nuevas.

## Pasos (los cuatro primeros son de José)

1. Crear cuenta en `backblaze.com` → **B2 Cloud Storage**
2. **Create a Bucket** → nombre único, por ejemplo `og-video-outputs`, privado
3. **Application Keys** → *Add a New Application Key*, con acceso solo a ese
   bucket. Anotar `keyID` y `applicationKey` — la clave **no se vuelve a mostrar**
4. Pasar esos dos valores (o cargarlos directamente en el paso siguiente)

5. Generar la configuración de rclone:

```bash
rclone config create b2 b2 account <keyID> key <applicationKey>
base64 -w0 ~/.config/rclone/rclone.conf     # esto es RCLONE_CONF_B64
```

6. Crear el pod con dos variables más:

```bash
python3 tools/vast_api.py create --offer <id> --disk 300 \
  --onstart cloud/onstart.sh --selftest cloud/selftest.py \
  --env RCLONE_CONF_B64=<pegar> \
  --env RCLONE_REMOTE=b2:og-video-outputs/$(date +%Y%m%d) \
  ...
```

El pod instala rclone y sube `/workspace/outputs` cada minuto. En el log aparece
`==> subida automática activa`. Si rclone no se instala, lo dice y todo lo demás
sigue funcionando: la subida es opcional y no bloquea nada.

## Seguridad

La clave de aplicación debe estar **limitada a ese bucket**, nunca la clave
maestra de la cuenta. Va en la variable de entorno del pod, no en el repo.
Rotarla si alguna vez se pega en un chat.

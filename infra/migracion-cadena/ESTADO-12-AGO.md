# Cómo vamos · 12-ago-2026

Estado de todo, comprobado hoy salvo donde diga otra cosa. Lo marcado con ✅
está verificado en vivo; lo marcado con ⏳ está pendiente y dice de quién
depende.

---

## 1 · La cadena nueva (5534, pruebas)

✅ **En marcha y sostenida sola.**

| | |
|---|---|
| Validadores | 4 — node3, node4, node5, node6 |
| Bloques | uno cada 10 s, malla completa (3 peers cada uno) |
| Bloque cero | mismo hash en los cuatro: sin bifurcación |
| Arranque tras reinicio | **probado reiniciando node6 entero**: volvió solo en 1 minuto |
| Emisión | 1.000.000.000.000 exacta · 155 billeteras con 1 ORIGEN |
| Tokens | los 82 contratos con `totalSupply()` dan el mismo valor que en la cadena vieja |

Detalle en `RED-5534.md`. Lo que se arregló: la unidad de systemd apuntaba a
otro directorio de datos, así que de haber arrancado habría empezado una base
vacía en vez de continuar la cadena.

**Esto valida la mecánica. No es la migración.**

---

## 2 · La cadena vieja (8532) y el corte

✅ **Novedad importante: el cierre de ranuras no caduca.**

La raíz de estado es idéntica desde el **8-ago 11:45 UTC**. No es poca
actividad: el estado **no ha cambiado en cuatro días**, y en los últimos 12.000
bloques no hay ni una transacción.

Eso derriba el hallazgo que decía que hacía falta un cierre diario y que la
ventana de una hora era inalcanzable:

- Las **78 ranuras sin identificar no son nuevas** — nunca se identificaron.
  Es trabajo de una vez.
- **La ventana de una hora vuelve a estar en pie.**
- En lugar del proceso nocturno: guardar el `stateRoot` del cierre y releerlo
  la noche del corte. Si coincide, el cierre vale.

⏳ **Lo que falta para construir el génesis 5550: cerrar esas 78 ranuras.**
Van 1.307 de 1.385. Las 332 cuentas del árbol ya tienen todas dirección
conocida; el problema es solo de ranuras, en unos 12 contratos.

⚠️ **Y una pregunta abierta para ti:** que una red con usuarios lleve cuatro
días sin una sola transacción no es normal. O no hay actividad real, o algo
dejó de enviar. No bloquea el corte, pero no daría la migración por buena sin
saber cuál de las dos es.

---

## 3 · La app

✅ Compilada por fin: build **70** (preview APK y producción `.aab`).
✅ Actualización por aire funcionando desde GitHub.
✅ Google OAuth cableado (Android + Web).
✅ Backend vivo, `/auth/social` validando.
✅ Páginas legales publicadas y respondiendo: privacidad, términos,
eliminar-cuenta, prueba-de-control, copia-fría.

⏳ **Depende de ti:**

1. **Play Console** — la cuenta personal fue rechazada. Hace falta cuenta de
   organización y **D-U-N-S**. *No borres la app*: el nombre del paquete no se
   puede reutilizar.
2. **Probar el login con Google en un teléfono real** con el build 70. El caso
   que importa: una cuenta que ya existe con correo y contraseña, al entrar con
   Google, tiene que caer en **la misma cuenta con los mismos fondos**.
3. Tras la primera subida a Play, registrar la **huella SHA-1 de firma de Play**
   como *segundo* cliente OAuth de Android.

---

## 4 · Seguridad — lo que más urge

⏳ **Rotar tres credenciales.** La de AWS es la que más corre: es una llave
`AKIA…`, **permanente**, no caduca sola. Hay que borrarla a mano en IAM.

| Credencial | Estado |
|---|---|
| AWS `AKIA…(ver IAM)` | permanente · **borrar en IAM y emitir otra** |
| Token de Heroku | rotar |
| Secreto del cliente web de Google | rotar |

> El identificador de la llave salió de acá a propósito: es lo único que
> había, la clave secreta que lo acompaña nunca estuvo escrita en este
> documento. Buscá el valor completo en IAM, que es donde vive.
>
> Ojo con lo que este borrado NO hace: el documento está versionado, así que
> el identificador sigue entero en el historial de git y ahí se lee con un
> `git log -p`. Quitarlo del archivo de hoy no lo saca de ahí. Lo que de
> verdad lo deja sin valor es borrar la llave en IAM y emitir otra.

⏳ **`PASS_TOKEN` de 7 caracteres firma todas las sesiones de la wallet.**
Sigue abierto y es del mismo tipo que el `PASS_ADM` que ya arreglamos.

⏳ El respaldo del código del backend a un repositorio privado sigue sin
hacerse: pedí acceso a `veta-wallet-backend` y no llegó a aprobarse.

---

## 5 · Cabos sueltos anotados

- La cadena vieja tiene **un solo validador**, no seis.
- `TREASURY_OG_ADDRESS` guarda 126 ORIGEN y **nadie tiene su llave**.
- Las cuatro billeteras de emisión: **firmadas y verificadas**, copia fría hecha
  y comprobada por su dueño.

---

## Lo siguiente que hago yo

Cerrar las 78 ranuras. Es lo único que separa al proyecto de poder construir el
génesis 5550, y ahora que el estado está congelado se puede hacer con calma en
vez de contra el reloj.

## Lo siguiente que haces tú

La cuenta de organización de Play con el D-U-N-S, y borrar esa llave de AWS.

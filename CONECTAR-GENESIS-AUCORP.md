# Conectar Genesis ID con AuCorp — los pasos

Escrito el 24 de agosto de 2026, con el estado real verificado ese día.

---

## Dónde está cada pieza hoy

| Pieza | Dónde | Estado verificado |
|---|---|---|
| Motor Genesis ID | `genesis-id.onrender.com` | ✅ arriba (responde el panel) |
| Sitio + banca de AuCorp | `main.d2e55u6ls6v9xt.amplifyapp.com` | ✅ arriba, y ya se deja enmarcar por la wallet |
| **API de AuCorp** | — | ❌ **sin desplegar** (`aucorp-api` en Heroku dice «No such app») |
| Código del API | `infra/aucorp-api/` | ✅ escrito y con pruebas |
| Alta de `aucorp` en Genesis | `genesis-id/src/auth/aplicaciones.ts` | ✅ ya está en la lista del ecosistema |

**El bloqueo no es la llave: es que el API de AuCorp no existe todavía en
ningún servidor.** La llave sin API a quién dársela no tiene sentido, y por eso
los pasos van en este orden.

---

## Paso 1 · Desplegar el API de AuCorp

Desde `infra/aucorp-api/`:

```bash
heroku login
heroku create aucorp-api
git subtree push --prefix infra/aucorp-api heroku main
```

Si el nombre `aucorp-api` está tomado, poné el que Heroku acepte y **anotalo**:
hace falta en el paso 4.

---

## Paso 2 · Sacar la llave de `aucorp` de Genesis

La llave **se muestra una sola vez, en el arranque**, y de ella solo se guarda
el hash: no hay forma de recuperarla después. Si se pierde, se revoca y se
emite otra.

1. Entrá a **https://dashboard.render.com** → servicio **genesis-id**.
2. **Manual Deploy → Deploy latest commit** (o *Restart service*).
3. Abrí la pestaña **Logs** y buscá esta línea exacta:

   ```
   [genesis-id] clave de API de aucorp (se muestra una sola vez): gid_live_…
   ```

4. **Copiala entera y guardala en un gestor de contraseñas**, no en un chat.

> **Si esa línea NO aparece**, es porque `aucorp` ya estaba dada de alta de un
> arranque anterior — el motor solo la crea si no existe. En ese caso hay que
> revocarla y emitir otra desde el panel de Genesis (*Aplicaciones → aucorp →
> Rotar clave*), que la vuelve a mostrar una vez.

---

## Paso 3 · Poner las variables en el API de AuCorp

En Heroku (`Settings → Config Vars`) del app del paso 1:

| Variable | Valor | Sin ella |
|---|---|---|
| `GENESIS_API_KEY` | la `gid_live_…` del paso 2 | **No se verifica ningún SSO** |
| `GENESIS_URL` | `https://genesis-id.onrender.com` | Usa producción por defecto (está bien) |
| `MONGODB_URI` | la cadena de tu clúster (la base se llama `aucorp`) | Arranca, pero toda operación falla cerrada |
| `AUCORP_TOKEN` | un secreto **largo y propio** | No entra nadie (503) |
| `AUCORP_ADMIN_KEY` | otro secreto largo y distinto | La frontera del dinero queda cerrada (503) |
| `CORS_ORIGENES` | `https://app.vetawallet.com,https://main.d2e55u6ls6v9xt.amplifyapp.com` | Ningún navegador puede llamar |
| `AUCORP_MARGEN_BPS` | el margen del cambio, en puntos básicos | **Cero** |
| `AUCORP_TARIFAS` | JSON de comisiones | **Todas en cero** |

**`AUCORP_TOKEN` nunca puede ser el `PASS_TOKEN` de la wallet.** Son dos casas
distintas: si comparten el secreto que firma las sesiones, entrar en una es
entrar en la otra.

Y una cuenta pendiente que arrastramos: `PASS_TOKEN` y `PASS_ADM` de la wallet
tienen 7 caracteres. Aprovechá este viaje para alargarlos también — están en la
lista de críticos desde hace tiempo.

---

## Paso 4 · Apuntar la banca al API

En `apps-web/aucorp/app.js`, la constante del API tiene que ser la URL del
paso 1. Después:

```bash
cd apps-web && python3 subir.py aucorp d2e55u6ls6v9xt
```

---

## Paso 5 · Comprobar que quedó atado

```bash
# 1. El API responde y dice qué le falta
curl -s https://<tu-app>.herokuapp.com/salud | jq

# 2. Y reconoce a Genesis
curl -s https://<tu-app>.herokuapp.com/salud | jq '.genesis'
#    → debe decir que la clave está configurada
```

Y la prueba de verdad, la que importa: entrar a **app.vetawallet.com**, tocar
la esfera de **AuCorp**, y que la banca abra **dentro** con tu sesión ya
reconocida — sin pedirte otra contraseña. Ese «sin pedirte otra contraseña» es
todo el punto del SSO.

---

## Cómo viaja la identidad (para entender qué se está atando)

```
   Veta Wallet ──#sso-aucorp──▶ banca de AuCorp ──token──▶ API de AuCorp
                                                              │
                                                     X-API-Key│ (GENESIS_API_KEY)
                                                              ▼
                                                        Genesis ID
                                                    ¿este gid es real?
                                                    ¿está verificado?
```

La llave **nunca** viaja al navegador. La banca manda el token del SSO a su
propio API, y es el API —desde el servidor, con su `X-API-Key`— quien le
pregunta a Genesis si esa identidad existe y en qué nivel está. Por eso una
llave filtrada del lado del cliente sería un problema serio, y por eso vive
solo en las variables de Heroku.

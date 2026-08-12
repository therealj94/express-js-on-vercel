# Probar Veta Wallet contra la cadena nueva · 12-ago-2026

Ya se puede probar **la app**, no solo la cadena. Sin tocar producción.

## Cómo está montado

```
Veta Wallet ENSAYO  ──►  backend de ensayo  ──►  nodo RPC  ──►  4 validadores
   (APK aparte)          32.192.209.12:3000     18.234.39.26      cadena 5534
                         base de datos propia
```

Nada de esto toca la app de verdad ni su base de datos.

| | |
|---|---|
| Backend de ensayo | `http://32.192.209.12:3000` · servicio `veta-ensayo` |
| Base de datos | **MongoDB local en esa misma máquina**, base `wallet_ensayo` |
| Cadena | la 5534, a través del nodo RPC |
| Paquete Android | `com.ordenglobal.vetawallet.ensayo` — **se instala al lado**, no reemplaza |

**La base es local y está vacía.** No comparte ni un registro con la de
producción, así que ninguna prueba puede tocar una cuenta real. Los secretos de
cifrado son nuevos y de **48 caracteres**, generados en la máquina — este
ensayo no hereda el `PASS_TOKEN` corto que sigue pendiente en producción.

## Lo que ya está comprobado

- Alta de cuenta: **crea billetera y devuelve la semilla**.
- Login: **devuelve token**.
- Envío: el backend firma y emite. La transacción aparece en la cadena con
  `chainId 0x159e` = **5534**, o sea que **se firma para la cadena nueva**.
- El backend es alcanzable desde internet.

## Los pasos

### 1. Instala el APK de ensayo

Sale de Actions → «Veta Wallet — compilar APK» → perfil `ensayo`. Se llama
**Veta Wallet ENSAYO** y tiene su propio icono; tu Veta Wallet de siempre se
queda donde está.

### 2. Crea una cuenta

Con correo y contraseña. **El acceso con Google no funciona en este build** —
al tener otro nombre de paquete, su huella no está registrada en Google. Es
esperado y no dice nada sobre la app real.

Apunta la dirección que te da.

### 3. Ponle fondos

La cuenta nueva nace a cero. Desde MetaMask —con la red 5534 puesta según
`PROBAR-LA-5534.md`— envíale ORIGEN y algún token desde una dirección tuya que
sí tenga.

Con **0,1 ORIGEN** sobra: el backend paga el gas a 400 gwei y un envío cuesta
unos 0,084.

### 4. Prueba

1. Que el saldo aparece en la app.
2. Enviar ORIGEN a otra dirección.
3. **Enviar un token** — es la prueba que de verdad importa, porque mueve
   estado de contrato.
4. Que el historial lo refleja.

## Algo que encontré probando, y conviene arreglar

**El backend devuelve un hash y «pending» aunque la transacción no pueda
minarse nunca.** Lo probé con la cuenta a cero: respondió

```
{"hash":"0x0bab…","status":"pending"}
```

y esa transacción **sigue sin bloque** — no tiene fondos ni para el gas, así
que no entrará jamás.

No esperar al minado es correcto y está bien razonado en el código (Heroku
corta a los 30 s y el cliente vería un error por una transacción que sí salió).
El problema es lo otro: **nada vuelve a mirar si la transacción murió**. Para
el usuario queda como enviada para siempre.

Hace falta que algo revise después los pendientes y las marque como fallidas.
No bloquea la prueba, pero sí es un fallo de cara al usuario.

## Cuando termines

- El backend de ensayo se apaga con `systemctl stop veta-ensayo`.
- El puerto 3000 se cierra quitando la regla del grupo `sg-06d4056832210c88b`.
- El APK de ensayo se desinstala como cualquier app; no deja nada.

## Lo que esto NO es

**No es el corte.** Es la app real hablando con la cadena real a través de un
backend de mentira y una base vacía. Sirve para responder «¿la app funciona
contra la cadena nueva?». La migración de verdad —usuarios, saldos, el cambio
de la producción— es otra cosa y va con la Junta y contigo delante.

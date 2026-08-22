# Política de Privacidad de Veta Wallet

**Responsable del tratamiento:** Orden Global Corp
**Aplicación:** Veta Wallet (Android / iOS)
**Última actualización:** 31 de julio de 2026
**Contacto:** info@ordenglobal.org

---

## 1. Quiénes somos

Veta Wallet es una billetera digital operada por Orden Global Corp. Permite
guardar y enviar activos digitales, comprar ORIGEN depositando USDT y usar una
tarjeta Visa virtual emitida por nuestro proveedor.

Esta política explica **qué datos recogemos, para qué, con quién los
compartimos y qué podés hacer con ellos.** Está escrita para que se entienda,
no para cubrirnos.

---

## 2. Qué datos recogemos

### 2.1 Los que nos das

| Dato | Cuándo | Para qué |
|---|---|---|
| Correo electrónico | Al registrarte | Identificarte, recuperar tu cuenta, avisarte de movimientos |
| Contraseña | Al registrarte | Autenticarte y descifrar tu clave privada |
| Nombre y apellido | Al pedir la tarjeta | Requisito del emisor de la tarjeta |
| Documento de identidad y selfie | Verificación de identidad (KYC) | Obligación legal contra el lavado de dinero |
| Fecha de nacimiento, nacionalidad, domicilio | Verificación de identidad | Obligación legal |
| Teléfono | Al activar la verificación por SMS | Enviarte los códigos de compras online |
| Ocupación, origen de fondos, volumen esperado | Verificación de identidad | Obligación legal |

### 2.2 Los que se generan al usar la app

| Dato | Para qué |
|---|---|
| Dirección de tu billetera | Es tu identificador en la cadena de bloques |
| Historial de transacciones | Mostrarte tu actividad |
| Movimientos de la tarjeta | Mostrarte tus consumos |
| Registro de sesiones (fecha, hora) | Que puedas ver dónde está abierta tu cuenta |
| Registros técnicos de error | Encontrar y arreglar fallas |

### 2.3 Lo que NO recogemos

- **No usamos rastreadores publicitarios.** Ninguno. La app no tiene SDK de
  publicidad, ni de atribución, ni de analítica de terceros.
- **No vendemos tus datos.** A nadie, nunca, por ningún motivo.
- **No accedemos a tus contactos del teléfono.** La agenda de Veta Wallet vive
  solo en tu dispositivo.
- **No rastreamos tu ubicación.**
- **No leemos tu galería.** Solo recibimos la imagen que vos elegís subir.

---

## 3. Tu clave privada y tu frase de respaldo

Esto merece su propia sección porque es lo más importante.

Veta Wallet es una **billetera custodia**. Tu clave privada y tu frase de
respaldo se guardan cifradas en nuestros servidores. Se descifran únicamente
cuando vos lo pedís y con tu contraseña.

Qué significa en la práctica:

- **Nosotros no conocemos tu contraseña.** Se guarda como un hash bcrypt, que
  es un proceso de una sola dirección.
- **Podés ver y exportar tu frase de respaldo** en cualquier momento desde la
  app. Guardala fuera del teléfono.
- **Si perdés la contraseña y no tenés la frase**, no podemos devolverte los
  fondos. No es una política: es matemática.
- **Si eliminás tu cuenta**, conservamos la clave cifrada precisamente para
  que tus fondos sigan siendo recuperables con tu frase. Ver la sección 7.

---

## 4. Con quién compartimos datos

Solo con quienes hacen falta para que la app funcione, y solo lo necesario.

| Proveedor | Qué recibe | Por qué |
|---|---|---|
| **CryptoMate** | Nombre, documento, domicilio, fecha de nacimiento | Es el emisor de la tarjeta Visa. Sin estos datos no puede emitirla |
| **Veriff** | Documento de identidad y selfie | Verifica que sos quien decís ser |
| **MongoDB Atlas** | Todos los datos de la cuenta | Es donde vive nuestra base de datos |
| **Heroku (Salesforce)** | Tráfico de la app | Es donde corre nuestro servidor |
| **Expo** | Identificador anónimo del dispositivo | Entregar actualizaciones y notificaciones |
| **Autoridades** | Lo que exija una orden válida | Obligación legal |

Ninguno de ellos puede usar tus datos para sus propios fines.

**Datos públicos por naturaleza:** las transacciones en una cadena de bloques
son públicas. Tu dirección, tus saldos y tus movimientos on-chain los puede
ver cualquiera que mire la cadena. Eso no es una decisión nuestra: es cómo
funciona la tecnología. Tu nombre no está en la cadena, pero tu dirección sí.

---

## 5. Dónde y cuánto tiempo

Los datos se almacenan en servidores dentro de la Unión Europea y Estados
Unidos.

| Dato | Cuánto lo guardamos |
|---|---|
| Cuenta activa | Mientras la cuenta exista |
| Datos de verificación de identidad | 5 años desde el cierre, por obligación legal |
| Registros de transacciones | 5 años, por obligación legal |
| Registros técnicos | 90 días |
| Cuenta eliminada | Solo el material cifrado y lo que exija la ley |

Los 5 años no son un capricho: la normativa de prevención de lavado de dinero
obliga a conservar los registros de identificación de clientes durante ese
plazo, aunque la persona cierre la cuenta.

---

## 6. Cómo protegemos tus datos

- Toda comunicación con nuestros servidores va por HTTPS.
- Las contraseñas se guardan con bcrypt.
- Las claves privadas y las frases de respaldo se guardan cifradas con AES.
- En el teléfono, tu sesión y tus credenciales guardadas se almacenan en el
  llavero del sistema operativo (Keychain en iOS, Keystore en Android), no en
  almacenamiento común.
- El desbloqueo por Face ID o huella lo gestiona el sistema operativo. Nosotros
  nunca vemos tu huella ni tu rostro.
- Los endpoints que revelan la frase de respaldo tienen límite de intentos.
- Cambiar la contraseña cierra la sesión en todos los demás dispositivos.

---

## 7. Tus derechos

Podés ejercerlos escribiendo a **info@ordenglobal.org**. Respondemos
dentro de los 30 días.

| Derecho | Qué podés hacer |
|---|---|
| **Acceso** | Pedir una copia de todo lo que tenemos sobre vos |
| **Rectificación** | Corregir un dato equivocado |
| **Eliminación** | Borrar tu cuenta — desde la app o escribiéndonos |
| **Portabilidad** | Recibir tus datos en un formato que puedas llevarte |
| **Oposición** | Pedir que dejemos de tratar tus datos para un fin concreto |
| **Reclamo** | Presentarlo ante la autoridad de protección de datos de tu país |

### Cómo eliminar tu cuenta

Desde la app: **Ajustes → Eliminar cuenta.** Te pide cuatro confirmaciones y
tu contraseña.

Qué pasa cuando lo hacés:

1. Se borran tus datos personales: correo, nombre, teléfono, país.
2. Se cierran todas tus sesiones en todos los dispositivos.
3. Se borra todo lo guardado en este teléfono.
4. **Se conserva tu dirección con su clave cifrada.** Esto es a propósito: si
   todavía tenés fondos on-chain y destruyéramos esa clave, ese dinero
   quedaría inaccesible para siempre, para vos y para nosotros. Seguís
   pudiendo recuperarlo con tu frase de respaldo.
5. Se conservan los registros de identificación que la ley nos obliga a
   guardar cinco años.

Tu correo queda libre para registrarte de nuevo cuando quieras.

---

## 8. Menores de edad

Veta Wallet no está dirigida a menores de 18 años y no permitimos su registro.
Si detectamos una cuenta de un menor, la cerramos. Si sos madre, padre o tutor
y creés que tu hijo abrió una cuenta, escribinos y la eliminamos.

---

## 9. Permisos que pide la app

| Permiso | Para qué | ¿Obligatorio? |
|---|---|---|
| **Cámara** | Escanear códigos QR y fotografiar tu documento | No. Podés escribir la dirección a mano |
| **Fotos** | Subir la imagen de tu documento | No. Podés usar la cámara |
| **Notificaciones** | Avisarte cuando recibís fondos o hay un consumo | No |
| **Face ID / Huella** | Desbloquear la app y autorizar operaciones | No. Siempre podés usar la contraseña |

Si negás un permiso, la app sigue funcionando; solo se desactiva esa función.

---

## 10. Cambios en esta política

Si la cambiamos de forma significativa te avisamos dentro de la app antes de
que entre en vigor. La fecha de arriba siempre indica la última versión.

---

## 11. Contacto

**Orden Global Corp**
Correo de privacidad: info@ordenglobal.org
Soporte: info@ordenglobal.org
Sitio: https://vetawallet.com

# Hotspot Libre

Comparte el internet móvil del teléfono con otros dispositivos haciendo que el
tráfico salga como si lo hubiera generado el propio teléfono.

Es una reescritura del enfoque de las apps de «TTL fixer» con dos diferencias
que se notan en el uso diario: **SOCKS5 además de HTTP** (los juegos y las apps
que no entienden proxy HTTP también navegan) y un **guard anti-bucle** que
corta en el acto las peticiones dirigidas al propio proxy en vez de dejarlas
colgadas hasta el timeout.

> Saltarse la detección de tethering viola los términos de servicio de casi
> todos los operadores. El código es un proxy local corriente; el uso es tuyo.

## Los dos modos

| | Proxy (sin root) | TTL (con root) |
|---|---|---|
| Requiere root | No | Sí |
| Configuración por dispositivo | Una vez (proxy o PAC) | Ninguna |
| Cubre tráfico no-HTTP | Sí, vía SOCKS5 | Todo |
| Cómo funciona | El teléfono hace las peticiones por los demás | Iguala el TTL a 64 con `iptables -t mangle` |

Sin root no hay forma de tocar el TTL: `iptables` toca el netfilter del kernel
y Android no lo expone por API. Para eso existe el modo proxy.

## Uso

1. Enciende el hotspot del teléfono.
2. Abre la app y activa el proxy. Aparecerá una dirección tipo `192.168.43.1:8888`.
3. En cada dispositivo, una de dos:
   - **Manual**: ajustes de la red Wi-Fi → proxy manual → esa IP y puerto.
   - **Automático** (Windows, macOS, escritorios Linux): pegar la URL del PAC
     que muestra la app (`http://IP:8889/proxy.pac`) en «configuración
     automática del proxy». Si después cambias el puerto del proxy, la URL no
     cambia y no hay que reconfigurar nada.

El botón **Probar conexión** no se limita a mirar si el puerto está abierto:
se conecta al proxy como un cliente más y hace el recorrido completo hasta
`www.google.com:443` por HTTP y por SOCKS5, para que el error diga en qué
eslabón se rompió.

## Xiaomi / MIUI

Un servicio en primer plano no alcanza: el gestor de batería lo cierra igual y
a los conectados se les cae internet sin aviso. Hay que conceder las dos cosas
desde la propia app (**Arranque automático**):

- Inicio automático
- Ignorar optimización de batería

Además, un chequeo periódico cada 15 minutos revive el servicio si el sistema
llegó a matarlo.

## Compilar

```bash
cd hotspot-libre
gradle testDebugUnitTest    # 6 pruebas de extremo a extremo del proxy
gradle assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```

Necesita JDK 17 y el SDK de Android 35. El workflow
`.github/workflows/hotspot-libre-android.yml` corre lo mismo en cada push y
deja el APK como artefacto descargable.

## Qué hay dentro

```
proxy/ProxyServer.kt    Acepta y distingue HTTP de SOCKS5 por el primer byte
proxy/HttpSession.kt    CONNECT para TLS, forma absoluta para HTTP plano
proxy/Socks5Session.kt  RFC 1928, comando CONNECT, sin autenticación
net/Outbound.kt         Salida a la red + guard anti-bucle
net/PacServer.kt        Sirve el archivo de configuración automática
net/TtlManager.kt       iptables/ip6tables (root)
net/Diagnostics.kt      Autodiagnóstico de la cadena completa
service/TetherService.kt   Servicio en primer plano con contadores en vivo
service/WatchdogWorker.kt  Revive el servicio si MIUI lo mató
```

## Límites conocidos

- **No hay modo VPN.** Capturar todo el tráfico con `VpnService` exigiría una
  pila TCP/IP en espacio de usuario (tipo tun2socks); no está implementado, y
  el tráfico de los equipos ya conectados al hotspot se reenvía en el kernel
  sin pasar por la VPN del teléfono en muchas versiones de Android.
- **El PAC no es WPAD.** El descubrimiento automático necesita el puerto 80 y
  Android no deja a una app sin root abrir puertos bajo 1024, así que la URL
  del PAC se pega a mano una vez por dispositivo.
- **Detectar clientes** depende de `/proc/net/arp`, ilegible para apps desde
  Android 10. Cuando no está disponible se cae a un barrido de la subred, que
  es más lento y no reporta MAC.

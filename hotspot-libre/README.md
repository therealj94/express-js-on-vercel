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

## Rendimiento

El proxy mueve cada byte por espacio de usuario, así que el coste por bloque
importa. Medido en el banco de pruebas (`ThroughputTest` y `LoadTest`, x86,
sin interfaz gráfica de por medio):

| | Antes | Después |
|---|---|---|
| Un túnel | 3 329 Mbps | 12 653 Mbps |
| 64 túneles en paralelo | 9 340 Mbps | 16 063 Mbps |
| Emisiones a la UI durante la prueba | 402 | 3 |

De dónde sale:

- **Los contadores ya no publican por bloque.** El camino caliente solo suma
  enteros; el servicio publica una vez por segundo. Antes, a 50 Mbps, la
  pantalla se recomponía cientos de veces por segundo.
- **Los túneles se resumen** en una línea por segundo en vez de una por
  conexión. Cargar una página abre decenas de túneles hacia rastreadores, y
  esa línea se escribía desde el hilo que movía los bytes.
- **Buffers de socket de 512 KB fijados antes del `bind`/`connect`**, que es
  cuando se negocia la ventana TCP. Con la ventana por defecto, un enlace de
  50 Mbps y 100 ms de latencia se queda muy por debajo de su capacidad.
- **Cabeceras leídas sobre un stream con buffer.** Se leen byte a byte: sin
  buffer, cada byte era una llamada al sistema.
- **Un solo pool para las dos direcciones.** Antes cada conexión creaba un
  hilo suelto para la subida; un speedtest abre ~100 conexiones.

Los números de arriba son de x86 sin interfaz. En un teléfono la diferencia
debería ser mayor, porque allí la recomposición de Compose y el recolector de
basura cuestan mucho más — pero eso solo lo confirma tu teléfono.

## Trampas de Android que la app esquiva

Cuatro cosas que fallan en silencio si no se tratan a propósito. Las dos
primeras salieron de contrastar el código con la documentación de Android;
ninguna da error, simplemente no funcionan.

- **El servicio se declara `connectedDevice`, no `dataSync`.** Desde Android 15
  un servicio `dataSync` se corta a las 6 horas dentro de un mismo día y la app
  muere con `RemoteServiceException`. Un proxy de hotspot está encendido todo
  el día. `connectedDevice` no tiene ese límite, y su requisito se cumple
  declarando `CHANGE_NETWORK_STATE`.
- **El aviso de encendido del hotspot se pide desde código.** Desde Android 8
  los avisos implícitos no despiertan receptores declarados en el manifiesto,
  así que `WIFI_AP_STATE_CHANGED` declarado ahí no llega nunca.
- **Se prueban todas las direcciones de cada nombre.** Muchos dominios
  resuelven a IPv6 y a IPv4 a la vez, y según cómo el operador dé la conexión
  móvil una de las dos familias no sale. Quedarse con la primera hacía fallar
  siempre sitios perfectamente accesibles, sin patrón visible.
- **Solo se atiende a la red local.** El proxy escucha en `0.0.0.0` porque la
  IP del hotspot aparece y cambia sola; con el teléfono conectado a un wifi
  ajeno, eso dejaría a cualquiera de esa red salir por tus datos móviles.

Referencias: [tiempos límite de los servicios en primer plano](https://developer.android.com/develop/background-work/services/fgs/timeout),
[tipos de servicio](https://developer.android.com/develop/background-work/services/fgs/service-types),
[restricciones de avisos implícitos](https://developer.android.com/develop/background-work/background-tasks/broadcasts).

## Al conectar un dispositivo

Desde el equipo recién conectado, abrir `http://IP:8889/` en el navegador. Esa
página la sirve el propio teléfono y se ve **sin tener el proxy configurado
todavía**, que es justo el momento en que hacen falta las instrucciones. Trae
los pasos para Windows, macOS, Linux, Android e iPhone.

## Límites conocidos

- **No hay modo VPN.** Capturar todo el tráfico con `VpnService` exigiría una
  pila TCP/IP en espacio de usuario (tipo tun2socks); no está implementado, y
  el tráfico de los equipos ya conectados al hotspot se reenvía en el kernel
  sin pasar por la VPN del teléfono en muchas versiones de Android.
- **El PAC no es WPAD.** El descubrimiento automático necesita el puerto 80 y
  Android no deja a una app sin root abrir puertos bajo 1024, así que la URL
  del PAC se pega a mano una vez por dispositivo.
- **Un proxy manual es poroso por diseño.** Las apps que no respetan la
  configuración de proxy —bastantes juegos y algunas apps de sistema— salen
  por fuera, y esos paquetes llegan al operador con el TTL delator. Los
  navegadores sí lo respetan siempre. Cobertura completa solo la da el modo
  TTL, con root.
- **Sin reutilización de conexión en HTTP plano.** Cada petición en forma
  absoluta abre y cierra su conexión (`Connection: close`). Como casi todo el
  tráfico real va por HTTPS, y ahí el túnel CONNECT sí se mantiene abierto,
  no compensa la complejidad de reusar conexiones por host.
- **Un relay en espacio de usuario nunca iguala al reenvío del kernel.** Si
  el operador no estuviera mirando, el tethering normal sería más rápido.
- **Detectar clientes** depende de `/proc/net/arp`, ilegible para apps desde
  Android 10. Cuando no está disponible se cae a un barrido de la subred, que
  es más lento y no reporta MAC.

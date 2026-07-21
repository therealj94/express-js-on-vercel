# Veta Wallet - Especificaciones Técnicas Detalladas

## 🎯 Requisitos Funcionales

### 1. Autenticación y Seguridad

#### 1.1 Registro e Inicio de Sesión
```
- Email + Contraseña
- Validación de contraseña fuerte (mín 8 caracteres, 1 mayúscula, 1 número, 1 símbolo)
- Recuperación de contraseña vía email
- Confirmación de email requerida
- Histórico de login (últimas 10 sesiones)
- Deslogueo automático después de 30 minutos de inactividad
```

#### 1.2 Autenticación de Dos Factores (2FA)
```
Métodos soportados:
- Authenticator app (TOTP - Google Authenticator, Authy)
- SMS (Twilio)
- Email (código de 6 dígitos)

Backup codes:
- 10 códigos de emergencia de 8 caracteres
- Regenerables una vez
```

#### 1.3 Biometría
```
- Face ID (iOS)
- Touch ID (iOS)
- Fingerprint (Android)
- Fallback a PIN de 4-6 dígitos
```

### 2. Gestión de Wallet

#### 2.1 Creación de Wallet
```
Opciones:
1. Nueva wallet
   - Generar seed phrase de 12/24 palabras (BIP39)
   - Mostrar en orden aleatorio
   - Hacer que usuario confirme copiando 3 palabras aleatorias
   
2. Importar wallet
   - Por seed phrase
   - Por clave privada
   - Por hardware wallet (Ledger, Trezor)

3. Conectar wallet existente
   - MetaMask
   - WalletConnect
   - Coinbase Wallet
```

#### 2.2 Gestión de Direcciones
```
- Mostrar dirección principal truncada (0x7F2...4d2C)
- Copiar dirección al portapapeles
- QR code para recibir
- Generar nueva dirección (si soporta múltiples)
- Alias personalizado para cada dirección
```

#### 2.3 Balance y Activos
```
Información a mostrar:
- Balance total en USD
- Balance por moneda
- Cambio de precio 24h (% y $)
- Gráfico de tendencia 7 días
- Última actualización

Refrescar:
- Automático cada 30 segundos (mientras activo)
- Manual con botón refresh
- Pull to refresh (mobile)
```

### 3. Transacciones

#### 3.1 Envío (Send)
```
Campos requeridos:
- Seleccionar moneda
- Dirección destino (validar formato)
- Cantidad (validar disponibilidad)
- Mensaje/nota privada (opcional)

Opciones avanzadas:
- Gas personalizado (slow/standard/fast)
- Memo/tag (para algunos tokens)
- Seguridad: confirmar dirección 2 veces

Confirmación:
- Resumen de transacción
- Comisión estimada
- Tiempo estimado de confirmación
- 2FA requerido
```

#### 3.2 Recepción (Receive)
```
Mostrar:
- Dirección principal truncada
- QR code
- Dirección completa
- Copiar botón
- Compartir (WhatsApp, Telegram, etc)
```

#### 3.3 Historial de Transacciones
```
Información:
- Tipo (sent/received/swap)
- Moneda y cantidad
- Dirección (remitente/destinatario)
- Fecha y hora
- Estado (pending/confirmed/failed)
- Comisión
- Link a blockchain explorer

Funcionalidades:
- Filtrar por tipo, moneda, fecha
- Búsqueda por hash o dirección
- Detalles completos de tx
- Reintento si falló
```

### 4. Intercambio (Swap)

#### 4.1 Interfaz Principal
```
Campos:
- Seleccionar token origen
- Cantidad a intercambiar
- Seleccionar token destino
- Cantidad estimada recibida
- Botón "intercambiar" (reversa de tokens)
- Botón ejecutar

Información mostrada:
- Precio actual (1 ORIGEN = X USDC)
- Comisión de red (en token origen)
- Impacto de precio %
- Tiempo estimado
- Proveedor del swap
- Tolerancia de deslizamiento
```

#### 4.2 Órdenes Límite (Limit Orders)
```
Campos:
- Token origen
- Cantidad
- Token destino
- Precio límite
- Tipo (Buy/Sell)
- Fecha expiración

Estados:
- Pendiente
- Parcialmente ejecutada
- Ejecutada
- Cancelada
- Expirada
```

#### 4.3 Historial de Swaps
```
Información:
- Tokens intercambiados (origen → destino)
- Cantidades
- Comisión
- Tasa de cambio
- Fecha
- Estado
```

### 5. Tarjeta Débito Orden Global

#### 5.1 Detalles de la Tarjeta
```
Información visible (frente):
- Logo Veta Wallet
- Chip de seguridad
- Número de tarjeta (últimos 4 dígitos visibles)
- Nombre del titular
- Número de tarjeta completo (ocultar/mostrar)

Información (reverso - al girar):
- Banda magnética
- CVV (oculto por defecto)
- Mostrar/ocultar CVV
```

#### 5.2 Control de Tarjeta
```
Acciones:
- Bloquear/desbloquear
- Congelar (temporal)
- Renovar
- Reporte de pérdida
- Cambiar PIN

Configuración:
- Límites por tipo (ATM, compras, online)
- Límites diarios/mensuales
- Monedas permitidas
- Merchant categories (MCC)
- Control geográfico
```

#### 5.3 Transacciones de Tarjeta
```
Información:
- Tipo de transacción (compra, ATM, online)
- Comerciante/lugar
- Cantidad en moneda local + ORIGEN
- Fecha y hora
- Estado (pending/completed/declined)
- Ubicación geográfica

Estados de transacción:
- Autorización pendiente
- Autorizada
- Completada
- Fallida
- Disputa/Chargeback
```

#### 5.4 Límites y Alertas
```
Límites configurables:
- Compras diarias (ATM, compras, online)
- Compras mensuales
- Compras por categoría

Alertas:
- Transacción completada
- Límite próximo de ser alcanzado
- Transacción rechazada
- Acceso no autorizado (ubicación inusual)
```

### 6. Earn & Staking

#### 6.1 Programas de Earn
```
Información:
- Token disponible para earn
- APY actual
- Cantidad depositada
- Ganancias totales
- Período de bloqueo (si aplica)

Acciones:
- Depositar cantidad
- Retirar cantidad
- Claim rewards
- Auto-compound (si disponible)
```

#### 6.2 Staking
```
- Seleccionar moneda (ORIGEN)
- Cantidad a stakear
- Período de staking
- APY estimado
- Recompensas estimadas

Acciones:
- Activar staking
- Ver validadores
- Cambiar validador
- Unstake
- Claim rewards
```

#### 6.3 Historial de Rewards
```
- Fecha
- Moneda
- Cantidad
- Valor en USD
- Fuente (earn/staking)
```

### 7. Notificaciones

#### 7.1 Tipos de Notificaciones
```
- Transacción enviada
- Transacción recibida
- Transacción confirmada
- Transacción fallida
- Swap completado
- Compra con tarjeta
- Reward reclamado
- Límite de tarjeta próximo
- Acceso desde nuevo dispositivo
- Login fallido (múltiples intentos)
- Actualización de app disponible
```

#### 7.2 Canales
```
- Push notifications (app)
- Email
- SMS (para eventos críticos)
- In-app notifications
```

#### 7.3 Preferencias
```
- Activar/desactivar por tipo
- Activar/desactivar por canal
- Horario de no molestar (DND)
- Resumen diario/semanal (opcional)
```

### 8. Perfil y Configuración

#### 8.1 Información Personal
```
- Nombre completo
- Email
- Número de teléfono
- Foto de perfil
- Idioma preferido
- Moneda por defecto
```

#### 8.2 Seguridad
```
- Cambiar contraseña
- Autenticación de dos factores
- Dispositivos conectados (manage/logout)
- Sesiones activas
- Historial de login
- Intentos de acceso fallidos
```

#### 8.3 Preferencias
```
- Tema (light/dark)
- Notificaciones
- Privacidad
- Moneda de visualización
- Zona horaria
```

#### 8.4 Datos y Privacidad
```
- Descargar datos personales
- Eliminar cuenta permanentemente
- Política de privacidad
- Términos de servicio
- Reportar problema
```

## 🏗️ Requisitos No-Funcionales

### Performance
```
- Página carga: < 2 segundos
- API response: < 100ms
- Confirmación transacción: < 5 segundos
- Disponibilidad: 99.9% uptime
- Database queries: < 50ms
```

### Escalabilidad
```
- Soportar 100,000+ usuarios simultáneos
- Manejo de 10,000+ transacciones por minuto
- Auto-scaling de servidores
- Cacheing distribuido con Redis
- CDN para assets estáticos
```

### Seguridad
```
- Encriptación end-to-end (TLS 1.3+)
- Claves privadas nunca en servidor
- Rate limiting en todos endpoints
- CORS policy restrictiva
- SQL injection protection
- XSS prevention
- CSRF tokens
- Input validation (frontend + backend)
- Auditoría de smart contracts
- Pen testing regular
```

### Confiabilidad
```
- Backup diario de datos
- Disaster recovery plan
- Redundancia de servidores
- Circuit breaker para servicios externos
- Graceful degradation
- Error tracking y logging
```

### Compatibilidad
```
Navegadores:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Sistemas operativos:
- Windows 10+
- macOS 10.15+
- iOS 13+
- Android 8+

Mobile:
- Responsive design
- Touch-friendly
- Funcionalidad completa en mobile
```

### Usabilidad
```
- Tiempo aprendizaje: < 5 minutos
- Errores evitables: < 1%
- Satisfacción usuario: > 4.5/5
- Accesibilidad WCAG 2.1 Level AA
- Soporte multiidioma
```

## 📊 Métricas y KPIs

```
Adopción:
- Usuarios nuevos por semana
- Tasa de retención 7d/30d
- Tasa de actividad diaria (DAU)

Engagement:
- Transacciones por usuario
- Volumen promedio transacción
- Swaps por usuario
- Tarjeta usada %

Negocio:
- Comisiones por transacción
- Lifetime value (LTV)
- Cost per acquisition (CPA)
- ROI por canal

Técnico:
- Latencia API (p50, p99)
- Error rate
- Uptime %
- CPU/Memory utilization
```

## 🔌 Integraciones Externas

```
Blockchain:
- Orden Global RPC
- Multiple RPC nodes para redundancia
- Etherscan-like explorer

Pagos:
- Proveedor tarjeta débito
- Stripe (verificación)
- 2Checkout

Comunicaciones:
- SendGrid (emails)
- Twilio (SMS)
- Firebase (push notifications)

Analytics:
- Mixpanel
- Google Analytics 4
- Amplitude

Monitoreo:
- Sentry (error tracking)
- DataDog (APM)
- New Relic (performance)

Seguridad:
- Auth0 (opcional)
- 1Password (admin secrets)
```

## 📝 Validaciones de Entrada

```
Email:
- Formato válido RFC 5322
- Máximo 255 caracteres
- Debe ser único

Contraseña:
- Mínimo 8 caracteres
- Mínimo 1 mayúscula
- Mínimo 1 número
- Mínimo 1 símbolo
- No contener nombre de usuario

Dirección blockchain:
- Formato válido (0x...)
- Checksum válido (si aplica)
- No dirección contratos conocidos

Cantidad:
- Número válido
- Positivo
- No mayor que balance disponible
- Mínimo según token (dust limit)
- Máximo según límites de wallet

CVV:
- 3 o 4 dígitos
- Solo números
```

## 🔄 Flujos Principales

### Flujo de Transacción
```
1. Usuario selecciona Send
2. Ingresa dirección y cantidad
3. Confirmación 2 veces
4. Ingresa 2FA (SMS/Email/TOTP)
5. Firma transacción con su clave privada
6. Broadcast a la blockchain
7. Esperar confirmación
8. Mostrar receipt
9. Notificación al destinatario
```

### Flujo de Swap
```
1. Usuario selecciona dos tokens
2. Ingresa cantidad origen
3. Sistema obtiene precio de DEX
4. Muestra cantidad estimada destino
5. Usuario confirma
6. Ingresa 2FA
7. Firma transacción
8. Broadcast
9. Esperar confirmación
10. Actualizar balances
```

### Flujo de Compra con Tarjeta
```
1. Transacción en comerciante
2. Autorización en nuestro sistema
3. Verificar límites y fondos
4. Deducir de balance ORIGEN/USDC
5. Completar transacción
6. Notificar usuario
7. Registrar en historial
8. Mostrar receipt
```

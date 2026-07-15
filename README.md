# MyTokenPay

Directorio público y red de comercios afiliados del **Sistema Financiero Social** (Orden Global ·
AuCorp · DBNX). MyTokenPay permite a cualquier persona encontrar dónde pagar con **ORIGEN**, y a
cualquier negocio registrarse, verificarse (KYC/KYB · Genesis ID) y aparecer en el directorio por
país, ciudad y categoría.

> Este proyecto implementa **MyTokenPay** (el directorio público). No incluye MyTokenPay POS
> (terminal de cobro / backoffice de liquidación).

## Funcionalidades

- **Splash screen** animado con la marca al abrir la app.
- Navegación **con o sin cuenta** ("continuar como invitado").
- **Directorio** de comercios con filtros por país, ciudad, categoría y búsqueda de texto, en
  vista de lista o de **mapa** (Leaflet + OpenStreetMap, sin necesidad de API key).
- **Registro de empresa** en un asistente de varios pasos: datos legales, ubicación con pin en
  mapa en tiempo real (clic, arrastre o geolocalización del dispositivo), rubro/categoría,
  productos o servicios, perfil público (logo, portada, descripción, redes sociales, horario) y
  verificación **KYC/KYB** (documento de identidad + documento legal de la empresa).
- **Panel de negocio** tipo *bento grid* con estado de verificación, porcentaje de perfil completo
  y accesos directos.
- Ficha pública de cada comercio con galería, servicios, redes sociales, horario y mapa.

## Stack

- **Backend:** Express + TypeScript (`src/`), autenticación con JWT (`jsonwebtoken`) y contraseñas
  con `bcryptjs`. Los datos (usuarios y empresas) viven en un **almacén en memoria** sembrado con
  comercios de ejemplo en Honduras, Guatemala, El Salvador, Nicaragua, Costa Rica y Panamá.
- **Frontend:** React + TypeScript + Vite + Tailwind CSS v4 + Framer Motion + React Router +
  Leaflet/react-leaflet + Zustand (`client/`).

### Nota sobre persistencia

El almacén de datos es **en memoria**, pensado para desarrollo y demostración: los datos
sobreviven mientras el proceso de Node sigue vivo, pero se reinician en cada *cold start* de una
función serverless en producción. La capa de datos (`src/lib/db.ts`) está aislada detrás de un
objeto `db` para poder sustituirla por una base de datos real (Postgres, etc.) sin tocar las
rutas. La verificación KYC/KYB es **simulada**: los documentos se guardan y el estado pasa a "en
revisión"; no hay integración real con DBNX/Genesis ID.

## Desarrollo local

```bash
npm install
npm install --prefix client
cp .env.example .env   # define JWT_SECRET
npm run dev             # levanta la API (puerto 3001) y el cliente Vite (puerto 5173) en paralelo
```

Abre `http://localhost:5173`. Las peticiones a `/api/*` se redirigen automáticamente al backend.

## Build de producción

```bash
npm run build   # build del cliente (client/dist)
npm start        # sirve la API y, si existe client/dist, también el cliente
```

## Estructura

```
src/                  API Express (auth, empresas, categorías, países)
  data/                categorías, países/ciudades y datos de ejemplo
  lib/                 auth (JWT/bcrypt) y almacén en memoria
  middleware/          middleware de autenticación
  routes/               rutas de la API
client/
  src/
    components/         UI reutilizable (mapa, tarjetas, formularios, splash)
    pages/               páginas (landing, explorar, ficha, login/registro, panel)
    store/               estado global (auth, catálogo) con Zustand
    lib/                  cliente HTTP y utilidades
```

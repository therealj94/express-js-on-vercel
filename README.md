# MyTokenPay

Red de comercios afiliados del **Sistema Financiero Social** (Orden Global · AuCorp · DBNX).
MyTokenPay permite a cualquier persona encontrar dónde pagar con **ORIGEN** desde una app móvil,
y a cualquier negocio registrarse, verificarse (KYC/KYB · Genesis ID) y aparecer en el directorio
por país, ciudad y categoría.

> Este proyecto implementa **MyTokenPay** (el directorio público). No incluye MyTokenPay POS
> (terminal de cobro / backoffice de liquidación).

## Estructura del repo

```
src/        API Express + TypeScript (auth, empresas, categorías, países)
mobile/     App móvil Expo (SDK 54 / React Native) — ver mobile/README.md
```

## Backend (API)

```bash
npm install
cp .env.example .env   # define JWT_SECRET
npm run dev             # http://localhost:3001
```

Los datos (usuarios y empresas) viven en un **almacén en memoria**, sembrado con comercios de
ejemplo en Honduras, Guatemala, El Salvador, Nicaragua, Costa Rica y Panamá. Es apto para
desarrollo/demo; para producción hay que sustituir `src/lib/db.ts` por una base de datos real. La
verificación KYC/KYB es **simulada**: los documentos se guardan y el estado pasa a "en revisión",
sin integración real con DBNX/Genesis ID.

## App móvil

Ver [`mobile/README.md`](./mobile/README.md) para instrucciones de cómo abrirla en VS Code y
probarla en Android con Expo Go.

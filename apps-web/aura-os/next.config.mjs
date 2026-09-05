/** @type {import('next').NextConfig} */
// AURA OS se sirve DESDE ULTRON (infra/ultron/public/os): mismo origen, misma
// cookie de sesión, mismo /pensar. Por eso se exporta estático y con basePath.
// Un OS que vive en otro dominio tendría que pedir permiso a otro para hablar.
const nextConfig = {
  output: 'export',
  basePath: '/os',
  assetPrefix: '/os/',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  transpilePackages: ['three'],
  // el monorepo tiene otro lockfile arriba: la raíz de este paquete es esta carpeta
  turbopack: { root: new URL('.', import.meta.url).pathname },
};
export default nextConfig;

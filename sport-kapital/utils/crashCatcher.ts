// utils/crashCatcher.ts
// TEMPORAL — herramienta de diagnóstico. Intercepta errores fatales de JS
// (que en un build de producción normalmente cierran la app sin avisar) para
// mostrarlos en pantalla en vez de dejar que la app se cierre sola. Se activa
// apenas se importa este módulo (antes de cualquier render), para atrapar
// también errores tempranos. Quitar una vez resuelto el crash que se está
// investigando.
type CrashListener = (message: string) => void;

let listener: CrashListener | null = null;

export function onCrash(fn: CrashListener) {
  listener = fn;
}

function formatError(error: unknown, isFatal?: boolean): string {
  const err = error as { message?: string; stack?: string } | undefined;
  const head = isFatal ? 'FATAL' : 'ERROR';
  const msg = err?.message ?? String(error);
  const stack = err?.stack ?? '(sin stack trace)';
  return `[${head}] ${msg}\n\n${stack}`;
}

export function installCrashCatcher() {
  const g = global as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler: (fn: (error: unknown, isFatal?: boolean) => void) => void;
    };
  };
  if (!g.ErrorUtils) return;

  g.ErrorUtils.setGlobalHandler((error, isFatal) => {
    const text = formatError(error, isFatal);
    console.error('[crashCatcher]', text);
    if (listener) listener(text);
    // No reenviamos al handler por defecto: eso es lo que cierra la app.
    // Nos quedamos en pantalla mostrando el error para poder leerlo.
  });

  // promesas rechazadas sin .catch(): no cierran la app, pero pueden dejarla
  // en un estado roto silenciosamente — las logueamos igual.
  if (typeof (globalThis as any).addEventListener === 'function') {
    try {
      (globalThis as any).addEventListener('unhandledrejection', (ev: any) => {
        console.error('[crashCatcher] unhandled promise rejection', ev?.reason);
      });
    } catch { /* no-op en entornos sin ese API */ }
  }
}

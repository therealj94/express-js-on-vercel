// components/CrashBoundary.tsx — TEMPORAL, ver utils/crashCatcher.ts
// Atrapa errores de render de React (los que ErrorUtils.setGlobalHandler NO
// ve, porque React los intercepta antes) y los muestra en pantalla en vez de
// dejar que la app se cierre.
import React from 'react';
import { CrashScreen } from './CrashScreen';

interface State { message: string | null }

export class CrashBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    const err = error as { message?: string; stack?: string };
    return { message: `[RENDER] ${err?.message ?? String(error)}\n\n${err?.stack ?? '(sin stack trace)'}` };
  }

  componentDidCatch(error: unknown) {
    console.error('[CrashBoundary]', error);
  }

  render() {
    if (this.state.message) return <CrashScreen message={this.state.message} />;
    return this.props.children;
  }
}

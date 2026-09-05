'use client';
// AURA OS. El asistente ES la interfaz: un ser de luz en el vacío, la casa
// orbitando, la conversación en el espacio, y un arco de voz abajo.
import dynamic from 'next/dynamic';
import ConversationField from '@/components/os/ConversationField';
import HUDChrome from '@/components/os/HUDChrome';
import VoiceOrbInput from '@/components/os/VoiceOrbInput';

// El lienzo solo existe en el navegador: WebGL no tiene servidor.
const AuraCanvas = dynamic(() => import('@/components/os/AuraCanvas'), { ssr: false });

export default function Page() {
  return (
    <main className="relative h-full w-full bg-vacio">
      <AuraCanvas />
      <ConversationField />
      <HUDChrome />
      <VoiceOrbInput />
    </main>
  );
}

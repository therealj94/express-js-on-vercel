// utils/goalDetection.ts
// Regla compartida de "¿esta noticia es un gol a favor de un equipo que
// tengo comprado?" — la usan el sonido, la notificación y el aviso en
// pantalla, para no repetir (y desincronizar) el mismo filtro tres veces.
import type { NewsItem } from './matchEngine';
import type { Position } from '@/store/useStore';

export function isOwnedGoalNews(news: NewsItem, positions: Position[]): boolean {
  if (news.source !== 'PARTIDO') return false;
  if (!news.isGoal) return false;
  if (news.impact <= 0) return false;
  return positions.some((p) => p.teamId === news.teamId);
}

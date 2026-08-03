// data/teamApiMapping.ts
// Mapa equipo interno -> ID real en api-football.com (v3.football.api-sports.io).
//
// Los 24 equipos están confirmados contra la API real (respuesta real de
// /teams, corrida por el usuario el 12 de julio de 2026).
export interface TeamApiMapping {
  apiTeamId: number | null;
  /** true si es selección nacional (afecta cómo se busca en /teams). */
  national: boolean;
}

export const TEAM_API_MAPPING: Record<string, TeamApiMapping> = {
  // ---- Mundial 2026 (selecciones) ---- confirmados contra la API real
  fra: { apiTeamId: 2, national: true },      // Francia
  esp: { apiTeamId: 9, national: true },      // España
  arg: { apiTeamId: 26, national: true },     // Argentina
  sui: { apiTeamId: 15, national: true },     // Suiza
  eng: { apiTeamId: 10, national: true },     // Inglaterra
  nor: { apiTeamId: 1090, national: true },   // Noruega
  mar: { apiTeamId: 31, national: true },     // Marruecos
  bel: { apiTeamId: 1, national: true },      // Bélgica

  // ---- LaLiga 2025/26 (clubes) ----
  bar: { apiTeamId: 529, national: false },   // FC Barcelona
  rma: { apiTeamId: 541, national: false },   // Real Madrid
  atm: { apiTeamId: 530, national: false },   // Atlético de Madrid
  ath: { apiTeamId: 531, national: false },   // Athletic Club
  bet: { apiTeamId: 543, national: false },   // Real Betis
  rso: { apiTeamId: 548, national: false },   // Real Sociedad
  vil: { apiTeamId: 533, national: false },   // Villarreal
  sev: { apiTeamId: 536, national: false },   // Sevilla

  // ---- Liga Nacional de Honduras (clubes) ----
  mot: { apiTeamId: 1055, national: false },  // FC Motagua
  oli: { apiTeamId: 1051, national: false },  // CD Olimpia
  mar_h: { apiTeamId: 1050, national: false }, // CD Marathón
  res: { apiTeamId: 1058, national: false },  // Real España
  pla: { apiTeamId: 1057, national: false },  // CD Platense
  ola: { apiTeamId: 19456, national: false }, // Olancho FC
  upn: { apiTeamId: 1059, national: false },  // Lobos UPNFM
  jut: { apiTeamId: 1053, national: false },  // Juticalpa FC
};

/** IDs de los equipos con mapeo confirmado (apiTeamId no nulo). */
export function mappedApiTeamIds(): number[] {
  return Object.values(TEAM_API_MAPPING)
    .map((m) => m.apiTeamId)
    .filter((id): id is number => id != null);
}

/** Equipo interno (id de data/teams.ts) a partir de un apiTeamId real. */
export function internalIdForApiTeam(apiTeamId: number): string | undefined {
  return Object.entries(TEAM_API_MAPPING).find(([, m]) => m.apiTeamId === apiTeamId)?.[0];
}

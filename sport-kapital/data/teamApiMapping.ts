// data/teamApiMapping.ts
// Mapa equipo interno -> ID real en api-football.com (v3.football.api-sports.io).
//
// Los equipos están confirmados contra la API real (respuestas reales de
// /teams y /standings).
export interface TeamApiMapping {
  apiTeamId: number | null;
  /** true si es selección nacional (afecta cómo se busca en /teams). */
  national: boolean;
}

export const TEAM_API_MAPPING: Record<string, TeamApiMapping> = {
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

  // ---- Brasileirão Série A 2026 (clubes) ----
  palmeira: { apiTeamId: 121, national: false }, // Palmeiras
  flamengo: { apiTeamId: 127, national: false }, // Flamengo
  atle_para: { apiTeamId: 134, national: false }, // Athletico Paranaense
  fluminen: { apiTeamId: 124, national: false }, // Fluminense
  bahia: { apiTeamId: 118, national: false }, // Bahia
  rb_brag: { apiTeamId: 794, national: false }, // RB Bragantino
  cruzeiro: { apiTeamId: 135, national: false }, // Cruzeiro
  botafogo: { apiTeamId: 120, national: false }, // Botafogo
  corinthi: { apiTeamId: 131, national: false }, // Corinthians
  atletico: { apiTeamId: 1062, national: false }, // Atlético-MG
  coritiba: { apiTeamId: 147, national: false }, // Coritiba
  sao_paul: { apiTeamId: 126, national: false }, // São Paulo
  vitoria: { apiTeamId: 136, national: false }, // Vitória
  mirassol: { apiTeamId: 7848, national: false }, // Mirassol
  santos: { apiTeamId: 128, national: false }, // Santos
  internac: { apiTeamId: 119, national: false }, // Internacional
  gremio: { apiTeamId: 130, national: false }, // Grêmio
  vasc_gama: { apiTeamId: 133, national: false }, // Vasco da Gama
  remo: { apiTeamId: 1198, national: false }, // Remo
  chap_b: { apiTeamId: 22722, national: false }, // Chapecoense

  // ---- MLS 2026 (clubes) ----
  vanc_whit: { apiTeamId: 1603, national: false }, // Vancouver Whitecaps
  los_ange: { apiTeamId: 1616, national: false }, // Los Angeles FC
  san_jose_eart: { apiTeamId: 1596, national: false }, // San Jose Earthquakes
  hous_dyna: { apiTeamId: 1600, national: false }, // Houston Dynamo
  real_salt_lake: { apiTeamId: 1606, national: false }, // Real Salt Lake
  dallas: { apiTeamId: 1597, national: false }, // FC Dallas
  st_loui_city: { apiTeamId: 20787, national: false }, // St. Louis City
  port_timb: { apiTeamId: 1617, national: false }, // Portland Timbers
  seat_soun: { apiTeamId: 1595, national: false }, // Seattle Sounders
  minn_unit: { apiTeamId: 1612, national: false }, // Minnesota United FC
  colo_rapi: { apiTeamId: 1610, national: false }, // Colorado Rapids
  los_ange_gala: { apiTeamId: 1605, national: false }, // Los Angeles Galaxy
  san_dieg: { apiTeamId: 25484, national: false }, // San Diego
  austin: { apiTeamId: 16489, national: false }, // Austin
  spor_kans_city: { apiTeamId: 1611, national: false }, // Sporting Kansas City
  nashvill: { apiTeamId: 9569, national: false }, // Nashville SC
  inte_miam: { apiTeamId: 9568, national: false }, // Inter Miami
  new_engl_revo: { apiTeamId: 1609, national: false }, // New England Revolution
  chic_fire: { apiTeamId: 1607, national: false }, // Chicago Fire
  new_york_city: { apiTeamId: 1604, national: false }, // New York City FC
  cincinna: { apiTeamId: 2242, national: false }, // FC Cincinnati
  charlott: { apiTeamId: 18310, national: false }, // Charlotte
  new_york_red_b: { apiTeamId: 1602, national: false }, // New York Red Bulls
  dc_unit: { apiTeamId: 1615, national: false }, // DC United
  orla_city: { apiTeamId: 1598, national: false }, // Orlando City SC
  colu_crew: { apiTeamId: 1613, national: false }, // Columbus Crew
  toronto: { apiTeamId: 1601, national: false }, // Toronto FC
  phil_unio: { apiTeamId: 1599, national: false }, // Philadelphia Union
  montreal: { apiTeamId: 1614, national: false }, // CF Montreal
  atla_unit: { apiTeamId: 1608, national: false }, // Atlanta United FC

  // ---- Liga Nacional de Honduras (clubes adicionales) ----
  gnesis: { apiTeamId: 21858, national: false }, // Génesis
  estr_roja: { apiTeamId: 11370, national: false }, // Estrella Roja
  atlt_chol: { apiTeamId: 11685, national: false }, // Atlético Choloma
  atle_inde: { apiTeamId: 28005, national: false }, // Atletico Independiente
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

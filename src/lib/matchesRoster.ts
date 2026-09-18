// Roster mapping for live match sync (see src/lib/sgp.ts).
// puuids copied from lol_ranked_sync/roster.json — the same 8 players as
// src/lib/roster.ts, keyed here by their in-game puuid instead of photo id.
// Region is China server "祖安" (NJ100), same for the whole squad.

export const SGP_REGION_CODE = "NJ100";
export const SGP_BASE = "https://NJ100-sgp.lol.qq.com:21019";

// Only count a match as a "车队" game when at least this many roster
// members are on the same team (mirrors lol_ranked_sync/roster.json's
// min_team_members).
export const MIN_TEAM_MEMBERS = 3;

export type RosterMember = {
  name: string; // matches roster.ts nickname
  riotId: string;
  puuid: string;
};

export const matchesRoster: RosterMember[] = [
  { name: "很遗憾不是吗", riotId: "很遗憾不是吗#86678", puuid: "7784ed69-78f0-550f-b16c-058fd99f386a" },
  { name: "喑糖浆", riotId: "喑糖浆#93803", puuid: "a8c06ad0-2d16-520c-acdc-afe9c79628e7" },
  { name: "只怪我更爱自己", riotId: "只怪我更爱自己#74030", puuid: "9d9ee893-486a-5833-83b3-018b6b95208a" },
  { name: "变成光守护嘉然然", riotId: "变成光守护嘉然然#74339", puuid: "fd9adcf7-2535-531c-a85b-8c45256d9ece" },
  { name: "讨好冷漠", riotId: "讨好冷漠#43386", puuid: "2270b22b-bad1-50ce-a939-ba56719014b1" },
  { name: "e说句爱我好吗", riotId: "e说句爱我好吗#11807", puuid: "fdac3cee-7b6b-5315-b796-9196cf0e8932" },
  { name: "他一定比我更温柔", riotId: "他一定比我更温柔#44278", puuid: "bbc426f4-de13-54ce-a89b-f82e865da153" },
  { name: "爱人要错过", riotId: "爱人要错过#50456", puuid: "34e527a2-f53b-50be-895e-ff0947f2d734" },
];

export const rosterPuuidSet = new Set(matchesRoster.map((m) => m.puuid));
export const rosterNameByPuuid: Record<string, string> = Object.fromEntries(
  matchesRoster.map((m) => [m.puuid, m.name])
);

// Only sync matches from Beijing time 2026-09-16 00:00 onward (2026-09-15
// 16:00 UTC) — per team decision, earlier games are out of scope.
export const SYNC_SINCE_MS = Date.parse("2026-09-15T16:00:00Z");

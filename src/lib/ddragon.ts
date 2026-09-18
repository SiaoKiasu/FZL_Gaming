// Small helper for Riot's public Data Dragon CDN, used to render real item,
// champion and summoner-spell icons on the match pages. No auth needed, no
// relation to the SGP API. Item ids are the same numbers across regions/
// clients, so this works for the CN client's data without any extra
// mapping. Champion/summoner-spell images are keyed by an English "id"
// string rather than the numeric id the game data uses (e.g. championId
// 266 -> "Aatrox"), so those two need a small id -> key map fetched once
// from Data Dragon's own champion.json / summoner.json and cached.

const FALLBACK_VERSION = "14.24.1";

let cachedVersion: string | null = null;

export async function getDdragonVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  try {
    const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
      // Patch list changes at most every couple of weeks — no need to refetch every request.
      next: { revalidate: 60 * 60 * 24 },
    });
    const versions = (await res.json()) as string[];
    cachedVersion = versions[0] ?? FALLBACK_VERSION;
  } catch {
    cachedVersion = FALLBACK_VERSION;
  }
  return cachedVersion;
}

export function itemIconUrl(version: string, itemId: number | string): string | null {
  const id = Number(itemId);
  if (!id) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${id}.png`;
}

export function parseItemIds(items: string): number[] {
  return items
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

type DdragonListing = { data: Record<string, { key: string; id: string }> };

async function fetchIdKeyMap(path: string): Promise<Record<number, string>> {
  const version = await getDdragonVersion();
  try {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/${path}`, {
      next: { revalidate: 60 * 60 * 24 },
    });
    const json = (await res.json()) as DdragonListing;
    const map: Record<number, string> = {};
    for (const entry of Object.values(json.data)) {
      map[Number(entry.key)] = entry.id;
    }
    return map;
  } catch {
    return {};
  }
}

let cachedChampionMap: Record<number, string> | null = null;

/** Numeric championId -> Data Dragon image key (e.g. 266 -> "Aatrox"). */
export async function getChampionIconMap(): Promise<Record<number, string>> {
  if (!cachedChampionMap) cachedChampionMap = await fetchIdKeyMap("champion.json");
  return cachedChampionMap;
}

export function championIconUrl(
  version: string,
  championMap: Record<number, string>,
  championId: number
): string | null {
  const key = championMap[championId];
  if (!key) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${key}.png`;
}

let cachedSpellMap: Record<number, string> | null = null;

/** Numeric summoner-spell id -> Data Dragon image key (e.g. 4 -> "SummonerFlash"). */
export async function getSummonerSpellMap(): Promise<Record<number, string>> {
  if (!cachedSpellMap) cachedSpellMap = await fetchIdKeyMap("summoner.json");
  return cachedSpellMap;
}

export function summonerSpellIconUrl(
  version: string,
  spellMap: Record<number, string>,
  spellId: number
): string | null {
  const key = spellMap[spellId];
  if (!key) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${key}.png`;
}

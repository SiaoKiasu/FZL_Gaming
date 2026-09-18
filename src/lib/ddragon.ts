// Small helper for Riot's public Data Dragon CDN, used to render real item
// icons on the match detail page. No auth needed, no relation to the SGP
// API. Item ids are the same numbers across regions/clients, so this works
// for the CN client's data without any extra mapping.

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

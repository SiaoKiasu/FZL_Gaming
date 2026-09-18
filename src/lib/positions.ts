// Shared lane-position constants. Deliberately has no "server-only" import
// (unlike schedule.ts/db.ts) so client components can use it too.

export const POSITIONS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABEL: Record<Position, string> = {
  TOP: "上单",
  JUNGLE: "打野",
  MIDDLE: "中单",
  BOTTOM: "下路",
  UTILITY: "辅助",
};

export function isPosition(v: string): v is Position {
  return (POSITIONS as readonly string[]).includes(v);
}

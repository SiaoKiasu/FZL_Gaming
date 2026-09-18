// Data source: 非主流战队峡谷基金.xlsx (uploaded by the team's fund keeper).
// Kept as plain data so the fund page stays a static, honest snapshot of the
// spreadsheet — numbers here should be updated by re-syncing this file, not
// invented.

export const fundMeta = {
  name: "峡谷基金",
  trialPeriod: "试运行期：1 个月",
  keeper: "郑儿朗",
  settlementCycle: "结算周期：月度",
  duesPerPerson: 30,
  participantCount: 8,
};

export type AwardRule = {
  id: string;
  name: string;
  share: number; // fraction of pool, per 规则说明 (rules sheet)
  basis: string;
  detail: string;
};

// From 规则说明 sheet, section 二/三 — the written constitution for how the
// pool is split. (Note: 奖金结算 for this month computed amounts off a
// slightly different split — see settlement.awards below. Both are shown
// as the source spreadsheet has them.)
export const awardRules: AwardRule[] = [
  {
    id: "canyon-peak",
    name: "峡谷之巅",
    share: 0.35,
    basis: "五黑排位平均 MVP 率最高者（当月需满 5 局）",
    detail:
      "参评门槛：当月至少参加 5 局五人排位。排序依据：平均 MVP 率 = 当月 MVP 数 ÷ 当月五黑排位参战局数。并列先比平均 SVP 率，再比综合评分，仍并列则均分奖金。",
  },
  {
    id: "chosen-one",
    name: "天选之子",
    share: 0.3,
    basis: '月内「天命杯」累计 MVP 数最多者',
    detail:
      "赛制：每两周举办一次「天命杯」，每场三局，每局重新抽签分队。排序依据：当月天命杯累计 MVP 数最多者，并列先比累计 SVP 数，再比综合评分。",
  },
  {
    id: "regular-guest",
    name: "常驻嘉宾",
    share: 0.15,
    basis: "三人及以上任意模式，参与局数最多者",
    detail:
      "统计范围：三人及以上一同游戏的任意模式（排位、匹配、大乱斗、天命杯均计）。排序依据：当月参与局数最多者，并列则均分该奖金。",
  },
  {
    id: "chief-caster",
    name: "首席导播",
    share: 0.1,
    basis: "提供直播设备与画面、承担推流工作者",
    detail:
      "本质是设备与劳务补贴，不是竞技奖项。唯一贡献者直接发放；多人贡献时按承担的推流场次比例分配，有争议则群内投票。",
  },
  {
    id: "highlight",
    name: "名场面",
    share: 0.1,
    basis: "群内投票选出当月最佳 / 最炸裂名场面",
    detail:
      "任何成员可在群内提名当月的高光或搞笑片段。月底群内投票，得票最高者获得。不设门槛，人人可得。",
  },
];

export type DuesStatus = "已缴" | "未缴";

export type MemberDues = {
  nickname: string;
  amount: number;
  paidOn: string | null;
  status: DuesStatus;
  note: string | null;
};

// From 成员与缴费 sheet.
export const memberDues: MemberDues[] = [
  { nickname: "郑儿朗", amount: 30, paidOn: "2026-09-16", status: "已缴", note: "保管人" },
  { nickname: "平子哥", amount: 30, paidOn: "2026-09-16", status: "已缴", note: null },
  { nickname: "松子哥", amount: 30, paidOn: "2026-09-16", status: "已缴", note: null },
  { nickname: "帆子哥", amount: 30, paidOn: "2026-09-16", status: "已缴", note: null },
  { nickname: "峰子哥", amount: 30, paidOn: "2026-09-16", status: "已缴", note: null },
  { nickname: "志龙儿", amount: 30, paidOn: "2026-09-16", status: "已缴", note: null },
  { nickname: "kos", amount: 30, paidOn: "2026-09-16", status: "已缴", note: null },
  { nickname: "林子哥", amount: 30, paidOn: "2026-09-16", status: "已缴", note: null },
];

// From 成员ID对应表 sheet — links each member's real-life nickname (used in
// 成员与缴费 / 对局记录 / 收支流水) to their in-game ID (used on the roster
// page). rankedGames = 排位统计场次 (2026-08-20 ~ 08-31, queueId 440).
export const memberIdMap: { nickname: string; gameId: string; tag: string; rankedGames: number }[] = [
  { nickname: "志龙儿", gameId: "e说句爱我好吗", tag: "11807", rankedGames: 10 },
  { nickname: "峰子哥", gameId: "只怪我更爱自己", tag: "74030", rankedGames: 15 },
  { nickname: "平子哥", gameId: "很遗憾不是吗", tag: "86678", rankedGames: 24 },
  { nickname: "kos", gameId: "他一定比我更温柔", tag: "44278", rankedGames: 5 },
  { nickname: "松子哥", gameId: "讨好冷漠", tag: "43386", rankedGames: 19 },
  { nickname: "帆子哥", gameId: "变成光守护嘉然然", tag: "74339", rankedGames: 17 },
  { nickname: "郑儿朗", gameId: "喑糖浆", tag: "93803", rankedGames: 19 },
  { nickname: "林子哥", gameId: "爱人要错过", tag: "50456", rankedGames: 2 },
];

// From 统计排名 sheet — auto-calculated from 对局记录, which has no rows
// logged yet this trial month. Kept as zeros rather than invented numbers;
// the page shows this as a pending/empty state.
export type MemberStat = {
  nickname: string;
  rankedGames: number;
  mvp: number;
  svp: number;
  mvpRate: number;
  svpRate: number;
  qualified: boolean;
};

export const memberStats: MemberStat[] = memberDues.map((m) => ({
  nickname: m.nickname,
  rankedGames: 0,
  mvp: 0,
  svp: 0,
  mvpRate: 0,
  svpRate: 0,
  qualified: false,
}));

// From 奖金结算 sheet — this month's actual computed split. Note this sheet
// uses 30/30/15/15/10 rather than the 35/30/15/10/10 written in 规则说明
// above; shown as-is from the source rather than reconciled.
export const settlement = {
  month: "2026 年 9 月",
  totalCollected: 240,
  equipmentCost: 0,
  pool: 240,
  awards: [
    { name: "峡谷之巅", share: 0.3, amount: 72, winner: null, status: "未发放" as const },
    { name: "天选之子", share: 0.3, amount: 72, winner: null, status: "未发放" as const },
    { name: "常驻嘉宾", share: 0.15, amount: 36, winner: null, status: "未发放" as const },
    { name: "首席导播", share: 0.15, amount: 36, winner: null, status: "未发放" as const },
    { name: "名场面", share: 0.1, amount: 24, winner: null, status: "未发放" as const },
  ],
};

export type LedgerEntry = {
  date: string;
  type: "收入" | "设备支出" | "奖金支出" | "其他";
  item: string;
  income: number | null;
  expense: number | null;
  balance: number;
  handler: string;
};

// From 收支流水 sheet.
export const ledger: LedgerEntry[] = [
  {
    date: "2026-09-01",
    type: "收入",
    item: "8 人首月会费",
    income: 240,
    expense: null,
    balance: 240,
    handler: "郑儿朗",
  },
];

export const currentBalance = 240;

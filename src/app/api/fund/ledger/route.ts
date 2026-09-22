import { NextResponse } from "next/server";
import { getLedgerPasswordHash, insertLedgerEntry, isDbConfigured } from "@/lib/db";
import { verifyPassword } from "@/lib/ledgerAuth";
import { getCurrentMember } from "@/lib/session";

export const dynamic = "force-dynamic";

const LEDGER_TYPES = new Set(["收入", "设备支出", "奖金支出", "其他"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Two gates, deliberately. The session answers "who are you" and fills in
// the 经手人 field so it can't be forged; the ledger password answers "may
// you write to the books at all". They aren't redundant: a session lasts 30
// days on a device, and money entries are worth one deliberate confirmation
// on top of simply being logged in.
export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "数据库还没接好" }, { status: 503 });
  }

  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }
  const { password, date, type, item, amount } = (body ?? {}) as Record<string, unknown>;

  const stored = await getLedgerPasswordHash();
  if (!stored) {
    return NextResponse.json({ error: "还没设置密码，先完成一次性设置" }, { status: 409 });
  }
  if (typeof password !== "string" || !verifyPassword(password, stored)) {
    return NextResponse.json({ error: "密码不对" }, { status: 401 });
  }

  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "日期格式不对" }, { status: 400 });
  }
  if (typeof type !== "string" || !LEDGER_TYPES.has(type)) {
    return NextResponse.json({ error: "请选择类型" }, { status: 400 });
  }
  if (typeof item !== "string" || !item.trim()) {
    return NextResponse.json({ error: "请填写事项" }, { status: 400 });
  }
  const amountNum = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return NextResponse.json({ error: "金额要是正数" }, { status: 400 });
  }

  const rounded = Math.round(amountNum * 100) / 100;
  const isIncome = type === "收入";

  try {
    await insertLedgerEntry({
      date,
      type,
      item: item.trim(),
      income: isIncome ? rounded : null,
      expense: isIncome ? null : rounded,
      handler: member,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "记账失败" },
      { status: 500 }
    );
  }
}

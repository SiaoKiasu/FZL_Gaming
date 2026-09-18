import { NextResponse } from "next/server";
import { getLedgerPasswordHash, insertLedgerEntry, isDbConfigured } from "@/lib/db";
import { verifyPassword } from "@/lib/ledgerAuth";

export const dynamic = "force-dynamic";

const LEDGER_TYPES = new Set(["收入", "设备支出", "奖金支出", "其他"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "数据库还没接好" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }
  const { password, date, type, item, amount, handler } = (body ?? {}) as Record<string, unknown>;

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
  if (typeof handler !== "string" || !handler.trim()) {
    return NextResponse.json({ error: "请填写经手人" }, { status: 400 });
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
      handler: handler.trim(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "记账失败" },
      { status: 500 }
    );
  }
}

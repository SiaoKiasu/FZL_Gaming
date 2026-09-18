import { NextResponse } from "next/server";
import { isDbConfigured, setLedgerPasswordIfAbsent } from "@/lib/db";
import { hashPassword } from "@/lib/ledgerAuth";

export const dynamic = "force-dynamic";

// One-time claim -- whoever calls this first while no password is set yet
// becomes the only person who can submit ledger entries from then on.
// Meant to be opened once by 喑糖浆 himself; the site owner never sees the
// password because it's never echoed back or logged, only its hash stored.
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
  const { password } = (body ?? {}) as Record<string, unknown>;

  if (typeof password !== "string" || password.length < 4) {
    return NextResponse.json({ error: "密码至少 4 位" }, { status: 400 });
  }

  try {
    const claimed = await setLedgerPasswordIfAbsent(hashPassword(password));
    if (!claimed) {
      return NextResponse.json({ error: "密码已经设置过了，不能重复设置" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "设置失败" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { isDbConfigured, setLedgerPasswordIfAbsent } from "@/lib/db";
import { hashPassword, verifyPlain } from "@/lib/ledgerAuth";

export const dynamic = "force-dynamic";

// One-time claim, gated by an admin password (LEDGER_SETUP_ADMIN_PASSWORD,
// set only in Vercel's env vars) that only the site owner knows and shares
// privately with 喑糖浆 -- without this gate, whichever of the 8 members
// happened to click "设置密码" first would silently become the permanent
// ledger manager instead. Once someone submits the correct admin password
// here and claims the slot, this endpoint always refuses again (409): the
// admin password only decides *who is allowed to attempt the claim*, not
// a way to reset or take over an already-claimed slot. The ledger password
// itself is never echoed back or logged, only its hash stored, so the site
// owner has no way to see it through normal use either.
export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "数据库还没接好" }, { status: 503 });
  }

  const adminPasswordExpected = process.env.LEDGER_SETUP_ADMIN_PASSWORD;
  if (!adminPasswordExpected) {
    return NextResponse.json({ error: "管理员密码还没配置，先联系网站管理员" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }
  const { password, adminPassword } = (body ?? {}) as Record<string, unknown>;

  if (typeof adminPassword !== "string" || !verifyPlain(adminPassword, adminPasswordExpected)) {
    return NextResponse.json({ error: "管理员密码不对" }, { status: 403 });
  }

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

import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { hashPassword, verifyPlain } from "@/lib/ledgerAuth";
import { setMemberPassword } from "@/lib/members";
import { roster } from "@/lib/roster";

export const dynamic = "force-dynamic";

const KNOWN_MEMBERS = new Set(roster.map((p) => p.nickname));
const MIN_LENGTH = 6;

// Seeds or resets one member's password. Guarded by AUTH_ADMIN_PASSWORD,
// an env var only the site owner has -- the same pattern the ledger's
// one-time setup uses (LEDGER_SETUP_ADMIN_PASSWORD).
//
// Since there is no sign-up and no "forgot password" flow, this is both how
// the eight accounts get created and the only way back in for someone who
// forgets theirs.
export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "数据库还没接好" }, { status: 503 });
  }
  const adminExpected = process.env.AUTH_ADMIN_PASSWORD;
  if (!adminExpected) {
    return NextResponse.json(
      { error: "还没配 AUTH_ADMIN_PASSWORD" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }
  const { adminPassword, nickname, password } = (body ?? {}) as Record<string, unknown>;

  if (typeof adminPassword !== "string" || !verifyPlain(adminPassword, adminExpected)) {
    return NextResponse.json({ error: "管理员密码不对" }, { status: 401 });
  }
  if (typeof nickname !== "string" || !KNOWN_MEMBERS.has(nickname)) {
    return NextResponse.json({ error: "没有这个成员" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < MIN_LENGTH) {
    return NextResponse.json(
      { error: `密码至少 ${MIN_LENGTH} 位` },
      { status: 400 }
    );
  }

  await setMemberPassword(nickname, hashPassword(password));
  return NextResponse.json({ ok: true, nickname });
}

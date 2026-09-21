import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { verifyPassword } from "@/lib/ledgerAuth";
import { getMemberPasswordHash } from "@/lib/members";
import { roster } from "@/lib/roster";
import { isSessionConfigured, startSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const KNOWN_MEMBERS = new Set(roster.map((p) => p.nickname));

// One message for every failure below. Not to hide which nicknames exist --
// /roster lists all eight publicly -- but so a wrong password, a member
// whose password hasn't been seeded yet, and a typo'd nickname are
// indistinguishable to anyone probing the endpoint.
const REJECTED = "昵称或密码不对";

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "数据库还没接好" }, { status: 503 });
  }
  if (!isSessionConfigured()) {
    return NextResponse.json(
      { error: "还没配 SESSION_SECRET，登录功能不可用" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }
  const { nickname, password } = (body ?? {}) as Record<string, unknown>;

  if (typeof nickname !== "string" || !KNOWN_MEMBERS.has(nickname)) {
    return NextResponse.json({ error: REJECTED }, { status: 401 });
  }
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: REJECTED }, { status: 401 });
  }

  const stored = await getMemberPasswordHash(nickname);
  if (!stored || !verifyPassword(password, stored)) {
    return NextResponse.json({ error: REJECTED }, { status: 401 });
  }

  await startSession(nickname);
  return NextResponse.json({ ok: true, member: nickname });
}

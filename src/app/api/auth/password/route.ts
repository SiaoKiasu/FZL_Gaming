import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/ledgerAuth";
import { getMemberPasswordHash, setMemberPassword } from "@/lib/members";
import { getCurrentMember } from "@/lib/session";

export const dynamic = "force-dynamic";

const MIN_LENGTH = 6;

// Changes the password of whoever is logged in. The target is taken from
// the session, never from the body, so this can't be aimed at someone else.
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
  const { currentPassword, newPassword } = (body ?? {}) as Record<string, unknown>;

  if (typeof newPassword !== "string" || newPassword.length < MIN_LENGTH) {
    return NextResponse.json(
      { error: `新密码至少 ${MIN_LENGTH} 位` },
      { status: 400 }
    );
  }

  const stored = await getMemberPasswordHash(member);
  if (!stored) {
    return NextResponse.json({ error: "账号状态异常，联系管理员" }, { status: 409 });
  }
  if (typeof currentPassword !== "string" || !verifyPassword(currentPassword, stored)) {
    return NextResponse.json({ error: "当前密码不对" }, { status: 401 });
  }

  await setMemberPassword(member, hashPassword(newPassword));
  return NextResponse.json({ ok: true });
}

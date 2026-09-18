import { NextResponse } from "next/server";
import { getLedgerPasswordHash, isDbConfigured, updateLedgerPassword } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/ledgerAuth";

export const dynamic = "force-dynamic";

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
  const { oldPassword, newPassword } = (body ?? {}) as Record<string, unknown>;

  if (typeof newPassword !== "string" || newPassword.length < 4) {
    return NextResponse.json({ error: "新密码至少 4 位" }, { status: 400 });
  }
  if (typeof oldPassword !== "string") {
    return NextResponse.json({ error: "请填写当前密码" }, { status: 400 });
  }

  try {
    const stored = await getLedgerPasswordHash();
    if (!stored || !verifyPassword(oldPassword, stored)) {
      return NextResponse.json({ error: "当前密码不对" }, { status: 401 });
    }
    await updateLedgerPassword(hashPassword(newPassword));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "修改失败" },
      { status: 500 }
    );
  }
}

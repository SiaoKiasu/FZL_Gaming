import { NextResponse } from "next/server";
import { isSafeObjectKey } from "@/lib/cos";
import { isDbConfigured } from "@/lib/db";
import { getCurrentMember } from "@/lib/session";
import { insertVideo } from "@/lib/videos";

export const dynamic = "force-dynamic";

const MAX_TITLE = 60;
const MAX_CHAMPION = 20;
const MAX_DESCRIPTION = 200;

function optionalNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// Records a finished upload. Called after the browser has already PUT the
// file to COS. The session is checked again here rather than trusted from
// the signing call: the two routes are independently reachable, and the
// uploader is taken from the session so a row can only ever be filed under
// the person who actually sent it.
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
  const {
    objectKey, posterKey, title, champion, description,
    durationSec, sizeBytes, width, height,
  } = (body ?? {}) as Record<string, unknown>;

  // The key came back from the client, so it is re-validated rather than
  // trusted: this is what stops a crafted request from registering a row
  // that points anywhere outside the videos/ prefix.
  if (typeof objectKey !== "string" || !isSafeObjectKey(objectKey)) {
    return NextResponse.json({ error: "视频文件标识不对" }, { status: 400 });
  }
  if (posterKey !== null && posterKey !== undefined) {
    if (typeof posterKey !== "string" || !isSafeObjectKey(posterKey)) {
      return NextResponse.json({ error: "封面文件标识不对" }, { status: 400 });
    }
  }
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "给视频起个标题" }, { status: 400 });
  }
  if (title.trim().length > MAX_TITLE) {
    return NextResponse.json({ error: `标题最多 ${MAX_TITLE} 个字` }, { status: 400 });
  }
  if (typeof champion === "string" && champion.length > MAX_CHAMPION) {
    return NextResponse.json({ error: "英雄名太长了" }, { status: 400 });
  }
  if (typeof description === "string" && description.length > MAX_DESCRIPTION) {
    return NextResponse.json(
      { error: `说明最多 ${MAX_DESCRIPTION} 个字` },
      { status: 400 }
    );
  }

  try {
    const id = await insertVideo({
      objectKey,
      posterKey: typeof posterKey === "string" ? posterKey : null,
      title: title.trim(),
      member,
      champion: typeof champion === "string" && champion.trim() ? champion.trim() : null,
      description:
        typeof description === "string" && description.trim() ? description.trim() : null,
      durationSec: optionalNumber(durationSec),
      sizeBytes: optionalNumber(sizeBytes),
      width: optionalNumber(width),
      height: optionalNumber(height),
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "保存失败" },
      { status: 500 }
    );
  }
}

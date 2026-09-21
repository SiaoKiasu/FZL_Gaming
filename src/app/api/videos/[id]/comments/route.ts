import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { getCurrentMember } from "@/lib/session";
import { insertComment, videoExists } from "@/lib/videos";

export const dynamic = "force-dynamic";

const MAX_BODY = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "数据库还没接好" }, { status: 503 });
  }

  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id } = await params;
  const videoId = Number(id);
  if (!Number.isInteger(videoId) || videoId <= 0) {
    return NextResponse.json({ error: "视频不存在" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }
  const { text } = (body ?? {}) as Record<string, unknown>;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "评论不能是空的" }, { status: 400 });
  }
  if (text.trim().length > MAX_BODY) {
    return NextResponse.json({ error: `评论最多 ${MAX_BODY} 个字` }, { status: 400 });
  }

  try {
    if (!(await videoExists(videoId))) {
      return NextResponse.json({ error: "视频不存在" }, { status: 404 });
    }
    await insertComment(videoId, member, text.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "评论失败" },
      { status: 500 }
    );
  }
}

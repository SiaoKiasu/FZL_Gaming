import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { getCurrentMember } from "@/lib/session";
import { upsertRating, videoExists } from "@/lib/videos";

export const dynamic = "force-dynamic";

// The voter is the logged-in member, never a value from the body. Combined
// with the composite primary key on video_ratings, that makes one vote per
// person per video an invariant the database enforces -- not a convention
// the client is trusted to follow.
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
  const { score } = (body ?? {}) as Record<string, unknown>;
  const scoreNum = typeof score === "number" ? score : Number(score);
  if (!Number.isInteger(scoreNum) || scoreNum < 1 || scoreNum > 10) {
    return NextResponse.json({ error: "分数要在 1 到 10 之间" }, { status: 400 });
  }

  try {
    if (!(await videoExists(videoId))) {
      return NextResponse.json({ error: "视频不存在" }, { status: 404 });
    }
    await upsertRating(videoId, member, scoreNum);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "打分失败" },
      { status: 500 }
    );
  }
}

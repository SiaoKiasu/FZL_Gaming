import { NextResponse } from "next/server";
import { isCosConfigured, newObjectKey, presignUrl } from "@/lib/cos";
import { getCurrentMember } from "@/lib/session";

export const dynamic = "force-dynamic";

// Generous enough that a 6 MB upload still finishes on a bad phone
// connection, short enough that a URL lifted from the network tab is dead
// by the end of the evening.
const UPLOAD_TTL_SEC = 15 * 60;

// Hands back two pre-signed PUT URLs -- one for the video, one for the
// poster frame the browser grabs off it. Both keys are minted server-side
// (see newObjectKey), so a client can neither choose where its file lands
// nor overwrite somebody else's upload.
//
// Being logged in is the whole gate here. This route previously took a
// shared VIDEO_UPLOAD_PASSWORD, which existed to stop a stranger who found
// the URL from minting upload tokens and running up the COS bill. A login
// covers that strictly better: a shared secret spreads through group chats
// and stays valid for people who have left, whereas an account is one
// person's and can be reset on its own.
export async function POST(req: Request) {
  // Identity first, configuration second: the check is cheaper, and an
  // anonymous caller learns nothing about how this deployment is set up.
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  if (!isCosConfigured()) {
    return NextResponse.json(
      { error: "视频存储还没配好（缺 COS 环境变量）" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }
  const { ext } = (body ?? {}) as Record<string, unknown>;
  // The browser decides the container: MediaRecorder emits mp4 on Safari
  // and newer Chrome, webm elsewhere (see lib/transcode.ts). The key's
  // extension has to match what actually gets PUT, or COS will serve the
  // file with a Content-Type no player recognises.
  if (ext !== "mp4" && ext !== "webm") {
    return NextResponse.json({ error: "不支持的视频格式" }, { status: 400 });
  }

  const videoKey = newObjectKey(ext);
  const posterKey = newObjectKey("jpg");

  return NextResponse.json({
    videoKey,
    posterKey,
    videoUrl: presignUrl("put", videoKey, UPLOAD_TTL_SEC),
    posterUrl: presignUrl("put", posterKey, UPLOAD_TTL_SEC),
  });
}

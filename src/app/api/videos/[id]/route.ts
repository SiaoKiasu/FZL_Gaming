import { NextResponse } from "next/server";
import { deleteObject } from "@/lib/cos";
import { isDbConfigured } from "@/lib/db";
import { getCurrentMember } from "@/lib/session";
import { deleteVideoRow, getVideoForDeletion } from "@/lib/videos";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
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

  const video = await getVideoForDeletion(videoId);
  if (!video) {
    return NextResponse.json({ error: "视频不存在" }, { status: 404 });
  }
  // Ownership is decided here, against the session -- the client never gets
  // to say whose video this is. The UI also hides the button on other
  // people's cards, but that's cosmetic; this is the check that counts.
  if (video.member !== member) {
    return NextResponse.json({ error: "只能删自己传的视频" }, { status: 403 });
  }

  // Storage first, database last, and within storage the poster before the
  // video. A failed step aborts the whole delete and reports why, so the
  // order is chosen to make every failure both cheap and recoverable:
  //
  //   poster fails  -> nothing has changed at all; retry is a clean retry.
  //   video fails   -> only the poster is gone. The row still points at a
  //                    playable file, so the card merely loses its
  //                    thumbnail rather than breaking.
  //   row fails     -> the rarest case (one local DELETE versus two network
  //                    round trips) and the only one that leaves a card
  //                    that won't play.
  //
  // Every one of those is fixed by pressing delete again: the objects that
  // are already gone answer 404, which deleteObject treats as success, so a
  // retry walks straight through to the row.
  //
  // The opposite order -- row first -- would be worse precisely because
  // this route now fails loudly: the member would be told "删除失败" about
  // a video that had in fact already vanished from the wall, with nothing
  // left to retry against.
  if (video.posterKey) {
    const poster = await deleteObject(video.posterKey);
    if (!poster.ok) {
      return NextResponse.json(
        { error: `封面没删掉，视频也就没删：${poster.reason}` },
        { status: 502 }
      );
    }
  }

  const object = await deleteObject(video.objectKey);
  if (!object.ok) {
    return NextResponse.json(
      { error: `视频文件没删掉：${object.reason}` },
      { status: 502 }
    );
  }

  // Ratings and comments go with this row (ON DELETE CASCADE).
  await deleteVideoRow(videoId);

  return NextResponse.json({ ok: true });
}

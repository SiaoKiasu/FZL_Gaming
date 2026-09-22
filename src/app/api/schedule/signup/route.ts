import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/session";
import { isDbConfigured } from "@/lib/db";
import { deleteSignup, upsertSignup } from "@/lib/schedule";
import { isPosition } from "@/lib/positions";
import { isValidMinute, parseTimeString } from "@/lib/time";
import championMap from "@/data/champions.json";

export const dynamic = "force-dynamic";

const knownChampions = new Set(Object.values(championMap as Record<string, string>));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "数据库还没接好" }, { status: 503 });
  }

  // Identity comes from the session, so a member can only ever sign
  // themselves up -- this used to accept any roster nickname in the body,
  // which meant anyone could enter or withdraw anyone else.
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

  const { date, position, champions, declaration, startTime, endTime, endNextDay } =
    (body ?? {}) as Record<string, unknown>;

  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "日期格式不对" }, { status: 400 });
  }
  if (typeof position !== "string" || !isPosition(position)) {
    return NextResponse.json({ error: "请选择位置" }, { status: 400 });
  }
  if (!Array.isArray(champions) || champions.some((c) => typeof c !== "string")) {
    return NextResponse.json({ error: "英雄选择格式不对" }, { status: 400 });
  }
  const cleanChampions = (champions as string[])
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  if (cleanChampions.some((c) => !knownChampions.has(c))) {
    return NextResponse.json({ error: "英雄名字对不上,重新选一下" }, { status: 400 });
  }
  if (typeof declaration !== "string" || declaration.length > 140) {
    return NextResponse.json({ error: "今日宣言太长了" }, { status: 400 });
  }

  // Booking window is optional -- either both blank (no window set) or
  // both a valid "HH:MM" 5-minute-aligned string. Whether the end time is
  // on the next day is the separate, explicit `endNextDay` flag the form
  // sends (a checkbox) -- not inferred from comparing the two times.
  const startBlank = startTime === undefined || startTime === null || startTime === "";
  const endBlank = endTime === undefined || endTime === null || endTime === "";
  const crossesMidnight = endNextDay === true;
  let startMinute: number | null = null;
  let endMinute: number | null = null;
  if (!startBlank || !endBlank) {
    if (startBlank || endBlank) {
      return NextResponse.json({ error: "预约时间段要么都填，要么都留空" }, { status: 400 });
    }
    if (typeof startTime !== "string" || typeof endTime !== "string") {
      return NextResponse.json({ error: "时间格式不对" }, { status: 400 });
    }
    const s = parseTimeString(startTime);
    const e = parseTimeString(endTime);
    if (s === null || e === null || !isValidMinute(s) || !isValidMinute(e)) {
      return NextResponse.json({ error: "时间格式不对，需要 5 分钟为单位" }, { status: 400 });
    }
    // Same-day booking still needs start < end. A next-day end time has no
    // such constraint -- 20:00 today to 03:00 tomorrow, or even 20:00
    // today to 20:00 tomorrow (a full 24 hours), are both fine.
    if (!crossesMidnight && s >= e) {
      return NextResponse.json(
        { error: "结束时间要晚于开始时间（跨天的话勾选「次日」）" },
        { status: 400 }
      );
    }
    startMinute = s;
    endMinute = e;
  }

  try {
    await upsertSignup({
      date,
      member,
      position,
      champions: cleanChampions.slice(0, 3),
      declaration: declaration.trim(),
      startMinute,
      endMinute,
      endNextDay: startMinute !== null && endMinute !== null ? crossesMidnight : false,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "预约失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
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

  const { date } = (body ?? {}) as Record<string, unknown>;

  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "日期格式不对" }, { status: 400 });
  }

  try {
    await deleteSignup(date, member);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "取消失败" },
      { status: 500 }
    );
  }
}

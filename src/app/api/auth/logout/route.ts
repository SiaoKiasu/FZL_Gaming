import { NextResponse } from "next/server";
import { endSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await endSession();
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { getOpenPositions } from "@/lib/journal/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mt5_account: string }> },
) {
  const { mt5_account } = await params;
  const n = Number(mt5_account);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_account" }, { status: 400 });
  try {
    return NextResponse.json(await getOpenPositions(n));
  } catch (err) {
    return NextResponse.json({ error: "server_error", detail: String(err) }, { status: 500 });
  }
}

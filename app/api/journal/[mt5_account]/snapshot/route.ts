import { NextResponse } from "next/server";
import { getAccountSnapshotCurrent } from "@/lib/journal/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mt5_account: string }> },
) {
  const { mt5_account } = await params;
  const n = Number(mt5_account);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_account" }, { status: 400 });
  try {
    const data = await getAccountSnapshotCurrent(n);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "server_error", detail: String(err) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getDeals } from "@/lib/journal/queries";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ mt5_account: string }> },
) {
  const { mt5_account } = await params;
  const n = Number(mt5_account);
  if (!Number.isFinite(n)) return NextResponse.json({ error: "bad_account" }, { status: 400 });
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "90");
  try {
    return NextResponse.json(await getDeals(n, Number.isFinite(days) ? days : 90));
  } catch (err) {
    return NextResponse.json({ error: "server_error", detail: String(err) }, { status: 500 });
  }
}

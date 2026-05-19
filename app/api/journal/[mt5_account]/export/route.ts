import { NextResponse } from "next/server";
import { getDealsByRange, getOrdersByRange } from "@/lib/journal/queries";
import { ensureJournalAccess } from "@/lib/journal-access";
import {
  contentType,
  exportFilename,
  serializeOrders,
  serializeTrades,
  type ExportFormat,
  type ExportKind,
} from "@/lib/journal/export";

export const dynamic = "force-dynamic";

function parseKind(v: string | null): ExportKind | null {
  return v === "trades" || v === "orders" ? v : null;
}

function parseFormat(v: string | null): ExportFormat | null {
  return v === "csv" || v === "json" ? v : null;
}

function parseIsoOrNull(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ mt5_account: string }> },
) {
  const { mt5_account } = await params;
  const n = Number(mt5_account);
  if (!Number.isFinite(n)) {
    return NextResponse.json({ error: "bad_account" }, { status: 400 });
  }

  const access = await ensureJournalAccess(n);
  if (!access.allowed) {
    return NextResponse.json(
      {
        error:
          access.status === 401
            ? "unauthenticated"
            : access.status === 403
              ? "forbidden"
              : "not_found",
      },
      { status: access.status },
    );
  }

  const url = new URL(req.url);
  const kind = parseKind(url.searchParams.get("kind"));
  const format = parseFormat(url.searchParams.get("format"));
  if (!kind || !format) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const from = parseIsoOrNull(url.searchParams.get("from"));
  const to = parseIsoOrNull(url.searchParams.get("to"));

  try {
    const body =
      kind === "trades"
        ? serializeTrades(await getDealsByRange(n, from, to), format)
        : serializeOrders(await getOrdersByRange(n, from, to), format);

    const filename = exportFilename(n, kind, format, from, to);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType(format),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "server_error", detail: String(err) },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSupabaseSSR } from "@/lib/supabase/ssr";
import { createSubscriptionRequestSchema } from "@/lib/schemas";
import { sendRequestSubmittedEmail } from "@/lib/email";
import { productDisplayName } from "@/lib/products";

export async function POST(req: Request) {
  const ssr = await getSupabaseSSR();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createSubscriptionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { product, tier, notes } = parsed.data;
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("subscriptions")
    .insert({
      user_id: user.id,
      product,
      tier,
      status: "pending",
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "insert_failed", details: error.message },
      { status: 500 },
    );
  }

  // Notify admin. Email failures are logged inside lib/email and never thrown.
  const adminTo = process.env.INITIAL_ADMIN_EMAIL;
  if (adminTo) {
    void sendRequestSubmittedEmail({
      to: adminTo,
      user_email: user.email ?? "(unknown)",
      product_label: productDisplayName(product),
      tier_label: tier,
      notes: notes ?? null,
    });
  } else {
    console.warn("[api/subscriptions] INITIAL_ADMIN_EMAIL not set; skipping admin notification");
  }

  return NextResponse.json({ subscription: data }, { status: 201 });
}

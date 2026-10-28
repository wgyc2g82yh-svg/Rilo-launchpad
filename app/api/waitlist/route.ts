import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const allowedRoles = ["Token Creator", "Trader", "Community Member"];

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("waitlist")
      .select("id", { count: "exact", head: true });

    if (error) throw error;
    return NextResponse.json({ count: count ?? 0 });
  } catch {
    // The site remains usable before the database is configured.
    return NextResponse.json({ count: null, configured: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "Community Member");
    const wallet = String(body.wallet ?? "").trim().slice(0, 100);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: "Choose a valid signup type." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("waitlist").insert({
      email,
      role,
      wallet_address: wallet || null,
    });

    if (error?.code === "23505") {
      return NextResponse.json({ error: "That email is already on the waitlist." }, { status: 409 });
    }
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("not configured")) {
      return NextResponse.json(
        { error: "The waitlist is in preview mode. Connect the database to accept signups." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "We couldn't save your signup. Please try again." }, { status: 500 });
  }
}

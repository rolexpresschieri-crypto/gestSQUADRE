import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY o URL mancanti.", code: "CONFIG" },
      { status: 501 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const payload = body as {
    adminCode?: string;
    password?: string;
    fcmToken?: string;
    deviceLabel?: string;
  };

  const adminCode =
    typeof payload.adminCode === "string" ? payload.adminCode.trim().toUpperCase() : "";
  const password =
    typeof payload.password === "string" ? payload.password.trim() : "";
  const fcmToken =
    typeof payload.fcmToken === "string" ? payload.fcmToken.trim() : "";
  const deviceLabel =
    typeof payload.deviceLabel === "string" ? payload.deviceLabel.trim() : null;

  if (!adminCode || !password || !fcmToken) {
    return NextResponse.json(
      { error: "adminCode, password e fcmToken obbligatori." },
      { status: 400 },
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error } = await admin
    .from("toc_admins")
    .select("admin_code, password_hash, is_enabled")
    .eq("admin_code", adminCode)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row?.is_enabled) {
    return NextResponse.json({ error: "Credenziali non valide." }, { status: 401 });
  }
  if ((row.password_hash as string) !== password) {
    return NextResponse.json({ error: "Credenziali non valide." }, { status: 401 });
  }

  const { error: upsertErr } = await admin.from("toc_admin_fcm_tokens").upsert(
    {
      admin_code: adminCode,
      fcm_token: fcmToken,
      device_label: deviceLabel,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "admin_code,fcm_token" },
  );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, adminCode });
}

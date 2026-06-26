import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  canViewEventLogs,
  normalizeAdminRole,
  type AdminSessionData,
} from "@/lib/admin-auth";
import { SQUAD_PHOTOS_BUCKET } from "@/lib/squad-field-photos";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getServiceSupabase() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return null;
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: Request) {
  const admin = getServiceSupabase();
  if (!admin) {
    return NextResponse.json({ error: "Config Supabase mancante." }, { status: 501 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  const payload = body as {
    session?: AdminSessionData | null;
    photoId?: string;
  };

  const tocSession = payload.session;
  if (!tocSession?.code) {
    return NextResponse.json({ error: "Sessione TOC assente." }, { status: 401 });
  }

  const role = normalizeAdminRole(tocSession.role);
  if (!canViewEventLogs(role)) {
    return NextResponse.json({ error: "Ruolo non autorizzato." }, { status: 403 });
  }

  const photoId =
    typeof payload.photoId === "string" ? payload.photoId.trim() : "";
  if (!UUID_RE.test(photoId)) {
    return NextResponse.json({ error: "photoId UUID obbligatorio." }, { status: 400 });
  }

  const { data: row, error } = await admin
    .from("squad_field_photo_logs")
    .select("id, squad_code, storage_path, status")
    .eq("id", photoId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Foto non trovata." }, { status: 404 });
  }
  if (row.status !== "inviato" || !row.storage_path) {
    return NextResponse.json(
      { error: "Foto non disponibile per il download." },
      { status: 404 },
    );
  }

  const { data: blob, error: downloadErr } = await admin.storage
    .from(SQUAD_PHOTOS_BUCKET)
    .download(row.storage_path);

  if (downloadErr || !blob) {
    return NextResponse.json(
      { error: downloadErr?.message ?? "Download Storage fallito." },
      { status: 500 },
    );
  }

  const bytes = await blob.arrayBuffer();
  const code = String(row.squad_code ?? "squadra")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  const filename = `gestSQUADRE_${code}_${photoId.slice(0, 8)}.jpg`;

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { notifyTocAdminsPhotoUploaded } from "@/lib/notify-toc-photo-upload";
import {
  buildPhotoStoragePath,
  formatPhotoGpsDetail,
  insertFailedPhotoLog,
  SQUAD_PHOTOS_BUCKET,
} from "@/lib/squad-field-photos";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_NOTE_LEN = 200;
const MAX_BYTES = 2_500_000;

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
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY o URL mancanti.", code: "CONFIG" },
      { status: 501 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Form multipart non valido." }, { status: 400 });
  }

  const sessionId = String(form.get("sessionId") ?? "").trim();
  const latitude = Number(form.get("latitude"));
  const longitude = Number(form.get("longitude"));
  const accuracyRaw = form.get("accuracyM");
  const accuracyM =
    accuracyRaw != null && String(accuracyRaw).trim() !== ""
      ? Number(accuracyRaw)
      : null;
  const noteRaw = String(form.get("note") ?? "").trim();
  const note = noteRaw ? noteRaw.slice(0, MAX_NOTE_LEN) : null;
  const photo = form.get("photo");

  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "sessionId UUID obbligatorio." }, { status: 400 });
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json(
      { error: "GPS obbligatorio: coordinate non valide." },
      { status: 400 },
    );
  }
  if (!(photo instanceof Blob) || photo.size === 0) {
    return NextResponse.json({ error: "Foto JPEG obbligatoria." }, { status: 400 });
  }
  if (photo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Foto troppo grande (max 2,5 MB)." },
      { status: 400 },
    );
  }

  const { data: sessionRow, error: sessionErr } = await admin
    .from("squad_sessions")
    .select("id, is_online, event_id, squad_id, squads(squad_code, squad_name)")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionErr || !sessionRow) {
    return NextResponse.json({ error: "Sessione non trovata." }, { status: 404 });
  }
  if (!sessionRow.is_online) {
    return NextResponse.json({ error: "Sessione squadra non attiva." }, { status: 403 });
  }

  const squadRel = sessionRow.squads as
    | { squad_code: string; squad_name: string }
    | { squad_code: string; squad_name: string }[]
    | null;
  const squadMeta = Array.isArray(squadRel) ? squadRel[0] : squadRel;
  const squadCode = squadMeta?.squad_code?.trim().toUpperCase() ?? "";
  const squadName = squadMeta?.squad_name?.trim() ?? "";
  const squadId = String(sessionRow.squad_id ?? "");
  if (!squadCode || !UUID_RE.test(squadId)) {
    return NextResponse.json({ error: "Dati squadra incompleti." }, { status: 500 });
  }

  const { data: activeEvent } = await admin
    .from("events")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();
  const eventIdForLog =
    activeEvent?.id && activeEvent.id === sessionRow.event_id
      ? activeEvent.id
      : null;

  const photoId = randomUUID();
  const storagePath = buildPhotoStoragePath(squadCode, photoId);
  const buffer = Buffer.from(await photo.arrayBuffer());

  const fail = async (message: string, status = 500) => {
    await insertFailedPhotoLog(admin, {
      eventId: eventIdForLog,
      sessionId,
      squadId,
      squadCode,
      squadName,
      latitude,
      longitude,
      accuracyM:
        accuracyM != null && Number.isFinite(accuracyM) ? accuracyM : null,
      note,
      errorMessage: message,
    });
    return NextResponse.json({ error: message, status: "fallito" }, { status });
  };

  const { error: uploadErr } = await admin.storage
    .from(SQUAD_PHOTOS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (uploadErr) {
    return fail(
      uploadErr.message.includes("Bucket not found")
        ? "Bucket Storage squad-photos mancante su Supabase."
        : `Upload Storage fallito: ${uploadErr.message}`,
    );
  }

  const { data: inserted, error: insertErr } = await admin
    .from("squad_field_photo_logs")
    .insert({
      id: photoId,
      event_id: eventIdForLog,
      session_id: sessionId,
      squad_id: squadId,
      squad_code: squadCode,
      squad_name: squadName,
      latitude,
      longitude,
      accuracy_m:
        accuracyM != null && Number.isFinite(accuracyM) ? accuracyM : null,
      note,
      storage_path: storagePath,
      status: "inviato",
      error_message: null,
    })
    .select("id, created_at")
    .single();

  if (insertErr || !inserted) {
    await admin.storage.from(SQUAD_PHOTOS_BUCKET).remove([storagePath]);
    return fail(insertErr?.message ?? "Inserimento log fallito.");
  }

  void notifyTocAdminsPhotoUploaded(admin, squadCode, squadName);

  return NextResponse.json({
    ok: true,
    id: inserted.id,
    status: "inviato",
    detail: formatPhotoGpsDetail(latitude, longitude, accuracyM, note),
    createdAt: inserted.created_at,
  });
}

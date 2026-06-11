import {
  isGlobalTocAdmin,
  normalizeAdminRole,
  type AdminSessionData,
} from "@/lib/admin-auth";
import type { SupabaseClient } from "@supabase/supabase-js";

type AdminLoginRow = {
  id: string;
  admin_code: string;
  admin_name: string;
  password_hash: string;
  role: string;
  golf_course_id: string | null;
  golf_courses:
    | { id: string; course_code: string; course_name: string }
    | { id: string; course_code: string; course_name: string }[]
    | null;
};

export function adminSessionFromLoginRow(row: AdminLoginRow): AdminSessionData {
  const courseJoin = row.golf_courses;
  const course = Array.isArray(courseJoin) ? courseJoin[0] : courseJoin;
  const role = normalizeAdminRole(row.role);

  const session: AdminSessionData = {
    code: row.admin_code,
    name: row.admin_name,
    role,
    adminId: row.id,
  };

  const courseId = row.golf_course_id ?? course?.id;
  if (courseId) {
    session.golfCourseId = courseId;
    session.golfCourseCode = course?.course_code ?? undefined;
    session.golfCourseName = course?.course_name ?? undefined;
  }

  return session;
}

export async function loginTocAdmin(
  supabase: SupabaseClient,
  loginCode: string,
  loginPassword: string,
): Promise<{ session?: AdminSessionData; error?: string }> {
  const { data, error } = await supabase
    .from("toc_admins")
    .select(
      "id, admin_code, admin_name, password_hash, role, is_enabled, golf_course_id, golf_courses(id, course_code, course_name)",
    )
    .eq("admin_code", loginCode.trim().toUpperCase())
    .eq("is_enabled", true)
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: "Credenziali non valide." };
  }
  if ((data.password_hash as string) !== loginPassword.trim()) {
    return { error: "Password errata." };
  }

  const session = adminSessionFromLoginRow(data as AdminLoginRow);
  if (!session.golfCourseId && !isGlobalTocAdmin(session)) {
    return {
      error:
        "Admin senza campo golf associato: crea golf_courses e imposta golf_course_id su toc_admins (vedi sql/k9_nvansmi_campo.sql).",
    };
  }

  return { session };
}

export function restoreAdminSessionFromStorage(raw: string): AdminSessionData | null {
  try {
    const parsed = JSON.parse(raw) as AdminSessionData;
    const session: AdminSessionData = {
      code: parsed.code,
      name: parsed.name,
      role: normalizeAdminRole(parsed.role),
      adminId: parsed.adminId,
      golfCourseId: parsed.golfCourseId,
      golfCourseCode: parsed.golfCourseCode,
      golfCourseName: parsed.golfCourseName,
    };
    if (!session.golfCourseId && !isGlobalTocAdmin(session)) {
      return null;
    }
    if (session.role === "campo" && !session.golfCourseId) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

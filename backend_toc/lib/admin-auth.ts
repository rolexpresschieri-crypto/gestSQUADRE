export const ADMIN_SESSION_STORAGE_KEY = "gest_squadre_toc_session";

export type AdminRole = "admin" | "viewer" | "campo";

export type AdminSessionData = {
  code: string;
  name: string;
  role: AdminRole;
  adminId?: string;
  golfCourseId?: string;
  golfCourseCode?: string;
  golfCourseName?: string;
};

/** Unico login TOC globale (tutte le squadre / waypoint). */
export const GLOBAL_TOC_ADMIN_CODES = new Set(["TOC01"]);

export function isGlobalTocAdmin(session: AdminSessionData | null): boolean {
  const code = session?.code?.trim().toUpperCase();
  return Boolean(code && GLOBAL_TOC_ADMIN_CODES.has(code));
}

/** Sessione legata a un campo golf (es. GOLF_TORINO → golf_torino). */
export function isCampoGolfSession(session: AdminSessionData | null): boolean {
  return Boolean(session?.golfCourseId);
}

export function normalizeAdminRole(value: string | null | undefined): AdminRole {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (v === "viewer") {
    return "viewer";
  }
  if (v === "campo") {
    return "campo";
  }
  return "admin";
}

export function canManageWaypoints(role: AdminRole): boolean {
  return role === "admin" || role === "campo";
}

export function canViewEventLogs(role: AdminRole): boolean {
  return role === "admin" || role === "viewer";
}

export function canManageEventLogs(role: AdminRole): boolean {
  return role === "admin";
}

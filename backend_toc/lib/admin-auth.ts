export const ADMIN_SESSION_STORAGE_KEY = "gest_squadre_toc_session";

export type AdminRole = "admin" | "viewer" | "campo";

export type AdminSessionData = {
  code: string;
  name: string;
  role: AdminRole;
  adminId?: string;
};

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

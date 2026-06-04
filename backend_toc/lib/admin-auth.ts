export const ADMIN_SESSION_STORAGE_KEY = "gest_squadre_toc_session";

export type AdminRole = "admin" | "viewer";

export type AdminSessionData = {
  code: string;
  name: string;
  role: AdminRole;
  adminId?: string;
};

export function normalizeAdminRole(value: string | null | undefined): AdminRole {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v === "viewer" ? "viewer" : "admin";
}

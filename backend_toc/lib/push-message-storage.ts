export const PUSH_TITLE_STORAGE_KEY = "gest_squadre_last_push_title";
export const PUSH_BODY_STORAGE_KEY = "gest_squadre_last_push_body";

export function readStoredPushTitle(fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  return window.localStorage.getItem(PUSH_TITLE_STORAGE_KEY)?.trim() || fallback;
}

export function readStoredPushBody(fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  return window.localStorage.getItem(PUSH_BODY_STORAGE_KEY)?.trim() || fallback;
}

export function writeStoredPushMessage(title: string, body: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(PUSH_TITLE_STORAGE_KEY, title);
  window.localStorage.setItem(PUSH_BODY_STORAGE_KEY, body);
}

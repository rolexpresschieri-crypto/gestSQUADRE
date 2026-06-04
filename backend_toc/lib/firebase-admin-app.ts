import { existsSync, readFileSync } from "fs";
import path from "path";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

function parseJsonRaw(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readServiceAccountFromPath(): Record<string, unknown> | null {
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!pathEnv) {
    return null;
  }
  const resolved = path.isAbsolute(pathEnv)
    ? pathEnv
    : path.join(process.cwd(), pathEnv);
  if (!existsSync(resolved)) {
    return null;
  }
  try {
    return parseJsonRaw(readFileSync(resolved, "utf8"));
  } catch {
    return null;
  }
}

function parseServiceAccount(): Record<string, unknown> | null {
  const fromPath = readServiceAccountFromPath();
  if (fromPath) {
    return fromPath;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw || raw.startsWith("NEXT_PUBLIC_") || raw.includes("SUPABASE_URL=")) {
    return null;
  }
  return parseJsonRaw(raw);
}

export function getFirebaseAdminDiagnostics(): {
  pathSet: boolean;
  pathExists: boolean;
  jsonEnvSet: boolean;
  parseOk: boolean;
  adminReady: boolean;
} {
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  const resolved = pathEnv
    ? path.isAbsolute(pathEnv)
      ? pathEnv
      : path.join(process.cwd(), pathEnv)
    : "";
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const parseOk = parseServiceAccount() !== null;
  return {
    pathSet: Boolean(pathEnv),
    pathExists: Boolean(resolved && existsSync(resolved)),
    jsonEnvSet: Boolean(raw && raw.length > 20),
    parseOk,
    adminReady: Boolean(getFirebaseAdminMessaging()),
  };
}
export function getFirebaseAdminMessaging(): Messaging | null {
  const sa = parseServiceAccount();
  if (!sa) {
    return null;
  }
  let app: App;
  if (getApps().length === 0) {
    app = initializeApp({ credential: cert(sa as Parameters<typeof cert>[0]) });
  } else {
    app = getApps()[0]!;
  }
  return getMessaging(app);
}

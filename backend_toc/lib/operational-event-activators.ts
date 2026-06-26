/** Squadre che aprono un evento operativo inviando allarme dal campo (TOC attivatori). */
const OPERATIONAL_EVENT_ACTIVATOR_CODES = new Set([
  "01_TOC",
  "01_RR",
  "GT_01_TOC",
  "GT_01_RR",
]);

const ACTIVATOR_SUFFIXES = ["_01_TOC", "_01_RR"] as const;

export function isOperationalEventActivatorSquad(squadCode: string): boolean {
  const code = squadCode.trim().toUpperCase();
  if (!code) {
    return false;
  }
  if (OPERATIONAL_EVENT_ACTIVATOR_CODES.has(code)) {
    return true;
  }
  return ACTIVATOR_SUFFIXES.some((suffix) => code.endsWith(suffix));
}

export const OPERATIONAL_EVENT_ACTIVATOR_LABEL = "01_TOC, 01_RR (es. GT_01_TOC, GT_01_RR)";

/** Squadre che aprono un evento operativo inviando allarme dal campo (TOC attivatori). */
const OPERATIONAL_EVENT_ACTIVATOR_SUFFIXES = [
  "_01_AN",
  "_01_EN",
  "_01_RR",
  "_01_TOC",
  "_01_UN",
] as const;

const OPERATIONAL_EVENT_ACTIVATOR_CODES = new Set(
  OPERATIONAL_EVENT_ACTIVATOR_SUFFIXES.flatMap((suffix) => [
    suffix.slice(1),
    `GT${suffix}`,
  ]),
);

export function isOperationalEventActivatorSquad(squadCode: string): boolean {
  const code = squadCode.trim().toUpperCase();
  if (!code) {
    return false;
  }
  if (OPERATIONAL_EVENT_ACTIVATOR_CODES.has(code)) {
    return true;
  }
  return OPERATIONAL_EVENT_ACTIVATOR_SUFFIXES.some((suffix) => code.endsWith(suffix));
}

export const OPERATIONAL_EVENT_ACTIVATOR_LABEL =
  "01_AN, 01_EN, 01_RR, 01_TOC, 01_UN (es. GT_01_AN)";

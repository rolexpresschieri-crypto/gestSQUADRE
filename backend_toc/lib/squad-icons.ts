export type SquadIconKey =
  | "ambulanza"
  | "squadre_a_piedi"
  | "coordinatore_cri"
  | "vigili_fuoco"
  | "forze_ordine"
  | "medico";

export type SquadIconOption = {
  key: SquadIconKey;
  label: string;
  mapUrl: string;
};

/** Icone squadra (fig. 1): TOC resta solo tra i waypoint. */
export const SQUAD_ICON_OPTIONS: SquadIconOption[] = [
  { key: "ambulanza", label: "Ambulanza", mapUrl: "/map/squad/ambulanza.png" },
  { key: "squadre_a_piedi", label: "Squadre a piedi", mapUrl: "/map/squad/squadre_a_piedi.png" },
  {
    key: "coordinatore_cri",
    label: "Coordinatore CRI",
    mapUrl: "/map/squad/coordinatore_cri.png",
  },
  { key: "vigili_fuoco", label: "Vigili del fuoco", mapUrl: "/map/squad/vigili_fuoco.png" },
  { key: "forze_ordine", label: "Forze dell'ordine", mapUrl: "/map/squad/forze_ordine.png" },
  { key: "medico", label: "Medico", mapUrl: "/map/squad/medico.png" },
];

export const DEFAULT_SQUAD_ICON_KEY: SquadIconKey = "squadre_a_piedi";

const URL_BY_KEY = Object.fromEntries(
  SQUAD_ICON_OPTIONS.map((o) => [o.key, o.mapUrl]),
) as Record<SquadIconKey, string>;

export function normalizeSquadIconKey(raw: string | null | undefined): SquadIconKey {
  const k = (raw ?? "").trim();
  if (k in URL_BY_KEY) {
    return k as SquadIconKey;
  }
  return DEFAULT_SQUAD_ICON_KEY;
}

export function squadIconMapUrl(iconKey: string | null | undefined): string {
  return URL_BY_KEY[normalizeSquadIconKey(iconKey)];
}

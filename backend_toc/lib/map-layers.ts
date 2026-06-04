export type LayerMode = "standard" | "orthophoto";

export const layerOptions = [
  { value: "standard" as const, label: "Standard (strade)" },
  { value: "orthophoto" as const, label: "Ortofoto" },
];

export function getMapTileConfig(layerMode: LayerMode): {
  url: string;
  attribution: string;
} {
  if (layerMode === "orthophoto") {
    return {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution:
        "&copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    };
  }
  return {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  };
}

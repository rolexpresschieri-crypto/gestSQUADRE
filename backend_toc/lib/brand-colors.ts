/** Pantone 7427 C — CMYK 0, 100, 68, 35 */
export const BRAND_RGB = { r: 166, g: 0, b: 53 } as const;
export const BRAND_HEX = "#A60035";

/** Overlay non troppo pesante sul fondo scuro */
export const BRAND_OVERLAY_ALPHA = 0.38;

export const brandBackgroundCss = `
  linear-gradient(
    180deg,
    rgba(${BRAND_RGB.r}, ${BRAND_RGB.g}, ${BRAND_RGB.b}, ${BRAND_OVERLAY_ALPHA}) 0%,
    rgba(120, 0, 40, 0.48) 55%,
    rgba(70, 0, 24, 0.55) 100%
  ),
  #0a0607
`;

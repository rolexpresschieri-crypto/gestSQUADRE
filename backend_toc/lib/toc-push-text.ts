/** Testi push TOC sempre in maiuscolo (stile operativo / AllarmeApp). */
export function tocPushTextUpper(text: string): string {
  return text.trim().toLocaleUpperCase("it-IT");
}

/** Aggiunge il target waypoint al testo push/log se non già presente. */
export function tocPushBodyWithTarget(
  body: string,
  targetLabel: string | null | undefined,
): string {
  const label = targetLabel?.trim();
  if (!label) {
    return body;
  }
  const upperLabel = tocPushTextUpper(label);
  if (body.includes(upperLabel)) {
    return body;
  }
  return tocPushTextUpper(`${body} — TARGET ${label}`);
}

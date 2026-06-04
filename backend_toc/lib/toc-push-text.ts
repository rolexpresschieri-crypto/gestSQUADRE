/** Testi push TOC sempre in maiuscolo (stile operativo / AllarmeApp). */
export function tocPushTextUpper(text: string): string {
  return text.trim().toLocaleUpperCase("it-IT");
}

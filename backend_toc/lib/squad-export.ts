export type SquadExportRow = {
  squadCode: string;
  squadName: string;
  password: string;
  isEnabled: boolean;
  mapColor: string | null;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sortSquadsForExport(rows: SquadExportRow[]): SquadExportRow[] {
  return [...rows].sort((a, b) =>
    a.squadCode.localeCompare(b.squadCode, "it", { sensitivity: "base" }),
  );
}

export function squadsPrintHtml(
  rows: SquadExportRow[],
  courseLabel: string,
  courseCode: string,
): string {
  const sorted = sortSquadsForExport(rows);
  const exportedAt = new Date().toLocaleString("it-IT");
  const bodyRows = sorted
    .map(
      (r) => `<tr>
        <td><strong>${escapeHtml(r.squadCode)}</strong></td>
        <td>${escapeHtml(r.squadName)}</td>
        <td>${escapeHtml(r.password)}</td>
        <td>${r.isEnabled ? "Attiva" : "Disabilitata"}</td>
        <td><span class="colorSwatch" style="background:${escapeHtml(r.mapColor?.trim() || "#079B42")}"></span> ${escapeHtml(r.mapColor?.trim() || "#079B42")}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Squadre ${escapeHtml(courseCode)} — gestSQUADRE</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    body { font-family: system-ui, sans-serif; padding: 16px; color: #111; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    p.meta { font-size: 12px; color: #444; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #bbb; padding: 7px 8px; text-align: left; vertical-align: middle; }
    th { background: #eee; font-weight: 700; }
    .colorSwatch { display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 1px solid #999; vertical-align: middle; margin-right: 4px; }
    tfoot td { border: none; padding-top: 12px; font-size: 11px; color: #555; }
  </style>
</head>
<body>
  <h1>Anagrafica squadre — ${escapeHtml(courseLabel)}</h1>
  <p class="meta">Campo: ${escapeHtml(courseCode)} · Esportato: ${escapeHtml(exportedAt)} · Ordine: codice squadra (A→Z)</p>
  <table>
    <thead>
      <tr>
        <th>Codice squadra</th>
        <th>Nome squadra</th>
        <th>Password app</th>
        <th>Stato</th>
        <th>Colore mappa</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    <tfoot>
      <tr><td colspan="5">Totale squadre: ${sorted.length}</td></tr>
    </tfoot>
  </table>
</body>
</html>`;
}

/** Apre la finestra di stampa (Salva come PDF) senza popup bloccati. */
export function printSquadsAsPdf(
  rows: SquadExportRow[],
  courseLabel: string,
  courseCode: string,
): boolean {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Export squadre gestSQUADRE");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    document.body.removeChild(iframe);
    return false;
  }

  doc.open();
  doc.write(squadsPrintHtml(rows, courseLabel, courseCode));
  doc.close();

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      window.setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1500);
    }
  };

  if (doc.readyState === "complete") {
    window.setTimeout(triggerPrint, 250);
  } else {
    iframe.onload = () => window.setTimeout(triggerPrint, 250);
  }

  return true;
}

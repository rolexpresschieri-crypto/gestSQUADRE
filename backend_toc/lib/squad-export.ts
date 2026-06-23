import { squadIconMapUrl } from "@/lib/squad-icons";

export type SquadExportRow = {
  squadCode: string;
  squadName: string;
  isEnabled: boolean;
  mapIconKey: string | null;
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

function squadIconHtml(mapIconKey: string | null, assetBaseUrl: string): string {
  const src = `${assetBaseUrl}${squadIconMapUrl(mapIconKey)}`;
  return `<img class="squadIcon" src="${escapeHtml(src)}" alt="" width="18" height="18" />`;
}

export function squadsPrintHtml(
  rows: SquadExportRow[],
  courseLabel: string,
  courseCode: string,
  assetBaseUrl = "",
): string {
  const sorted = sortSquadsForExport(rows);
  const exportedAt = new Date().toLocaleString("it-IT");
  const bodyRows = sorted
    .map((r) => {
      return `<tr>
        <td class="codeCell">
          ${squadIconHtml(r.mapIconKey, assetBaseUrl)}
          <strong>${escapeHtml(r.squadCode)}</strong>
        </td>
        <td>${escapeHtml(r.squadName)}</td>
        <td>${r.isEnabled ? "Attiva" : "Disabilitata"}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Elenco squadre — gestSQUADRE</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    html, body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { font-family: system-ui, sans-serif; padding: 16px; color: #111; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    p.meta { font-size: 12px; color: #444; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #bbb; padding: 7px 8px; text-align: left; vertical-align: middle; }
    th { background: #eee; font-weight: 700; }
    .codeCell { white-space: nowrap; }
    .squadIcon {
      display: inline-block;
      width: 18px;
      height: 18px;
      margin-right: 6px;
      vertical-align: middle;
      object-fit: contain;
    }
    tfoot td { border: none; padding-top: 12px; font-size: 11px; color: #555; }
  </style>
</head>
<body>
  <h1>Elenco squadre — ${escapeHtml(courseLabel)}</h1>
  <p class="meta">Campo: ${escapeHtml(courseCode)} · Esportato: ${escapeHtml(exportedAt)} · Ordine: codice squadra (A→Z)</p>
  <table>
    <thead>
      <tr>
        <th>Codice squadra</th>
        <th>Nome squadra</th>
        <th>Stato</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    <tfoot>
      <tr><td colspan="3">Totale squadre: ${sorted.length}</td></tr>
    </tfoot>
  </table>
</body>
</html>`;
}

/** Apre la finestra di stampa (Salva come PDF); il nome file lo scegli tu nel browser. */
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

  const assetBaseUrl = window.location.origin;

  doc.open();
  doc.write(squadsPrintHtml(rows, courseLabel, courseCode, assetBaseUrl));
  doc.close();

  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 1500);
  };

  const triggerPrint = () => {
    const waitForImages = (onReady: () => void) => {
      const imgs = Array.from(doc.images);
      if (imgs.length === 0) {
        onReady();
        return;
      }
      let pending = imgs.length;
      const done = () => {
        pending -= 1;
        if (pending <= 0) {
          onReady();
        }
      };
      for (const img of imgs) {
        if (img.complete) {
          done();
        } else {
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        }
      }
    };

    waitForImages(() => {
      try {
        win.focus();
        win.print();
      } finally {
        cleanup();
      }
    });
  };

  if (doc.readyState === "complete") {
    window.setTimeout(triggerPrint, 100);
  } else {
    iframe.onload = () => window.setTimeout(triggerPrint, 100);
  }

  return true;
}

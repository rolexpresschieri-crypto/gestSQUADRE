#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera PDF guida installazione iOS gestSQUADRE."""

from fpdf import FPDF
from pathlib import Path

OUT = Path(__file__).resolve().parent / "INSTALL-IOS-IPHONE.pdf"
FONT = "/Library/Fonts/Arial Unicode.ttf"


class GuidePDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Arial", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, "gestSQUADRE - Installazione iPhone", align="R", new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def footer(self):
        self.set_y(-15)
        self.set_font("Arial", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Pagina {self.page_no()}/{{nb}}", align="C")

    def section_title(self, text: str):
        self.ln(4)
        self.set_font("Arial", "B", 13)
        self.set_text_color(30, 60, 120)
        self.multi_cell(0, 7, text, new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(30, 60, 120)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(3)

    def sub_title(self, text: str):
        self.ln(2)
        self.set_font("Arial", "B", 11)
        self.set_text_color(50, 50, 50)
        self.multi_cell(0, 6, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def body(self, text: str):
        self.set_font("Arial", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.5, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def bullet(self, text: str):
        self.set_font("Arial", "", 10)
        self.set_text_color(30, 30, 30)
        x = self.l_margin
        self.set_x(x)
        self.cell(5, 5.5, chr(8226))
        self.multi_cell(0, 5.5, text, new_x="LMARGIN", new_y="NEXT")

    def numbered(self, n: int, text: str):
        self.set_font("Arial", "", 10)
        self.set_text_color(30, 30, 30)
        self.set_x(self.l_margin)
        self.cell(8, 5.5, f"{n}.")
        self.multi_cell(0, 5.5, text, new_x="LMARGIN", new_y="NEXT")

    def code_block(self, text: str):
        self.set_fill_color(245, 245, 245)
        self.set_font("Arial", "", 9)
        self.set_text_color(20, 20, 20)
        for line in text.strip().split("\n"):
            self.cell(0, 5, "  " + line, fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def table(self, headers, rows, col_widths=None):
        if col_widths is None:
            w = (self.w - self.l_margin - self.r_margin) / len(headers)
            col_widths = [w] * len(headers)
        self.set_font("Arial", "B", 9)
        self.set_fill_color(230, 235, 245)
        self.set_text_color(30, 30, 30)
        for i, h in enumerate(headers):
            self.cell(col_widths[i], 7, h, border=1, fill=True)
        self.ln()
        self.set_font("Arial", "", 9)
        for row in rows:
            max_h = 7
            x0, y0 = self.get_x(), self.get_y()
            heights = []
            for i, cell in enumerate(row):
                self.set_xy(x0 + sum(col_widths[:i]), y0)
                self.multi_cell(col_widths[i], 5, cell, border=0)
                heights.append(self.get_y() - y0)
            row_h = max(max(heights), 7)
            for i in range(len(row)):
                self.rect(x0 + sum(col_widths[:i]), y0, col_widths[i], row_h)
            self.set_xy(x0, y0 + row_h)
        self.ln(3)


def build():
    pdf = GuidePDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_font("Arial", "", FONT)
    pdf.add_font("Arial", "B", FONT)
    pdf.add_font("Arial", "I", FONT)
    pdf.add_page()

    # Titolo
    pdf.set_font("Arial", "B", 18)
    pdf.set_text_color(30, 60, 120)
    pdf.multi_cell(0, 10, "Installazione gestSQUADRE su iPhone\n(senza cavo Mac)", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_font("Arial", "I", 10)
    pdf.set_text_color(80, 80, 80)
    pdf.multi_cell(0, 5, "Guida operativa - test iPhone 12, installazione via Diawi / IPA ad-hoc", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    pdf.section_title("Cosa ti serve")
    pdf.table(
        ["Requisito", "Perch\u00e9"],
        [
            ["Apple Developer a pagamento (99 \u20ac/anno)", "IPA ad-hoc e profili multi-dispositivo"],
            ["Mac (solo per generare l'IPA)", "Il telefono non deve essere collegato al Mac"],
            ["Elenco UDID di tutti gli iPhone tester", "Firma ad-hoc"],
            ["Link Diawi (o equivalente)", "Installazione da Safari"],
        ],
        [55, 125],
    )
    pdf.body("Bundle app: com.ansmi.gestsquadre")

    pdf.section_title("Parte 1 - Raccogliere l'UDID (ogni iPhone)")
    pdf.body(
        "L'UDID identifica il telefono in modo univoco. Senza UDID registrato, "
        "l'installazione fallisce con errore: \u00abimpossibile verificarne l'integrit\u00e0\u00bb."
    )
    pdf.sub_title("Metodo A - Safari sul telefono (consigliato, senza Mac)")
    pdf.numbered(1, "Sul Safari dell'iPhone apri: https://udid.tech/")
    pdf.numbered(2, "Segui i passi (installa profilo temporaneo, poi Consenti)")
    pdf.numbered(3, "Copia l'UDID (es. 00008030-001A4D2E3CXXXXX)")
    pdf.numbered(4, 'Invialo a te stesso (email / WhatsApp) con il nome del telefono (es. "iPhone 12 Mario")')
    pdf.body("Usa Safari, non Chrome.")
    pdf.sub_title("Metodo B - PC Windows + iTunes")
    pdf.numbered(1, "Collega iPhone al PC")
    pdf.numbered(2, "iTunes > icona dispositivo > Numero di serie (clic per vedere UDID)")
    pdf.numbered(3, "Copia l'UDID")
    pdf.sub_title("Metodo C - Mac + Xcode (se hai cavo)")
    pdf.numbered(1, "Xcode > Window > Devices and Simulators")
    pdf.numbered(2, "Seleziona l'iPhone > Identifier = UDID")

    pdf.section_title("Parte 2 - Registrare i dispositivi (tutti insieme)")
    pdf.body(
        "Conviene registrare tutti gli UDID prima di generare l'IPA: una sola IPA per tutti i telefoni elencati."
    )
    pdf.numbered(1, "developer.apple.com > login")
    pdf.numbered(2, "Account > Devices > +")
    pdf.numbered(3, "Tipo: iPhone (o iPad)")
    pdf.numbered(4, "Nome descrittivo + UDID")
    pdf.numbered(5, "Ripeti per ogni telefono tester")
    pdf.body("Limite: 100 dispositivi/anno (account a pagamento).")
    pdf.body("Se aggiungi un nuovo telefono dopo aver buildato l'IPA: registra UDID, poi rigenera IPA sul Mac.")

    pdf.section_title("Parte 3 - Generare l'IPA sul Mac")
    pdf.code_block("cd ~/Desktop/Sviluppo/gestSQUADRE/app_mobile/kmp\n./kmp-dev.sh ios-ipa-adhoc")
    pdf.body("Output: app_mobile/kmp/gestSQUADRE_iOS_1.0.2.ipa")
    pdf.body("Verifica in home app (build debug): etichetta tipo iOS 1.0.2 (5) - il numero tra parentesi \u00e8 il build.")

    pdf.section_title("Parte 4 - Checklist PRIMA dell'installazione")
    pdf.table(
        ["#", "Impostazione", "Dove", "Valore"],
        [
            ["1", "iOS", "-", "16 o superiore"],
            ["2", "Localizzazione", "Impostazioni > Privacy > Localizzazione", "ON"],
            ["3", "Rete", "-", "Wi-Fi o 4G/5G stabile"],
            ["4", "Spazio libero", "-", "almeno ~50 MB"],
        ],
        [8, 35, 70, 67],
    )
    pdf.body("Non serve aver collegato l'iPhone al Mac.")

    pdf.section_title("Parte 5 - Installare da Diawi")
    pdf.numbered(1, "Carica gestSQUADRE_iOS_1.0.2.ipa su https://www.diawi.com")
    pdf.numbered(2, "Apri il link da Safari sull'iPhone")
    pdf.numbered(3, "Installa")
    pdf.numbered(4, "Errore integrit\u00e0/verifica: UDID non nel profilo - torna a Parte 2 + rigenera IPA")

    pdf.section_title("Parte 6 - Checklist DOPO l'installazione")
    pdf.sub_title("6.1 Modalit\u00e0 sviluppatore (iOS 16+)")
    pdf.numbered(1, "Impostazioni > Privacy e sicurezza")
    pdf.numbered(2, "Modalit\u00e0 sviluppatore > Attiva")
    pdf.numbered(3, "Inserisci codice iPhone > Riavvia se richiesto")
    pdf.numbered(4, "Dopo riavvio: riattiva Modalit\u00e0 sviluppatore")
    pdf.body("Se la voce non compare: reinstalla da Safari e riprova.")
    pdf.sub_title("6.2 Fidati del profilo sviluppatore")
    pdf.body("Impostazioni > Generali > VPN e gestione dispositivo > profilo gestSQUADRE > Fidati")
    pdf.sub_title("6.3 Posizione (obbligatoria per mappa TOC)")
    pdf.table(
        ["Opzione", "Valore"],
        [
            ["Autorizzazione", "Durante l'uso dell'app"],
            ["Posizione precisa", "ON (se presente)"],
        ],
        [80, 100],
    )
    pdf.sub_title("6.4 Notifiche (per push TOC)")
    pdf.body("Impostazioni > gestSQUADRE > Notifiche > Consenti")
    pdf.body("Senza notifiche il pannello blu in app pu\u00f2 funzionare; il banner di sistema no.")

    pdf.section_title("Parte 7 - Verifica in app (dopo login)")
    pdf.table(
        ["Controllo", "Esito atteso"],
        [
            ["Box squadra verde", "Nome squadra + ora login"],
            ["Riga GPS", 'Prima "GPS: in attesa di fix...", poi "GPS inviato al TOC \u00b7 precisione \u00b1 X m"'],
            ["App aperta", "GPS iOS invia solo a app aperta (non in background)"],
            ["TOC gest-squadre.vercel.app", "Log login + pallino su mappa (dopo GPS)"],
            ["Lista allarme", "Sanitario, Security, Vigili del Fuoco, Strutture, Altro"],
        ],
        [55, 125],
    )
    pdf.sub_title("GPS lento o in attesa di fix")
    pdf.bullet("Resta all'aperto o vicino a finestra")
    pdf.bullet("Tieni l'app aperta 1-2 minuti")
    pdf.bullet("Non bloccare lo schermo subito")
    pdf.sub_title("Login OK ma niente sulla mappa")
    pdf.bullet('Aspetta "GPS inviato al TOC"')
    pdf.bullet("Sul TOC: Ricentra mappa")
    pdf.bullet("Verifica stesso campo del login TOC (es. GOLF_TORINO)")

    pdf.section_title("Parte 8 - Problemi frequenti")
    pdf.table(
        ["Sintomo", "Causa", "Cosa fare"],
        [
            ["Impossibile verificarne l'integrit\u00e0", "UDID non nel profilo", "Registra UDID > nuova IPA"],
            ["App sloggata, TOC online", "Bug sessione iOS (build < 5)", "Logout TOC > login; build 5+"],
            ["Push non arriva", "APNs non in Firebase", "Vedi PUSH-IOS-SETUP.md"],
            ["Squadra gi\u00e0 attiva", "Sessione fantasma", "Logout dal TOC > riprova"],
            ["Solo log login, no mappa", "GPS non inviato", "Permesso posizione + attesa fix"],
        ],
        [55, 50, 75],
    )

    pdf.section_title("Parte 9 - Quando rigenerare l'IPA")
    pdf.table(
        ["Situazione", "Nuova IPA?"],
        [
            ["Nuovo iPhone (nuovo UDID)", "S\u00ec (dopo registrazione UDID)"],
            ["Fix app / nuovo build", "S\u00ec"],
            ["Stessi telefoni, stessa versione", "No - stesso file per tutti"],
        ],
        [120, 60],
    )

    pdf.section_title("Riepilogo flusso consigliato")
    pdf.code_block(
        "1. Raccogli UDID di TUTTI gli iPhone (Safari > udid.tech)\n"
        "2. Registra tutti su developer.apple.com > Devices\n"
        "3. Mac: ./kmp-dev.sh ios-ipa-adhoc  (una volta)\n"
        "4. Diawi > link > Safari su ogni iPhone\n"
        "5. Modalit\u00e0 sviluppatore + Fidati profilo\n"
        "6. Posizione + Notifiche per gestSQUADRE\n"
        "7. Login > attendi GPS > verifica mappa TOC"
    )

    pdf.section_title("Link utili")
    pdf.bullet("TOC produzione: https://gest-squadre.vercel.app")
    pdf.bullet("Push iOS / Firebase: docs/PUSH-IOS-SETUP.md")
    pdf.bullet("Deploy backend: docs/DEPLOY-VERCEL.md")

    pdf.output(str(OUT))
    print(f"PDF creato: {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    build()

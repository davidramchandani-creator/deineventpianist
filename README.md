# deineventpianist.ch

Webseite von David Ramchandani, Pianist für Hochzeiten, Dinners und Anlässe.

- `index.html`: die ganze Seite (Konfigurator-Logik und Kontaktdaten im `<script>`-Block ganz unten; Telefonnummer im `KONTAKT`-Objekt eintragen)
- `api/anfrage.js`: Vercel Serverless Function, verschickt Anfragen per Resend und speichert sie in Supabase (`pianist_anfragen`)
- Deployment: automatisch bei jedem Push auf `main` (Vercel, Git-Integration)

Umgebungsvariablen in Vercel: `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (optional `NOTIFY_EMAIL`, `FROM_EMAIL`).

Referenzvideos: im Abschnitt «Referenzen» bei den `data-embed=""` Attributen die YouTube- oder Vimeo-Embed-URL eintragen.

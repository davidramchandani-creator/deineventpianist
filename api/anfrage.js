// Vercel Serverless Function: nimmt Anfragen vom Formular entgegen,
// speichert sie in Supabase (Tabelle pianist_anfragen) und verschickt
// zwei Mails via Resend: eine an David, eine Bestätigung ans Paar.
//
// Benötigte Umgebungsvariablen (Vercel > Settings > Environment Variables):
//   RESEND_API_KEY             API-Key aus resend.com
//   SUPABASE_URL               https://vglqsuzfzsasfuavticq.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  Service-Role-Key (Supabase > Settings > API)
//   NOTIFY_EMAIL               optional, Standard d.ramchandani@bluewin.ch
//   FROM_EMAIL                 optional, Standard "David Ramchandani <pianist@privatklavierunterricht.ch>"

const MAX = 4000;

function clean(v, max = MAX) {
  return String(v == null ? '' : v).trim().slice(0, max);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function nl2br(s) {
  return esc(s).replace(/\n/g, '<br>');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Nur POST erlaubt.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Honeypot: echte Menschen füllen das versteckte Feld nicht aus.
  if (clean(body.website)) return res.status(200).json({ ok: true });

  const name = clean(body.name, 200);
  const email = clean(body.email, 200);
  const telefon = clean(body.telefon, 60);
  const datum = clean(body.datum, 20);
  const ort = clean(body.ort, 300);
  const nachricht = clean(body.nachricht);
  const konfiguration = body.konfiguration && typeof body.konfiguration === 'object' ? body.konfiguration : null;

  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Bitte Name und eine gültige E-Mail-Adresse angeben.' });
  }

  const { RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'd.ramchandani@bluewin.ch';
  const FROM_EMAIL = process.env.FROM_EMAIL || 'David Ramchandani <pianist@privatklavierunterricht.ch>';
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Der Mailversand ist noch nicht konfiguriert.' });
  }

  const richtpreis = konfiguration && konfiguration.richtpreis ? `CHF ${konfiguration.richtpreis}` : '';
  const anlass = konfiguration && konfiguration.anlass ? konfiguration.anlass : '';

  // 1) In Supabase speichern (optional: wenn Keys fehlen, wird nur gemailt)
  let gespeichert = false;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/pianist_anfragen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          name, email, telefon: telefon || null, datum: datum || null, ort: ort || null,
          anlass: anlass || null, nachricht: nachricht || null, konfiguration, richtpreis: richtpreis || null,
        }),
      });
      gespeichert = r.ok;
      if (!r.ok) console.error('Supabase insert failed', r.status, await r.text());
    } catch (e) {
      console.error('Supabase error', e);
    }
  }

  // 2) Mails via Resend
  const positionen = konfiguration && Array.isArray(konfiguration.positionen)
    ? konfiguration.positionen.map((p) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${esc(p.n)}</td><td style="padding:4px 0;text-align:right">${esc(p.v)}</td></tr>`).join('')
    : '';

  const details = `
    <table style="border-collapse:collapse;font-size:14px">
      <tr><td style="padding:4px 12px 4px 0;color:#555">Name</td><td>${esc(name)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555">E-Mail</td><td>${esc(email)}</td></tr>
      ${telefon ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Telefon</td><td>${esc(telefon)}</td></tr>` : ''}
      ${datum ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Datum</td><td>${esc(datum)}</td></tr>` : ''}
      ${ort ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Ort</td><td>${esc(ort)}</td></tr>` : ''}
      ${anlass ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Anlass</td><td>${esc(anlass)}</td></tr>` : ''}
      ${richtpreis ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Richtpreis</td><td><b>${esc(richtpreis)}</b></td></tr>` : ''}
    </table>
    ${positionen ? `<p style="margin:16px 0 4px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#888">Konfiguration</p><table style="border-collapse:collapse;font-size:14px">${positionen}</table>` : ''}
    ${nachricht ? `<p style="margin:16px 0 4px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#888">Nachricht</p><p style="font-size:14px;line-height:1.5">${nl2br(nachricht)}</p>` : ''}
  `;

  const wrap = (inner) => `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px">${inner}</div>`;

  const mailAnDavid = {
    from: FROM_EMAIL,
    to: [NOTIFY_EMAIL],
    reply_to: email,
    subject: `Neue Anfrage: ${name}${datum ? ` · ${datum}` : ''}${richtpreis ? ` · ${richtpreis}` : ''}`,
    html: wrap(`<h2 style="font-weight:500;margin:0 0 16px">Neue Anfrage über die Pianist-Seite</h2>${details}<p style="margin-top:24px;font-size:12px;color:#888">${gespeichert ? 'In Supabase gespeichert.' : 'Nicht in Supabase gespeichert (Keys fehlen oder Fehler), nur per Mail.'}</p>`),
  };

  const mailAnPaar = {
    from: FROM_EMAIL,
    to: [email],
    subject: 'Eure Anfrage ist angekommen',
    html: wrap(`
      <p>Hallo ${esc(name)}</p>
      <p>Danke für eure Anfrage. Ich melde mich innert 48 Stunden mit der Verfügbarkeit und einem Vorschlag für ein kurzes Gespräch.</p>
      <p style="margin:20px 0 4px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#888">Eure Angaben</p>
      ${details}
      <p style="margin-top:24px">Bis bald<br>David Ramchandani, Pianist</p>
    `),
  };

  async function send(payload) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  }

  try {
    await send(mailAnDavid);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Die Anfrage konnte nicht zugestellt werden.' });
  }
  try { await send(mailAnPaar); } catch (e) { console.error('Bestätigung fehlgeschlagen', e); }

  return res.status(200).json({ ok: true, gespeichert });
};

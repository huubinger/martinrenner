const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Statische Startseite (public/index.html) unter "/"
app.use(express.static(path.join(__dirname, 'public')));

// --- Dropbox-Anbindung für /choerle ---

let cachedToken = null;
let tokenExpiresAt = 0;

async function getDropboxAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
      client_id: process.env.DROPBOX_APP_KEY,
      client_secret: process.env.DROPBOX_APP_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error(`Dropbox token refresh fehlgeschlagen: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // 60 Sekunden Puffer vor Ablauf
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function listChoerleFiles() {
  const token = await getDropboxAccessToken();
  const folderPath = process.env.DROPBOX_FOLDER_PATH || '';

  const listRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: folderPath, recursive: false }),
  });

  if (!listRes.ok) {
    throw new Error(`Dropbox list_folder fehlgeschlagen: ${listRes.status} ${await listRes.text()}`);
  }

  const listData = await listRes.json();
  const files = listData.entries.filter((entry) => entry['.tag'] === 'file');

  const filesWithLinks = await Promise.all(
    files.map(async (file) => {
      try {
        const linkRes = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: file.path_lower }),
        });
        if (!linkRes.ok) return { name: file.name, link: null };
        const linkData = await linkRes.json();
        return { name: file.name, link: linkData.link };
      } catch {
        return { name: file.name, link: null };
      }
    })
  );

  filesWithLinks.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return filesWithLinks;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function renderChoerlePage(itemsHtml) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Frühstückschörle – Noten</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
    color: #f8fafc;
    min-height: 100vh;
    padding: 2.5rem 1rem;
  }
  .container { max-width: 640px; margin: 0 auto; }
  h1 { font-size: clamp(1.6rem, 5vw, 2.2rem); margin-bottom: 0.25rem; }
  p.subtitle { color: #cbd5e1; margin-bottom: 2rem; }
  ul { list-style: none; }
  li { margin-bottom: 0.75rem; }
  a.file-link {
    display: block;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 0.9rem 1.1rem;
    color: #38bdf8;
    text-decoration: none;
    font-size: 1rem;
    transition: background 0.15s ease;
  }
  a.file-link:hover { background: rgba(255,255,255,0.12); }
  .home-link { display: inline-block; margin-top: 2rem; color: #94a3b8; font-size: 0.9rem; text-decoration: none; }
  .home-link:hover { text-decoration: underline; }
  .empty { color: #94a3b8; }
  .legal-footer {
    position: fixed;
    right: 1rem;
    bottom: 0.75rem;
    display: flex;
    gap: 0.9rem;
    font-size: 0.78rem;
  }
  .legal-footer a { color: #64748b; text-decoration: none; }
  .legal-footer a:hover { color: #94a3b8; }
</style>
</head>
<body>
  <div class="container">
    <h1>🎶 Frühstückschörle</h1>
    <p class="subtitle">Noten &amp; Unterlagen</p>
    <ul>${itemsHtml}</ul>
    <a class="home-link" href="/">&larr; zurück zur Startseite</a>
  </div>
  <div class="legal-footer">
    <a href="/impressum.html">Impressum</a>
    <a href="/datenschutz.html">Datenschutz</a>
  </div>
</body>
</html>`;
}

app.get('/choerle', async (req, res) => {
  try {
    const files = await listChoerleFiles();
    if (files.length === 0) {
      res.send(renderChoerlePage('<li class="empty">Noch keine Dateien im Ordner.</li>'));
      return;
    }
    const items = files
      .map((f) => {
        if (!f.link) return `<li>${escapeHtml(f.name)} (Link nicht verfügbar)</li>`;
        return `<li><a class="file-link" href="${f.link}" target="_blank" rel="noopener">${escapeHtml(f.name)}</a></li>`;
      })
      .join('\n');
    res.send(renderChoerlePage(items));
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send(renderChoerlePage('<li class="empty">Die Noten konnten gerade nicht geladen werden. Bitte später erneut versuchen.</li>'));
  }
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});

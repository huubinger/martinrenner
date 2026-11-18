'use strict';
// Ein Login für Martin: Wer sich in der Tool-Übersicht (/tools, TOOLS_PASSWORD) anmeldet, bekommt das
// Cookie „mr_owner“ für die ganze Domain. Die Proxys schicken den Tools dann den Header x-owner-sso mit –
// je Tool ein eigener Wert HMAC-SHA256(OWNER_SSO_SECRET, toolname); das Tool vergleicht ihn mit seiner
// Variable OWNER_SSO und behandelt die Anfrage als Admin. Ohne OWNER_SSO_SECRET bleibt alles wie bisher.
// Abmelden auf allen Geräten: Railway-Variable OWNER_VERSION hochzählen.
// Werte für die Tools erzeugt `node owner-sso.js <toolname>` (liest OWNER_SSO_SECRET aus der Umgebung).
const crypto = require('crypto');

const COOKIE = 'mr_owner';
const TOOLS = ['kameras', 'lokal', 'heizung', 'skript', 'buehne', 'licht', 'programmheft', 'bewertung', 'tagebuch', 'kalender', 'chorx', 'buero'];

const MAX_AGE = 365 * 864e5;

function password() {
  return String(process.env.TOOLS_PASSWORD || '').trim();
}

function secret() {
  const v = String(process.env.OWNER_SSO_SECRET || '');
  return v.length >= 32 ? v : null;
}

// Cookie-Wert „<ausgestellt ms>.<hmac>“. Ungültig wird er nach einem Jahr, wenn sich TOOLS_PASSWORD oder
// OWNER_SSO_SECRET ändert oder wenn OWNER_VERSION hochgezählt wird (= alle Geräte abmelden).
function sign(ts) {
  return crypto.createHmac('sha256', secret())
    .update(`owner-v1:${process.env.OWNER_VERSION || '1'}:${password()}:${ts}`).digest('hex');
}

function ownerToken() {
  const ts = String(Date.now());
  return `${ts}.${sign(ts)}`;
}

function readCookie(req, name) {
  const header = (req.headers && req.headers.cookie) || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx !== -1 && part.slice(0, idx).trim() === name) {
      try { return decodeURIComponent(part.slice(idx + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

// Ohne TOOLS_PASSWORD oder OWNER_SSO_SECRET ist das gemeinsame Login ganz aus.
function isOwner(req) {
  if (!password() || !secret()) return false;
  const m = /^(\d{13})\.([0-9a-f]{64})$/.exec(readCookie(req, COOKIE) || '');
  if (!m) return false;
  const age = Date.now() - Number(m[1]);
  if (age < -5 * 60e3 || age > MAX_AGE) return false;
  return crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(sign(m[1])));
}

function setOwnerCookie(req, res) {
  if (!password() || !secret()) return;
  res.cookie(COOKIE, ownerToken(), {
    maxAge: MAX_AGE, httpOnly: true, sameSite: 'lax', path: '/',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  });
}

function clearOwnerCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function toolKey(tool) {
  const key = secret();
  return key ? crypto.createHmac('sha256', key).update(tool).digest('hex') : null;
}

// Login-Cookies der Homepage nie an die Tools weitergeben – ein Tool soll den Generalschlüssel nicht sehen.
function stripHomepageCookies(cookie) {
  return String(cookie || '').split(';')
    .filter((part) => !/^\s*(mr_owner|tools_auth)=/.test(part))
    .join(';').trim();
}

// Aufruf NACH dem Kopieren der Header. Setzt x-owner-sso nur für Martin; ein vom Besucher mitgeschickter
// x-owner-sso wird von den Proxys nie durchgereicht – hier zur Sicherheit trotzdem immer entfernt.
// Ändernde Anfragen (POST …) nur von der eigenen Seite (Sec-Fetch-Site), damit fremde Seiten nichts auslösen.
function ownerSso(req, headers, tool) {
  delete headers['x-owner-sso'];
  if (headers.cookie !== undefined) {
    const rest = stripHomepageCookies(headers.cookie);
    if (rest) headers.cookie = rest; else delete headers.cookie;
  }
  if (!isOwner(req)) return;
  const site = req.headers['sec-fetch-site'];
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || 'GET').toUpperCase());
  if (write && site && site !== 'same-origin') return;
  const key = toolKey(tool);
  if (key) headers['x-owner-sso'] = key;
}

module.exports = { isOwner, setOwnerCookie, clearOwnerCookie, ownerSso, toolKey, stripHomepageCookies, TOOLS, COOKIE };

if (require.main === module) {
  const tool = process.argv[2];
  if (!TOOLS.includes(tool)) {
    console.error('Aufruf: node owner-sso.js <' + TOOLS.join('|') + '>');
    process.exit(1);
  }
  const key = toolKey(tool);
  if (!key) {
    console.error('OWNER_SSO_SECRET fehlt oder ist kürzer als 32 Zeichen.');
    process.exit(1);
  }
  process.stdout.write(key);
}

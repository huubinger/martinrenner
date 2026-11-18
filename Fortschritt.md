# Ein Login für alle Tools (SSO) – Fortschritt

## Ziel
Martin meldet sich einmal auf www.martinrenner.de an (Login der Tool-Übersicht /tools, 1 Jahr gültig) und alle eigenen Tools hinter dem Proxy sind ohne weitere Anmeldung offen – als Admin. Zugänge für andere (Chor-X-Chöre, Voctails intern, Programmheft-Akteurs-Links, Bühnen-Share-Links) bleiben unverändert.

## Aufbau
- martinrenner.de: Cookie der Tool-Übersicht gilt für Path=/ → `isOwner(req)`.
- Proxy schickt bei `isOwner` den Header `x-owner-sso: <Schlüssel des Tools>` mit. Proxys reichen nur ausgewählte Header durch – Besucher können ihn nicht selbst setzen.
- Schlüssel je Tool = HMAC-SHA256(OWNER_SSO_SECRET, "<toolname>") (hex). OWNER_SSO_SECRET nur auf martinrenner.de, im Tool steht `OWNER_SSO` = abgeleiteter Wert.
- Tool prüft: `OWNER_SSO` gesetzt (≥ 32 Zeichen) + Header gleich (timingSafeEqual) ⇒ Admin. Ohne Variable: alles wie bisher.
- Toolnamen: kameras, lokal, heizung, skript, buehne, licht, programmheft, bewertung, tagebuch, kalender, chorx, buero.

## Erledigt
- [x] Tools lernen den Header (12 Repos, Tests grün, Sicherheitsprüfer, gepusht 18.11.2026)
- [x] martinrenner.de: owner-sso.js (signiertes Cookie mit Ablauf, OWNER_VERSION zum Abmelden aller Geräte, Homepage-Cookies werden nicht an Tools gereicht, POST nur same-origin), Header in allen Proxys + Licht-WebSocket, /admin + /musicals, /login?next= – Test werkzeuge/owner-sso-test.js (18 OK)
- [x] Skript für Martin: werkzeuge/sso-einrichten.sh
- [ ] Martin setzt Variablen, Test auf iPhone + Mac

## Nächster Schritt
Martin führt `! ~/Projects/martinrenner/werkzeuge/sso-einrichten.sh` aus, danach Test auf Mac + iPhone.

## Offene Fragen
- keine

#!/bin/zsh
# Ein Login für alle Tools (owner-sso.js): erzeugt den Hauptschlüssel OWNER_SSO_SECRET (einmalig, liegt danach in
# ~/Dropbox/Claude/secrets/martinrenner/.env), leitet daraus je Tool den Wert OWNER_SSO ab und setzt alles in Railway.
# Werte gehen nur per stdin an die Railway-CLI – nichts wird angezeigt oder geloggt.
# Aufruf: werkzeuge/sso-einrichten.sh            (alle Tools, danach martinrenner.de)
#         werkzeuge/sso-einrichten.sh licht      (nur ein Tool nachziehen)
set -euo pipefail
cd "${0:A:h}/.."

ENV_DATEI=~/Dropbox/Claude/secrets/martinrenner/.env
ENV_MR="67b919ad-e7ff-40c6-aade-2140f19745da"   # martinrenner.de production
PROJ_MR="419c29c6-3739-454d-8a1b-80f773594b6a"

# toolname  projekt-id  environment-id  service-name
DIENSTE=(
  "kameras      90b04251-eb83-4395-ac61-aa7d9d1b2517 8499d166-ea72-436e-895e-f87b4ac4a2b9 kamera-tool"
  "lokal        b865ea82-ad94-44e9-9017-8a632c02bb5a 0a7a7747-4bd3-42d8-a9f5-de85b443f21e lokal-tool"
  "heizung      8b616f36-5246-4062-afd5-15d963bf66bc 30684b8d-7444-482c-a32b-6a141655c8b5 heizkurve"
  "skript       e02af450-9adc-4365-924c-1738709a0870 7a9973a6-e819-4de6-b275-67e78fc9f119 skript-tool"
  "buehne       5b095bc4-7612-4013-89ec-779c889c8ac8 fe3e069a-7de9-4508-8bb2-fa32487083b7 buehnen-tool"
  "licht        46216f5a-baa2-47f1-ad96-bfcd9e8d1563 b4f49297-0340-4e4d-958c-73396bae636c licht-tool"
  "programmheft 8bfda6da-8e05-473a-9f47-5f451b69f699 7b8fb799-a283-4e4d-a109-10285d7c439e programmheft-tool"
  "bewertung    ac02924e-9806-48cb-b202-6b7e9af73fb5 baea50ea-7ec3-4bbd-8daa-313a7042707a bewertungstool"
  "tagebuch     b8347345-7392-4e48-b560-16d5b07fece9 fe30061e-32d7-410b-befb-d4bcc4e0b5b2 tagebuch"
  "kalender     41bef2ef-3d66-45e7-beb3-92fab4073726 766bbb7a-51b3-4657-94f8-106fccf55b3d kalender-tool"
  "chorx        7e19e223-238b-4b27-9706-2d771c7321fb 62248ca6-ed2c-4803-b242-5dd302ed45e8 chorx-tool"
  "buero        de93f2bb-bc37-48ce-9b4b-a427b38389fb d2cd15c4-4a25-42b5-ad00-2038393fafb8 lucy"
)

# Hauptschlüssel holen oder einmalig erzeugen
mkdir -p "${ENV_DATEI:h}"; touch "$ENV_DATEI"; chmod 600 "$ENV_DATEI"
OWNER_SSO_SECRET=$(grep -E '^OWNER_SSO_SECRET=' "$ENV_DATEI" | tail -1 | cut -d= -f2- || true)
if [[ -z "$OWNER_SSO_SECRET" ]]; then
  OWNER_SSO_SECRET=$(openssl rand -hex 32)
  print "OWNER_SSO_SECRET=$OWNER_SSO_SECRET" >> "$ENV_DATEI"
  print "✓ Neuer Hauptschlüssel erzeugt und in secrets/martinrenner/.env abgelegt"
fi
export OWNER_SSO_SECRET

NUR="${1:-}"
for zeile in "${DIENSTE[@]}"; do
  read -r tool projekt umgebung dienst <<< "$zeile"
  [[ -n "$NUR" && "$NUR" != "$tool" ]] && continue
  node owner-sso.js "$tool" | railway variables --project "$projekt" --environment "$umgebung" --service "$dienst" \
    --set-from-stdin OWNER_SSO > /dev/null
  print "✓ $tool ($dienst): OWNER_SSO gesetzt"
done

if [[ -z "$NUR" ]]; then
  print -rn -- "$OWNER_SSO_SECRET" | railway variables --project "$PROJ_MR" --environment "$ENV_MR" --service web \
    --set-from-stdin OWNER_SSO_SECRET > /dev/null
  print "✓ martinrenner.de: OWNER_SSO_SECRET gesetzt"
fi
print "Fertig. Railway startet die Dienste jetzt neu (1–3 Minuten). Danach einmal auf www.martinrenner.de/tools anmelden."

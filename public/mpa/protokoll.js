// Übersetzung zwischen der Oberfläche und den Bluetooth-Befehlen der Behringer MPA200BT.
// Das Protokoll ist noch nicht entschlüsselt – Stand und Mitschnitte im Repo huubinger/mpa-control
// (PROTOKOLL.md). Solange "bekannt" false ist, läuft die Seite im Demo-Modus; die Verbindung
// unter "Verbindung → Diagnose" dient zum Mitlesen und Testen einzelner Befehle.
window.MPA_PROTOKOLL = {
  bekannt: false,

  // Gerätename beim Suchen (Bluetooth-Name der Box beginnt vermutlich mit "MPA")
  namePrefix: 'MPA',

  // Service-UUIDs der Box (aus entdecken.py). Web Bluetooth darf nur auf hier eingetragene Services zugreifen.
  services: [],

  // Characteristic für Befehle an die Box und für Meldungen der Box
  befehlsKanal: null,
  meldeKanal: null,

  // art: 'lautstaerke' | 'gain' | 'mute' | 'eq' | 'fx' | 'fxTyp' | 'master' | 'masterMute'
  // Rückgabe: Uint8Array mit dem Befehl, oder null, wenn (noch) nicht bekannt
  befehl(art, kanal, wert, extra) {
    return null;
  },

  // Meldung der Box -> Liste von Änderungen [{ art, kanal, wert }] (z. B. nach Drehen am Regler)
  auswerten(daten) {
    return [];
  },

  // Befehl zum Abfragen des kompletten aktuellen Zustands (nach dem Verbinden), oder null
  zustandAbfragen() {
    return null;
  }
};

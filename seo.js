// SEO-Landingpages (serverseitig gerendert, damit Suchmaschinen den Text ohne
// JavaScript lesen): Veranstaltungstechnik-Verleih, Chorleitung/Chor X, Chöre,
// Musical & Regie. Dazu robots.txt und sitemap.xml.
// Bilder kommen aus den Projekten der Startseite (data/projects.json, Admin).

const SITE = 'https://www.martinrenner.de';
const REGION = 'Neckarsulm, Heilbronn und ganz Baden-Württemberg';

const PERSON = {
  '@type': 'Person',
  '@id': SITE + '/#martin-renner',
  name: 'Martin Renner',
  url: SITE + '/',
  jobTitle: ['Chorleiter', 'Regisseur', 'Künstler', 'Veranstaltungstechniker'],
  address: { '@type': 'PostalAddress', addressLocality: 'Neckarsulm', postalCode: '74172', addressRegion: 'Baden-Württemberg', addressCountry: 'DE' },
  sameAs: ['https://instagram.com/singt.martin'],
};

const AREA = [
  { '@type': 'City', name: 'Neckarsulm' },
  { '@type': 'City', name: 'Heilbronn' },
  { '@type': 'AdministrativeArea', name: 'Landkreis Heilbronn' },
  { '@type': 'State', name: 'Baden-Württemberg' },
];

// Seiten: Pfad, Titel (≤ 60 Zeichen), Beschreibung (≤ 160 Zeichen), Bild-Projekt, Inhalt.
const PAGES = [
  {
    path: '/veranstaltungstechnik',
    alt: 'Bühne mit Ton- und Lichttechnik bei einer Veranstaltung',
    nav: 'Veranstaltungstechnik',
    project: 'veranstaltungstechnik',
    title: 'Veranstaltungstechnik mieten in Neckarsulm & Heilbronn',
    description: 'Ton, Licht und Bühne mieten in Neckarsulm, Heilbronn und Umgebung: PA, Mikrofone, Mischpulte, Lichttechnik und Podeste – mit oder ohne Techniker.',
    h1: 'Veranstaltungstechnik mieten – Ton, Licht und Bühne',
    lead: 'Verleih und Service für Konzerte, Vereinsfeste, Firmenfeiern, Theater und Open-Airs in Neckarsulm, Heilbronn und Umgebung. Alles aus einer Hand – von der Planung bis zum Abbau.',
    cta: { href: '/?p=veranstaltungstechnik&form=anfrage', label: 'Unverbindlich anfragen' },
    sections: [
      { h2: 'Technik-Verleih: was du mieten kannst', html: `
        <div class="cards">
          <div class="card"><h3>Tontechnik</h3><p>PA-Anlagen für kleine und große Räume, Monitorboxen, Digitalmischpulte, digitale Funk- und Headset-Mikrofone, In-Ear-Monitoring, Kabel, Stative und Stageboxen.</p></div>
          <div class="card"><h3>Lichttechnik</h3><p>Moving Heads, LED-Washlights, klassische Theaterscheinwerfer, Hazer und DMX-/Art-Net-Steuerung – für stimmungsvolle Bühnen und gut ausgeleuchtete Gesichter.</p></div>
          <div class="card"><h3>Bühne &amp; Rigging</h3><p>Bühnenpodeste, Kettenzüge, Wind-Up-Stative, Bannerrahmen und Pavillons – drinnen wie Open Air.</p></div>
          <div class="card"><h3>Strom, Video &amp; Transport</h3><p>Stromverteiler und CEE-Kabel bis 63 A, Netzwerk und Glasfaser, Ultrakurzdistanz-Beamer – und auf Wunsch Transport per Sprinter oder 7,5-t-LKW.</p></div>
        </div>
        <p>Welche Geräte im Einzelnen verfügbar sind, hängt vom Termin ab – schick mir einfach die Eckdaten, dann stelle ich ein passendes Paket zusammen.</p>` },
      { h2: 'Auszug aus dem Bestand', html: `
        <p>Eine Auswahl aus dem Lager – vor allem Profi-Technik namhafter Hersteller, wie sie auch auf großen Bühnen und bei Tourneen im Einsatz ist (ohne Preise – die gibt es mit dem Angebot):</p>
        <div class="cards">
          <div class="card"><h3>Beschallung</h3><ul class="ticks">
            <li>Coda Audio CoRAY4 Line-Array mit Low-Extension</li>
            <li>Coda Audio Subwoofer SCV-F</li>
            <li>Coda Audio Monitore und Fullrange-Boxen (G712, G715, Rx40, HOPS5)</li>
            <li>Coda Audio Linus Systemendstufen</li>
          </ul></div>
          <div class="card"><h3>Mischpulte &amp; Stageboxen</h3><ul class="ticks">
            <li>Allen &amp; Heath dLive C2500 mit CDM48 Mixrack</li>
            <li>Stageboxen DX168 und GX4816</li>
            <li>Netzwerk und Glasfaser für digitale Signalwege</li>
          </ul></div>
          <div class="card"><h3>Funk &amp; Mikrofone</h3><ul class="ticks">
            <li>beyerdynamic TG 1000 Digital-Funksystem mit Headsets</li>
            <li>Shure QLXD mit KSM9-Kapsel</li>
            <li>Funkrack mit 40 Kanälen</li>
            <li>Kondensatormikrofone beyerdynamic MC930, Lewitt LCT 440</li>
            <li>Messmikrofone iSEMcon EMX 7150</li>
          </ul></div>
          <div class="card"><h3>Licht &amp; Effekte</h3><ul class="ticks">
            <li>Lichtsteuerung grandMA onPC Wing</li>
            <li>Theaterscheinwerfer DeSisti Leonardo Fresnel (1 und 2 kW), ARRI Junior 650 Plus</li>
            <li>GLP Scan Operator FX II</li>
            <li>MediaLED Washlights und Moving Heads</li>
            <li>Hazer SmokeFactory TourHazer II</li>
            <li>Dimmer-Rack 63 A, Art-Net-Rack mit DMX-Splittern</li>
          </ul></div>
          <div class="card"><h3>Bühne, Rigging &amp; Strom</h3><ul class="ticks">
            <li>Bühnenpodeste</li>
            <li>Handkettenzüge 0,5 t</li>
            <li>Wind-Up-Stative bis 85 kg</li>
            <li>Raku-Pavillons 3 × 3 m und 6 × 3 m</li>
            <li>Event-Stromverteiler 63 A und 32 A mit CEE-Kabeln und Kabelbrücken</li>
          </ul></div>
        </div>` },
      { h2: 'Mit oder ohne Techniker', html: `
        <p>Du kannst die Technik <strong>nur mieten</strong> oder <strong>mit Betreuung</strong> buchen: Aufbau, Soundcheck, Mischen während der Veranstaltung und Abbau. Gerade bei Chorkonzerten, Musicals und Veranstaltungen mit vielen Mikrofonen lohnt sich jemand, der den Ablauf von der Bühne aus kennt.</p>` },
      { h2: 'Für welche Veranstaltungen?', html: `
        <ul class="ticks">
          <li>Chorkonzerte, A-cappella- und Bandauftritte</li>
          <li>Vereinsfeste, Jubiläen und Gemeindefeste</li>
          <li>Firmenveranstaltungen, Ehrungen und Feiern</li>
          <li>Theater, Musical und Galas</li>
          <li>Open-Air-Veranstaltungen und Kultursommer</li>
          <li>Reden, Podien und Präsentationen</li>
        </ul>` },
      { h2: 'Warum bei mir?', html: `
        <p>Ich stehe selbst als Künstler, Chorleiter und Regisseur auf und hinter der Bühne und organisiere eigene Veranstaltungen – vom Open-Air-Musical am Schützenhaus Neckarsulm bis zu Chorkonzerten mit Einzelmikrofonierung. Deshalb geht es mir nicht um möglichst viel Technik, sondern um die richtige Lösung für Veranstaltung, Location und Budget.</p>` },
      { h2: 'So läuft eine Anfrage', html: `
        <ol class="steps">
          <li><strong>Eckdaten schicken:</strong> Datum, Ort, Art der Veranstaltung, Zahl der Gäste und was auf der Bühne passiert.</li>
          <li><strong>Angebot bekommen:</strong> Ich stelle das passende Paket zusammen – zum Abholen oder mit Lieferung und Aufbau.</li>
          <li><strong>Veranstaltung genießen:</strong> Die Technik läuft, du kümmerst dich um deine Gäste.</li>
        </ol>` },
    ],
    faq: [
      ['Kann ich Veranstaltungstechnik auch nur mieten, ohne Techniker?', 'Ja. Du kannst die Technik nur mieten und selbst abholen oder Aufbau, Betreuung und Abbau dazubuchen.'],
      ['In welcher Region verleihst du Veranstaltungstechnik?', 'Vor allem in Neckarsulm, Heilbronn und im Landkreis Heilbronn, auf Anfrage auch darüber hinaus in Baden-Württemberg.'],
      ['Was kostet es, eine Musikanlage zu mieten?', 'Das hängt von Raumgröße, Zahl der Mikrofone, Licht und Betreuung ab. Nach einer kurzen Anfrage mit den Eckdaten bekommst du ein unverbindliches Angebot.'],
    ],
    schema: (p) => ({
      '@type': 'Service',
      '@id': SITE + '/veranstaltungstechnik#service',
      name: 'Veranstaltungstechnik mieten – Ton, Licht und Bühne',
      serviceType: 'Verleih von Veranstaltungstechnik',
      description: p.description,
      url: SITE + p.path,
      image: p.imageAbs || undefined,
      areaServed: AREA,
      provider: { '@id': PERSON['@id'] },
      offers: ['Tontechnik mieten', 'Lichttechnik mieten', 'Bühne und Podeste mieten', 'Beamer und Leinwand mieten', 'Veranstaltungstechniker mit Betreuung']
        .map((n) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: n } })),
    }),
  },
  {
    path: '/chorleiter',
    alt: 'Chor bei einem Auftritt, dirigiert von Martin Renner',
    nav: 'Chorleitung & Chor X',
    project: 'fruehstuecks-choerle',
    title: 'Chorleiter gesucht? Chor X hilft Chören – Heilbronn & BW',
    description: 'Euer Chor sucht eine Chorleitung? Chor X hilft: Martin Renner und Patrick Bach leiten eure Proben, mit Übe-Tracks und Probentool. Raum Heilbronn und BW.',
    h1: 'Chorleiter gesucht? Chor X hilft eurem Chor weiter',
    lead: 'Wir helfen Chören, die ihre Chorleitung verloren haben oder keine finden – in Heilbronn und ganz Baden-Württemberg. Damit euer Chor weitersingt, kommen 12-mal im Jahr kommen Martin Renner oder Patrick Bach zu euch und leiten eure Probe. Dazwischen übt ihr mit Übe-Tracks und eurem eigenen Probentool.',
    cta: { href: '/?p=martin-renner&form=kontakt', label: 'Chor X anfragen' },
    sections: [
      { h2: 'Wir helfen Chören, weiterzusingen', html: `
        <p>Ohne Chorleitung fallen Proben aus, Sängerinnen und Sänger springen ab, und irgendwann steht die Frage im Raum, ob es den Chor noch braucht. Chor X sorgt dafür, dass es gar nicht so weit kommt: Ihr probt weiter, lernt neue Songs, habt wieder Ziele und Auftritte – und gewinnt Zeit, um in Ruhe eine dauerhafte Lösung zu finden.</p>
        <p>Wir hören uns an, wo euer Chor steht, was euch fehlt und was ihr euch wünscht – und schneiden die Hilfe darauf zu: vom Neustart nach dem Abschied der Chorleitung bis zum frischen Repertoire für einen Chor, der wieder Lust aufs Singen machen soll.</p>` },
      { h2: 'So funktioniert Chor X', html: `
        <ol class="steps">
          <li><strong>Wir leiten eure Probe:</strong> 12-mal im Jahr je drei Stunden – neue Songs, Stimmbildung, Klang, Ausdruck und Bühnenpräsenz. Die Termine liegen außerhalb der Schulferien in Baden-Württemberg.</li>
          <li><strong>Ihr übt dazwischen:</strong> Übe-Tracks für jede Stimme im eigenen Online-Probentool am Handy – mit Noten, Tempo-Regler und mitlaufendem Text. So sitzen die Töne bis zum nächsten Termin.</li>
          <li><strong>Langfristig gut aufgestellt:</strong> Mit <em>Chor X Plus</em> probt zusätzlich ein Nachwuchs-Coach zwischen unseren Terminen mit euch – und kann später eure feste Chorleitung werden.</li>
        </ol>` },
      { h2: 'Für wen ist Chor X?', html: `
        <ul class="ticks">
          <li>Gesangvereine und Liederkränze, deren Chorleiterin oder Chorleiter aufhört</li>
          <li>Chöre, die schon länger erfolglos eine Chorleitung suchen</li>
          <li>Männerchöre, Frauenchöre, gemischte Chöre, Pop- und Gospelchöre</li>
          <li>Chöre, die moderner klingen und neue Sängerinnen und Sänger gewinnen möchten</li>
        </ul>` },
      { h2: 'Eure Coaches', html: `
        <div class="cards">
          <div class="card"><h3>Martin Renner</h3><p>Chorleiter, Regisseur und kultureller Allrounder aus Neckarsulm. Leitet die A-cappella-Gruppe <a href="/voctails">Voctails</a> (Sieger beim Grand Prix der Popchöre 2018 und 2025), den Männerchor <a href="/choere#lauter-maenner">Lauter Männer</a> und das <a href="/choere#fruehstuecks-choerle">Frühstücks-Chörle</a>.</p></div>
          <div class="card"><h3>Patrick Bach</h3><p>Chordirektor (FDC) und CVT-Vocalcoach. Spezialist für Stimmbildung und Chorklang – gemeinsam mit Martin Renner leitet er das Frühstücks-Chörle in Neckarsulm.</p></div>
        </div>` },
      { h2: 'Chorleitung in Heilbronn und Baden-Württemberg', html: `
        <p>Chor X hilft Chören im Raum Heilbronn – Neckarsulm, Landkreis Heilbronn, Hohenlohe und Kraichgau – und kommt auf Anfrage auch zu Chören in ganz Baden-Württemberg. Ihr sucht eine feste Chorleitung? Sprecht uns an: Wir überbrücken die Zeit ohne Chorleiter und bauen auf Wunsch eure künftige Chorleitung mit auf.</p>` },
    ],
    faq: [
      ['Unser Chor hat keinen Chorleiter mehr – was tun?', 'Meldet euch bei uns – genau dafür gibt es Chor X. Mit Chor X leiten Martin Renner oder Patrick Bach 12-mal im Jahr eure Probe, dazwischen übt ihr mit Übe-Tracks im eigenen Probentool. So bleibt der Chor aktiv, während ihr eine feste Lösung findet.'],
      ['In welcher Region bietet ihr Chorleitung an?', 'Vor allem im Raum Heilbronn (Neckarsulm, Landkreis Heilbronn, Hohenlohe, Kraichgau), auf Anfrage in ganz Baden-Württemberg.'],
      ['Was sind Übe-Tracks?', 'Aufnahmen jeder einzelnen Chorstimme (z. B. Sopran, Alt, Tenor, Bass) mit und ohne Klick. Im Probentool laufen Noten und Text mit, das Tempo lässt sich verlangsamen.'],
      ['Kann aus Chor X eine feste Chorleitung werden?', 'Ja. Mit Chor X Plus probt ein Nachwuchs-Coach zwischen den Terminen mit euch und kann später eure feste Chorleitung übernehmen.'],
    ],
    schema: (p) => ({
      '@type': 'Service',
      '@id': SITE + '/chorleiter#chor-x',
      name: 'Chor X – Chorleitung und Chor-Coaching',
      serviceType: 'Chorleitung',
      description: p.description,
      url: SITE + p.path,
      image: p.imageAbs || undefined,
      areaServed: AREA,
      provider: [{ '@id': PERSON['@id'] }, { '@type': 'Person', name: 'Patrick Bach', jobTitle: 'Chordirektor (FDC), CVT-Coach' }],
    }),
  },
  {
    path: '/choere',
    alt: 'Die Voctails auf der Bühne',
    nav: 'Chöre',
    project: 'voctails',
    title: 'Chöre in Neckarsulm & Heilbronn – Martin Renner',
    description: 'A-cappella-Pop mit den Voctails, Männerchor Lauter Männer und das Frühstücks-Chörle in Neckarsulm: die Chöre von Chorleiter Martin Renner. Mitsingen erwünscht!',
    h1: 'Meine Chöre in Neckarsulm und im Raum Heilbronn',
    lead: 'Vom preisgekrönten A-cappella-Pop bis zum Mitsing-Chor ohne Vorkenntnisse: Als Chorleiter leite ich drei ganz unterschiedliche Chöre – und freue mich immer über neue Stimmen.',
    cta: { href: '/?p=martin-renner&form=kontakt', label: 'Mitsingen? Schreib mir' },
    sections: [
      { id: 'voctails', h2: 'Voctails – A-cappella-Pop', project: 'voctails', html: `
        <p>Die Voctails stehen für modernen A-cappella-Pop mit starken Stimmen, Beatbox und Choreografien. Seit 2016 bringt das Ensemble deutsche und internationale Pop- und Rocksongs ganz ohne Instrumente auf die Bühne – mit rund 20 Auftritten im Jahr in der Region Heilbronn. Die Voctails haben den <strong>Grand Prix der Popchöre 2018 und 2025</strong> gewonnen.</p>
        <p><a class="more" href="/voctails">Zur Voctails-Seite: Konzerte, Videos, Mitsingen →</a></p>` },
      { id: 'lauter-maenner', h2: 'Lauter Männer – Männerchor mal anders', project: 'lauter-maenner', html: `
        <p>Statt klassischer Männerchorliteratur: deutsche Pop- und Rocksongs, moderne Arrangements und jede Menge Spaß. Lauter Männer gehört zum Liederkranz Kochersteinsfeld, singt auswendig, mit Druck, Humor und einem ganz eigenen Sound – und zeigt, dass Männerchor alles andere als angestaubt ist.</p>
        <p><a class="more" href="https://www.liederkranz-kochersteinsfeld.de" rel="noopener">Liederkranz Kochersteinsfeld →</a></p>` },
      { id: 'fruehstuecks-choerle', h2: 'Frühstücks-Chörle – singen und frühstücken', project: 'fruehstuecks-choerle', html: `
        <p>Jeden Donnerstag von 9 bis 10 Uhr im HerzMahl in Neckarsulm: gemeinsam singen, lachen und danach zusammen frühstücken. Der Chor richtet sich vor allem an ältere Menschen; ich leite ihn gemeinsam mit Vocalcoach Patrick Bach – ohne Leistungsdruck, ohne Vorsingen und ohne Vorkenntnisse.</p>
        <p><a class="more" href="/choerle">Übe-Tracks &amp; Noten für alle, die mitsingen →</a></p>` },
      { h2: 'Euer Chor sucht eine Chorleitung?', html: `
        <p>Mit <a href="/chorleiter">Chor X</a> coachen Patrick Bach und ich Chöre ohne Chorleitung im Raum Heilbronn und in Baden-Württemberg – mit Proben vor Ort, Übe-Tracks und eigenem Probentool.</p>` },
    ],
    faq: [
      ['Kann ich ohne Vorkenntnisse in einem Chor mitsingen?', 'Ja – beim Frühstücks-Chörle in Neckarsulm braucht es weder Vorkenntnisse noch Vorsingen. Für die Voctails und Lauter Männer einfach melden und eine Probe besuchen.'],
      ['Wann probt das Frühstücks-Chörle?', 'Jeden Donnerstag von 9 bis 10 Uhr im HerzMahl in Neckarsulm, danach wird gemeinsam gefrühstückt.'],
    ],
    schema: (p) => ({
      '@type': 'ItemList',
      name: 'Chöre von Martin Renner',
      itemListElement: [
        { '@type': 'MusicGroup', name: 'Voctails', genre: 'A cappella Pop', url: SITE + '/voctails', foundingDate: '2016' },
        { '@type': 'MusicGroup', name: 'Lauter Männer', genre: 'Männerchor Pop/Rock', url: SITE + '/choere#lauter-maenner' },
        { '@type': 'MusicGroup', name: 'Frühstücks-Chörle', genre: 'Chor', url: SITE + '/choere#fruehstuecks-choerle', location: { '@type': 'Place', name: 'HerzMahl', address: { '@type': 'PostalAddress', addressLocality: 'Neckarsulm', addressCountry: 'DE' } } },
      ].map((g, i) => ({ '@type': 'ListItem', position: i + 1, item: g })),
    }),
  },
  {
    path: '/musical',
    alt: 'Szene aus einem Kreatief-Musical auf der Open-Air-Bühne in Neckarsulm',
    nav: 'Musical & Regie',
    project: 'kreatief-musical',
    title: 'Musical & Regie – Kreatief-Musical Neckarsulm',
    description: 'Eigene Musicals mit bekannten deutschen Songs: Jeden Sommer auf der Open-Air-Bühne am Schützenhaus Neckarsulm – inszeniert von Martin Renner beim Kreatief.',
    h1: 'Musical made in Neckarsulm',
    lead: 'Jeden Sommer bringt das Kreatief – Kultur im Unterland e.V. ein neues, selbst entwickeltes Musical auf die Open-Air-Bühne am Schützenhaus Neckarsulm. Als Regisseur entwickle und inszeniere ich diese Produktionen gemeinsam mit vielen kreativen Menschen.',
    cta: { href: 'https://www.kreatief-neckarsulm.de', label: 'Zum Kreatief' },
    sections: [
      { h2: 'Eigene Geschichten, bekannte Songs', html: `
        <p>Beim Kreatief entstehen keine Musicals nach bestehender Vorlage: Wir erfinden eigene Geschichten und verbinden sie mit bekannten deutschen Songs, die in der Handlung plötzlich eine ganz neue Bedeutung bekommen. Vom ersten Entwurf über Musik, Proben und Inszenierung bis zu Bühnenbild, Kostümen und Technik wird jedes Musical für unser Ensemble und unsere Open-Air-Bühne entwickelt.</p>` },
      { h2: 'Ein fester Teil des Neckarsulmer Kultursommers', html: `
        <p>Tausende Besucherinnen und Besucher erleben jedes Jahr, wie sich das Gelände am Schützenhaus für einige Wochen in eine eigene Musicalwelt verwandelt. Dazu kommen die Musicalgala und der Grand Prix der Popchöre.</p>` },
      { h2: 'Regie, Konzept und Bühne', html: `
        <p>Neben der Regie kümmere ich mich um Konzept, Arrangements, Playbacks, Showvideos und die <a href="/veranstaltungstechnik">Veranstaltungstechnik</a>. Diese Erfahrung bringe ich auch in andere Produktionen, Galas und Chorprojekte ein.</p>` },
    ],
    faq: [],
    schema: (p) => ({
      '@type': 'TheaterGroup',
      name: 'Kreatief – Kultur im Unterland e.V.',
      url: 'https://www.kreatief-neckarsulm.de',
      description: p.description,
      image: p.imageAbs || undefined,
      location: { '@type': 'Place', name: 'Schützenhaus Neckarsulm', address: { '@type': 'PostalAddress', addressLocality: 'Neckarsulm', addressCountry: 'DE' } },
      member: { '@type': 'OrganizationRole', roleName: 'Regie', member: { '@id': PERSON['@id'] } },
    }),
  },
];

const PUBLIC_EXTRA = ['/', '/voctails', '/impressum.html', '/datenschutz.html'];

function projectImage(loadProjects, imageVariants, id) {
  try {
    const p = (loadProjects() || []).find((x) => x.id === id);
    if (!p || !p.image) return null;
    const vars = imageVariants(p.image) || [];
    const best = vars.find((v) => v.width === 1600) || vars[vars.length - 1];
    return {
      src: best ? best.url : p.image,
      srcset: vars.map((v) => `${v.url} ${v.width}w`).join(', '),
      focus: p.focus || p.autoFocus || '50% 50%',
    };
  } catch {
    return null;
  }
}

const CSS = `
:root{--bg:#0f172a;--panel:#1e293b;--line:rgba(255,255,255,.1);--text:#f8fafc;--muted:#cbd5e1;--soft:#94a3b8;--accent:#38bdf8}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.6;font-size:17px}
a{color:var(--accent)}
.top{display:flex;gap:1.2rem;align-items:center;padding:1rem clamp(16px,4vw,2rem);overflow-x:auto;white-space:nowrap;border-bottom:1px solid var(--line)}
.top a{color:var(--soft);text-decoration:none;font-weight:600;font-size:.88rem}
.top a:hover,.top a[aria-current]{color:var(--text)}
.top .brand{color:var(--text);font-size:1rem;margin-right:.4rem}
.hero{position:relative}
.hero img{display:block;width:100%;height:clamp(220px,46vh,520px);object-fit:cover}
.hero .in{max-width:860px;margin:0 auto;width:100%;padding:1.8rem clamp(16px,4vw,2rem) .5rem}
h1,h2,h3{overflow-wrap:break-word;hyphens:auto}
h1{font-size:clamp(1.7rem,4.5vw,2.8rem);line-height:1.15;margin-bottom:.8rem}
.lead{font-size:1.12rem;color:var(--muted);max-width:44em}
.btn{display:inline-block;margin-top:1.3rem;background:var(--accent);color:#0f172a;font-weight:700;text-decoration:none;padding:.8rem 1.4rem;border-radius:999px}
main{max-width:860px;margin:0 auto;padding:1rem clamp(16px,4vw,2rem) 3rem}
section{padding:1.6rem 0;border-bottom:1px solid var(--line)}
h2{font-size:1.45rem;margin-bottom:.7rem}
h3{font-size:1.05rem;margin-bottom:.3rem}
p{color:var(--muted);margin-bottom:.7rem}
strong{color:var(--text)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin:.6rem 0 1rem}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1rem 1.1rem}
.card p{margin:0}
.ticks{list-style:none;color:var(--muted)}
.ticks li{padding:.25rem 0 .25rem 1.6rem;position:relative}
.ticks li::before{content:"✓";position:absolute;left:0;color:var(--accent);font-weight:700}
.steps{padding-left:1.3rem;color:var(--muted)}
.steps li{margin-bottom:.6rem}
.sec-img{width:100%;aspect-ratio:16/7;object-fit:cover;border-radius:14px;margin-bottom:1rem}
.more{font-weight:600;text-decoration:none}
details{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:.8rem 1rem;margin-bottom:.6rem}
summary{cursor:pointer;font-weight:600}
details p{margin:.6rem 0 0}
.also{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:.6rem}
.also a{background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:.45rem .9rem;text-decoration:none;color:var(--text);font-size:.92rem}
footer{max-width:860px;margin:0 auto;padding:1.5rem clamp(16px,4vw,2rem) 2.5rem;color:var(--soft);font-size:.85rem;display:flex;gap:1.2rem;flex-wrap:wrap}
footer a{color:var(--soft)}
`;

module.exports = function setupSeo(app, { escapeHtml, loadProjects, imageVariants }) {
  const esc = (s) => escapeHtml(String(s == null ? '' : s));

  function topNav(current) {
    return `<nav class="top" aria-label="Bereiche"><a class="brand" href="/">Martin Renner</a>${PAGES.map((p) =>
      `<a href="${p.path}"${p.path === current ? ' aria-current="page"' : ''}>${esc(p.nav)}</a>`).join('')}<a href="/voctails">Voctails</a></nav>`;
  }

  function imgTag(img, cls, alt, eager) {
    if (!img) return '';
    return `<img class="${cls}" src="${esc(img.src)}"${img.srcset ? ` srcset="${esc(img.srcset)}" sizes="${cls === 'sec-img' ? '(max-width: 860px) 100vw, 860px' : '100vw'}"` : ''} alt="${esc(alt)}" style="object-position:${esc(img.focus)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  }

  function render(page) {
    const img = projectImage(loadProjects, imageVariants, page.project);
    const url = SITE + page.path;
    const imageAbs = img ? SITE + img.src : null;
    const graph = [
      { ...PERSON },
      { '@type': 'WebPage', '@id': url, url, name: page.title, description: page.description, inLanguage: 'de-DE', about: { '@id': PERSON['@id'] }, primaryImageOfPage: imageAbs || undefined },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Martin Renner', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: page.nav, item: url },
      ] },
      page.schema({ ...page, imageAbs }),
    ];
    if (page.faq.length) {
      graph.push({ '@type': 'FAQPage', mainEntity: page.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
    }
    const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');

    const sections = page.sections.map((s) => {
      const sImg = s.project && s.project !== page.project ? projectImage(loadProjects, imageVariants, s.project) : null;
      return `<section${s.id ? ` id="${esc(s.id)}"` : ''}>${imgTag(sImg, 'sec-img', s.h2, false)}<h2>${esc(s.h2)}</h2>${s.html}</section>`;
    }).join('\n');
    const faq = page.faq.length ? `<section><h2>Häufige Fragen</h2>${page.faq.map(([q, a]) =>
      `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>` : '';
    const also = PAGES.filter((p) => p.path !== page.path);
    const external = /^https?:/.test(page.cta.href);

    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#0f172a">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="Martin Renner">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${url}">
${imageAbs ? `<meta property="og:image" content="${esc(imageAbs)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${jsonLd}</script>
<style>${CSS}</style>
</head>
<body>
${topNav(page.path)}
<header class="hero">${imgTag(img, '', page.alt || page.h1, true)}<div class="in">
<h1>${esc(page.h1)}</h1>
<p class="lead">${esc(page.lead)}</p>
<a class="btn" href="${esc(page.cta.href)}"${external ? ' rel="noopener"' : ''}>${esc(page.cta.label)}</a>
</div></header>
<main>
${sections}
${faq}
<section><h2>Mehr von Martin Renner</h2><p>Chorleiter, Regisseur und Veranstaltungstechniker aus Neckarsulm – unterwegs in ${esc(REGION)}.</p>
<div class="also">${also.map((p) => `<a href="${p.path}">${esc(p.nav)}</a>`).join('')}<a href="/voctails">Voctails</a><a href="/">Startseite</a></div>
<a class="btn" href="${esc(page.cta.href)}"${external ? ' rel="noopener"' : ''}>${esc(page.cta.label)}</a></section>
</main>
<footer><span>© Martin Renner, Neckarsulm</span><a href="/impressum.html">Impressum</a><a href="/datenschutz.html">Datenschutz</a><a href="/kontakt">Kontakt</a></footer>
</body>
</html>`;
  }

  for (const page of PAGES) {
    app.get([page.path, page.path + '/'], (req, res) => {
      res.set('Cache-Control', 'public, max-age=600');
      res.type('html').send(render(page));
    });
  }

  // Bekannte Suchbegriffe als kurze Adressen → passende Seite (301)
  const ALIASES = {
    '/verleih': '/veranstaltungstechnik',
    '/technik': '/veranstaltungstechnik',
    '/tontechnik': '/veranstaltungstechnik',
    '/lichttechnik': '/veranstaltungstechnik',
    '/chorleitung': '/chorleiter',
    '/chor-x': '/chorleiter',
    '/chor': '/choere',
    '/regie': '/musical',
  };
  app.get(Object.keys(ALIASES), (req, res, next) => {
    const target = ALIASES[req.path.toLowerCase().replace(/\/+$/, '')];
    if (!target) return next();
    res.redirect(301, target);
  });

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send([
      'User-agent: *',
      'Allow: /',
      // Die Startseite holt ihre Inhalte von dort – Suchmaschinen sollen sie lesen dürfen
      'Allow: /api/projects',
      'Allow: /api/news',
      // Tools, Logins, Übe-Bereiche und APIs gehören nicht in den Suchindex
      ...['/admin', '/api/', '/tools', '/choerle', '/chorx', '/musicals', '/voctails/intern', '/kameras', '/lokal', '/heizung', '/skript',
        '/buehne', '/licht', '/programmheft', '/bewertung', '/tagebuch', '/kalender', '/buero', '/balkonkraftwerk', '/mpa', '/probenvideo',
        '/signatur'].map((p) => 'Disallow: ' + p),
      '',
      `Sitemap: ${SITE}/sitemap.xml`,
      '',
    ].join('\n'));
  });

  app.get('/sitemap.xml', (req, res) => {
    const urls = ['/', ...PAGES.map((p) => p.path), ...PUBLIC_EXTRA.slice(1)];
    const prio = (u) => (u === '/' ? '1.0' : /impressum|datenschutz/.test(u) ? '0.2' : '0.8');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc><priority>${prio(u)}</priority></url>`).join('\n')}
</urlset>
`);
  });

  return { PAGES };
};

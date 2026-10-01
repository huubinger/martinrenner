'use strict';
// Wortliste für Sync-Codes (3 Wörter, z. B. "tuba-mond-kaffee"). Nur a-z, damit sich Codes leicht eintippen lassen.
const WORDS = `
abend adler ahorn akkord album alpaka ampel anker apfel april arche arena atlas auge august auto axt
bach bagger bahn balkon ball banane band bank bar bass bauer baum beere berg besen beton biber biene
bild birne blatt blech blick blitz blume boden bogen bohne boot brett brief brille brot bruecke brunnen buch
burg busch butter chor clown dach dackel dampf daumen decke delfin deich dose drache draht dune dunst
echo efeu egel ehre eiche eimer eis elch elefant engel ente erbse erde esel eule falke farbe feder
feld felsen fenster ferien fest feuer fichte film fink fisch flagge flasche fleck floete flocke floh flug
fluss flut fohlen forelle foto frosch fuchs funke gabel gans garten gast geige geld gewitter gips giraffe
glanz glas glocke glueck gold gong gras grill gurke gurt hafen hagel hahn hai haken halle hammer
hand harfe hase haus hecht hecke hefe heft held helm hemd herbst herz heu himmel hirsch hitze
hobel hof hoehle honig horn hose huhn hummel hund hut igel insel jacke jaguar januar jazz joghurt
jubel juli juni kabel kaefer kaffee kahn kakao kaktus kalb kamel kamin kamm kanal kanne kante kappe
karte kater katze kegel keks keller kerze kessel kette kiefer kind kino kirsche kissen kiste kiwi klang
klavier klee klippe knopf koala koch koffer kohl komet koenig kopf korb korn kran kranich krebs kreide
kreis krone krug kuchen kuh kunst kupfer kurve kutsche lachs lager lamm lampe land laterne laub lava
leiter lerche licht lied lilie linde lineal loewe loeffel lotse luchs luft lupe mais mantel mappe marmor
maske mauer maus meer mehl melodie melone messer milch minze mixer moehre mond moos motor moewe
muehle muschel museum musik mutig nacht nadel nagel nashorn nebel nest netz nuss oase obst ofen ohr
oktave oliven onkel oper orange orchester orgel otter paddel paket palme panda papier park pauke pedal
pfanne pfeffer pfeife pferd pflaume pilot pilz pinsel pirat pizza planet platz polka pony posaune preis
prinz puder pudel pulli punkt puppe quelle rabe radio rakete rasen rebe regen reh reis rinde ring
robbe rock rose rucksack ruder saal saft sage salz samba sand sattel schaf schal schatz schiff schild
schlitten schnee schrank schuh schule schwan see segel seil sessel sichel sieb silber sirup ski socke
sofa sommer sonne spatz spiegel spinne sprung stadt stall stamm stein stern stift stimme strand strauss
strom stuhl sturm suppe tafel takt tal tango tanne tante tasche tasse taube tee teich teller tenor
tiger tisch toast tomate topf tor trommel trompete tuba tukan tulpe turm uhr ufer uhu vase vogel
vulkan waage wagen wal wald walzer wand wasser watte welle wiese wind winter wolke wolle wurm zange
zebra zelt ziege zimt zirkus zither zitrone zucker zug zwerg zwiebel
akazie alge ameise angel apfelsine asche ast bambus bart becher beet bernstein biskuit blues bluse bohrer
bonbon brezel bremse bruch buerste dattel diamant distel dorf drossel duene eber eisbaer emu erdbeere fackel
faden fass feige ferse fiedel flaute flosse foehn forst fracht fruehling gabelung galopp gemse gerste gletscher
gondel graben granit groschen gummi hafer halm hamster hantel hering himbeere hirse holunder hupe jodel
kabine kanu karpfen kastanie kiesel klammer kobold kokos kolibri korken krokus kuerbis lakritz lasso lehm
libelle limette loewenzahn lotus magnet mandel marder matrose meise mosaik mulde nelke nixe notiz ozean
paprika pelikan perle petersilie pfau pinguin pollen polster portal quark quitte radieschen raupe reiher rettich
rinne rodel rosine rubin saege salbei sardine schnecke schwamm seestern sellerie senf sirene skizze sockel spargel
spindel sprosse stieglitz storch tapir teppich thymian tinte trapez trichter trueffel tunnel veilchen wachtel walnuss
weide wespe wiesel wimpel yak ziegel zikade zunder
`.trim().split(/\s+/);

module.exports = [...new Set(WORDS)];

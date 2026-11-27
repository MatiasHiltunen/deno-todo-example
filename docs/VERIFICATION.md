# Testausraportti

Tarkistettu 17.11.2026 oikealla Docker Desktopilla. Docker-image rakennettiin ja
Compose-palvelut käynnistettiin tässä projektihakemistossa. Sovellus jäi lopuksi
käyntiin osoitteeseen `http://localhost:8000`.

## Alitehtävämuutoksen varmennus

Monitasoiset alitehtävät varmennettiin 17.11.2026 uudelleen oikeassa
Docker-sovelluksessa. Alla oleva alkuperäisen version tarkistustaulukko on
historiaa; tämän version tulokset ovat:

| Tarkistus                                   | Tulos                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deno task verify`                          | Muotoilu, lint, tyyppitarkistus ja 31 yksikkö-/API-testiä läpäisty                                                                                      |
| Docker-image                                | Uusi sovellusimage rakennettu Deno 2.9.6:lla                                                                                                            |
| Kaikki testit Dockerissa                    | 34 läpäisty, 0 epäonnistumista: 31 yksikkö-/API-testiä ja 3 PostgreSQL-integraatiotestiä                                                                |
| Uusi tietokanta                             | Molemmat migraatiot onnistuivat; uusinta-ajo ei lisännyt ylimääräisiä historiarivejä                                                                    |
| Olemassa olevan tietokannan päivitys        | Ennen migraatiota luodun tehtävän kuusi alkuperäistä kenttää säilyivät; `parentId` oli `null`                                                           |
| Monitasoinen rakenne                        | Päätaso, kaksi suoraa alitehtävää ja kolmas taso toimivat                                                                                               |
| Rajapinta                                   | Suodatus ylätehtävän ja tilan mukaan, sivutus, laskurit, siirto toiseen listaan sekä irrotus päätasolle toimivat                                        |
| Viite-eheys                                 | Olematon ylätehtävä, suora itseviittaus sekä kahden ja kolmen solmun kehät hylättiin                                                                    |
| Suorat SQL-kirjoitukset                     | Myös API:n ohittavat itseviittaukset, kehät ja kehän muodostava monirivinen päivitys hylättiin                                                          |
| Samanaikaiset siirrot                       | Toinen kirjoitus odotti ensimmäisen transaktion valmistumista; kehän sulkeva vastakkainen siirto sai 400-vastauksen                                     |
| Kaskadipoisto                               | Ylätehtävän kaikki jälkeläiset poistuivat; toisen listan tehtävät säilyivät                                                                             |
| Tietojen säilyminen                         | Kolmen tehtävätason kaikki kentät, `parentId`-linkit ja laskurit säilyivät Compose-konttien poistamisen ja uudelleenluonnin yli                         |
| Oikea selain                                | 30 toiminnallista tarkistusta: perustoiminnot, kauppalista, alitehtävät, murupolku, historia, sivun päivitys, poisto ja puuttuvan ylätehtävän käsittely |
| Näyttökoot                                  | Alitehtävälista tarkistettu 390 ja 1440 CSS-pikselin leveydellä; ei vaakasuuntaista ylivuotoa                                                           |
| Selainvirheet                               | Ei JavaScript-virheitä, käsittelemättömiä Promise-virheitä tai CSP-rikkomuksia                                                                          |
| Skeeman ja migraatiometatietojen vastaavuus | Drizzle Kitin uusinta-ajo ilmoitti, ettei skeemamuutoksia ole                                                                                           |
| Siivous ja lopputila                        | Kaikki omat testitehtävät ja erillinen testitietokanta poistettu; 0 tehtävää, 2 migraatiota, `db` ja `backend` terveitä                                 |

Selaintesti käytti erillistä tyhjää Chrome-profiilia ja oikeaa Docker-API:a.
Ylätehtävän ja alitehtävien valmistumistilojen itsenäisyys tarkistettiin myös
käyttöliittymässä. Pelkän `parentId`-suodattimen pois jättäminen säilyttää API:n
aiemman kaikkien tasojen listauksen.

Docker-ympäristö oli ennen tätä muutosta jäänyt WSL-tason jumiin. Desktopin
uudelleenkäynnistys ei yksin riittänyt. Dockerin omat WSL-jakelut pysäytettiin,
ja WSL-ydin käynnistettiin uudelleen vasta kun oli varmistettu, ettei muita
WSL-ympäristöjä ollut käynnissä. Tietolevyt ja volumet säilytettiin. Tämän jälkeen
build, migraatiot, testit ja tavallinen Compose-käynnistys toimivat.

## Testiympäristö

| Osa                    | Versio / ympäristö                                           |
| ---------------------- | ------------------------------------------------------------ |
| Isäntäkone             | Windows, Docker Desktop ja WSL2                              |
| Docker Engine          | 29.9.2                                                       |
| Docker Compose         | 5.6.1                                                        |
| Konttien arkkitehtuuri | Linux/ARM64                                                  |
| Sovelluksen runtime    | Deno 2.9.6 Docker-imagessa                                   |
| Isäntäkoneen Deno      | 2.9.7 (`deno task verify`)                                   |
| Tietokanta             | `postgres:17-alpine`, PostgreSQL 17.12                       |
| Selaintesti            | Chrome Headless 157.0.8103.79, erillinen tyhjä testiprofiili |

`.env` luotiin `.env.example`-tiedostosta. Projektilla ei ennen testiä ollut
Compose-kontteja eikä `deno-todo_postgres_data`-volumea. Ensimmäinen käynnistys
varmensi siten myös uuden tietokannan alustuksen.

## Alkuperäisen version Docker-tarkistukset

| Tarkistus                                   | Tulos                                                                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose up --build -d`              | Image rakentui lukituilla riippuvuuksilla ja kaikki kolme palvelua käynnistyivät                                                         |
| Tietokannan luonti                          | PostgreSQL alusti uuden volumen ja loi `todo`-tietokannan                                                                                |
| Skeema                                      | `public.todos`, sarakkeet, oletusarvot, pääavain, kaksi indeksiä ja otsikon CHECK-rajoite löytyivät                                      |
| Migraatiot                                  | `migrate` päättyi koodiin 0; Drizzlen historiassa oli yksi migraatio                                                                     |
| Migraation uusinta-ajo                      | Konttien uudelleenluonnin yhteydessä ajo onnistui ja historiassa säilyi yksi migraatio                                                   |
| Palveluiden valmius                         | `db` ja `backend` olivat `healthy`; `/health/ready` vastasi 200 ja `database: ok`                                                        |
| Kontin käyttäjä                             | Backend ajoi käyttäjänä `deno`, UID/GID 1993                                                                                             |
| Yksikkö-/API-testit Docker-imagessa         | 26 läpäisty, 0 epäonnistumista; myös testien tyyppitarkistus onnistui                                                                    |
| PostgreSQL-integraatiotesti Docker-imagessa | 1 läpäisty, 0 epäonnistumista erillisessä kertakäyttöisessä testitietokannassa                                                           |
| Oikean HTTP-palvelimen CRUD                 | Lisäys 201, haku 200, muokkaus 200, poisto 204 ja poiston jälkeinen haku 404                                                             |
| HTTP:n lisätarkistukset                     | Valmistumistila, suodattimet, sivutus, Unicode, reunavälien poisto, osittainen päivitys ja virheellisen syötteen 400-vastaukset toimivat |
| Staattiset tiedostot ja health-reitit       | `/`, `/app.js`, `/styles.css`, `/health/live` ja `/health/ready` vastasivat 200; `/.env` vastasi 404                                     |
| Hallittu sammutus                           | Backend sulki HTTP-palvelimen ja yhteyspoolin; kontin paluukoodi oli 0                                                                   |
| Tietojen säilyminen                         | Tehtävän kaikki kuusi kenttää säilyivät `docker compose down` / `up` -kierroksen yli                                                     |
| Volumen säilyminen                          | Tietokantakontin tunniste vaihtui, mutta sama nimetty volume liitettiin uudelleen                                                        |
| Oikean selaimen käyttöliittymätesti         | 10 tarkistusta läpäisty oikeaa Docker-API:a ja PostgreSQL:ää vasten                                                                      |
| Kapea ja leveä näkymä                       | 390 × 844 ja 1440 × 1000 CSS-pikselin näkymät tarkistettu; ei vaakasuuntaista ylivuotoa                                                  |
| Selaimen virheet                            | Käyttöliittymätestissä ei JavaScript-virheitä, käsittelemättömiä Promise-virheitä tai CSP-rikkomuksia                                    |
| Testitietojen siivous                       | Testitehtävät poistettiin; sovellustietokantaan jäi 0 tehtävää. Erillinen testitietokanta poistettiin                                    |
| Compose-asetukset                           | Sekä perusasetus että `compose.dev.yaml` läpäisivät `config --quiet` -validoinnin                                                        |

Integraatiotesti varmisti myös tallennuksen toisella tietokantayhteydellä ja
PostgreSQL:n otsikkorajoitteet. Sen jälkeen testitietokannan `todos`-taulussa oli
0 riviä ennen tietokannan poistamista.

Säilyvyystestissä vertailtiin tehtävän `id`-, `title`-, `description`-,
`completed`-, `createdAt`- ja `updatedAt`-kenttiä ennen konttien poistamista ja
uudelleenluonnin jälkeen. Tietokantavolyymia ei poistettu.

Selaintesti käytti sovelluksen omia lomakkeita ja painikkeita. Se kattoi
lisäyksen ja lomakkeen tyhjentymisen, muokkausdialogin ja kohdistuksen, otsikon
ja kuvauksen muokkauksen, valmistumisen, molemmat tilasuodattimet,
poistodialogin alkuperäisen kohdistuksen, poiston perumisen ja vahvistetun poiston.
Selaimen luoma tehtävä tarkistettiin myös oikeasta API:sta.

## Havaittu Docker-ympäristön häiriö

Ensimmäisen onnistuneen buildin ja käynnistyksen jälkeen Docker Engine lakkasi
vastaamasta hallintakyselyihin. Sovelluksen liveness-reitti vastasi, mutta
readiness palautti 503. Tietokanta vastasi edelleen suoraan kontin sisältä
suoritettuihin SQL-kyselyihin, ja skeema sekä migraatiohistoria olivat kunnossa.

Docker Desktop käynnistettiin käyttäjän luvalla uudelleen. Normaali pysäytys
jumiutui, joten pysäytys viimeisteltiin Docker Desktopin omalla `stop --force`
-toiminnolla. Tietokantavolyymit säilytettiin. Uudelleenkäynnistyksen jälkeen
hallintarajapinta ja tietokantayhteys palautuivat, ja kaikki yllä mainitut
testit läpäistiin. Myös projektin konttien myöhempi normaali sammutus ja
uudelleenluonti onnistuivat.

Häiriön tarkkaa juurisyytä ei varmistettu. Sovelluskoodiin, Dockerfileen tai
Compose-asetuksiin ei tarvittu muutoksia.

## Aiemman toimitustarkistuksen tulokset

Ennen tätä Docker-kierrosta projektissa oli kirjattu onnistuneiksi
`deno task verify` (muotoilu, lint, tyyppitarkistus ja 26 yksikkö-/API-testiä),
`deno task db:generate` ilman skeemamuutoksia sekä migraatio- ja HTTP-testit
paikallisella PostgreSQL 17.11:llä. Myös käynnistyminen ennen migraatioita
epäonnistui silloin odotetusti koodiin 1. Nämä aiemmat tarkistukset ovat erillisiä
yllä raportoiduista Docker- ja oikean selaimen testeistä.

## Testien toistaminen

Jos `.env` puuttuu, kopioi ensin `.env.example` sen pohjaksi. Säilytä olemassa
oleva `.env`.

```powershell
docker compose up --build -d --wait --wait-timeout 90
docker compose ps -a
curl.exe http://localhost:8000/health/ready

$testDirectory = (Resolve-Path tests).Path
docker compose run --rm -T --no-deps --volume "${testDirectory}:/app/tests:ro" backend test --cached-only --frozen --allow-env --allow-read=./public tests/unit/
```

Integraatiotestin erillisen tietokannan luonti ja migraatio-ohjeet löytyvät
[kehitysohjeesta](DEVELOPMENT.md#postgresql-integraatiotestit).

Säilyvyyden tarkistamiseksi lisää oma testitehtävä, suorita `docker compose down`
ja käynnistä uudelleen `docker compose up -d --wait --wait-timeout 90`.
Varmista tehtävän säilyminen ja poista vain itse luomasi testitehtävä.

Ajot tehtiin Linux/ARM64-konteilla. Selaimen mobiilinäkymä emuloitiin;
fyysistä mobiililaitetta tai kaikkia saavutettavuuden käyttötapoja ei testattu.

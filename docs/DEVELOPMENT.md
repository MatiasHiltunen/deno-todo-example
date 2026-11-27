# Kehitys, migraatiot ja ylläpito

## Kehitysympäristö

Asenna Deno 2.9.6 [Denon virallisen asennusohjeen](https://docs.deno.com/runtime/getting_started/installation/)
mukaan. Docker-asennuksessa tulee olla Compose v2.20 tai uudempi.

Komennot suoritetaan projektin juuressa:

```bash
cp .env.example .env
docker compose -f compose.yaml -f compose.dev.yaml up -d db
deno task db:migrate
deno task dev
```

Jos `.env` on jo olemassa, säilytä omat asetuksesi äläkä kopioi esimerkkitiedostoa
sen päälle. Ensimmäinen Deno-komento lataa lukitut npm-riippuvuudet. Node.js:n tai
npm:n erillisasennusta ei tarvita: Deno hoitaa npm-yhteensopivuuden.

`compose.dev.yaml` lisää tietokannan portin sidonnan osoitteeseen `127.0.0.1`.
Tavallinen `compose.yaml` ei julkaise tietokannan porttia. Dockerin sisällä
tietokannan nimi on `db`; koneella ajettava Deno käyttää osoitetta `127.0.0.1`.

## Deno-komennot

| Komento                      | Tarkoitus                                         |
| ---------------------------- | ------------------------------------------------- |
| `deno task start`            | Käynnistä backend kerran                          |
| `deno task dev`              | Käynnistä backend ja seuraa lähdekoodin muutoksia |
| `deno task db:generate`      | Luo skeeman muutoksesta SQL-migraatio             |
| `deno task db:migrate`       | Suorita puuttuvat SQL-migraatiot                  |
| `deno task check`            | Tarkista TypeScript-tyypit                        |
| `deno task lint`             | Tarkista koodin lint-säännöt                      |
| `deno task fmt`              | Muotoile projektin tiedostot                      |
| `deno fmt --check`           | Tarkista muotoilu muuttamatta tiedostoja          |
| `deno task test`             | Aja testit ilman tietokantaa                      |
| `deno task test:integration` | Aja erilliset PostgreSQL-integraatiotestit        |

Sovelluksen riippuvuudet on määritelty `deno.json`-tiedostossa ja lukittu
`deno.lock`-tiedostoon. Säilytä lukitustiedosto versionhallinnassa. Docker-build
käyttää `--frozen`-valintaa ja epäonnistuu, jos riippuvuuksien muutokset vaatisivat
lukitustiedoston muuttamista.

## Riippuvuuksien päivittäminen

Versiot on lukittu myös `deno.json`-tiedostossa. Muuta haluamasi riippuvuuden versiota
siellä ja päivitä lukitustiedosto tarkoituksella:

```bash
deno install --frozen=false
deno task verify
```

Tarkista `deno.json`- ja `deno.lock`-muutokset yhdessä. Jos päivität Drizzle Kitin,
päivitä myös `db:generate`-komennon tarkka `npm:drizzle-kit@...`-versio. Normaalit
ajot säilyttävät lukituksen; `--frozen=false` tarvitaan vain päivitysvaiheessa.

## Skeeman ja migraatioiden muuttaminen

Tietokannan lähdeskeema on `src/db/schema.ts`. Tuotettava SQL ja Drizzlen
metatiedostot ovat `drizzle/`-hakemistossa.

1. Muuta skeemaa `src/db/schema.ts`-tiedostossa.
2. Generoi migraatio: `deno task db:generate`.
3. Tarkista tuotettu SQL ennen sen suorittamista. Arvioi erityisesti sarakkeiden
   poistot, tyyppimuutokset ja olemassa olevien rivien oletusarvot.
4. Suorita migraatio paikalliseen tietokantaan: `deno task db:migrate`.
5. Päivitä tarvittaessa API, käyttöliittymä ja testit.
6. Tallenna skeema, SQL-migraatio ja `drizzle/meta/`-muutokset samaan commitiin.

Migraatioajo käyttää Drizzlen migraatiohistoriaa: jo suoritetut migraatiot eivät
toistu. Älä muokkaa migraatiota, joka on jo ajettu jaettuun ympäristöön. Tee
korjaukselle uusi migraatio.

Migraatioiden generointi tarvitsee paikallisen Denon. Valmis Docker-image sisältää
ajamiseen tarvittavan koodin ja SQL-migraatiot; generaattoria ei käytetä palvelimen
käynnistyksessä. Menettely perustuu
[Drizzlen migraatiotyönkulkuun](https://orm.drizzle.team/docs/migrations).

### Migraatiot Composessa

`docker compose up --build -d` käynnistää `migrate`-palvelun ennen backendia.
`migrate` sulkee yhteytensä ja päättyy onnistumiseen, kun skeema on ajan tasalla.
Virhe pysäyttää käynnistysketjun. Katso syy komennolla:

```bash
docker compose logs migrate
```

Voit suorittaa migraatiot myös erikseen jo rakennettua imagea käyttäen:

```bash
docker compose run --rm migrate
```

Jos lähdekoodi tai migraatiot ovat muuttuneet, rakenna image ensin uudelleen.
Pelkkä `docker compose restart` ei rakenna imagea eikä ota uusia lähdekooditiedostoja
mukaan.

## Testaus

### Ilman tietokantaa

```bash
deno task check
deno task lint
deno fmt --check
deno task test
```

API-testit kutsuvat Hono-sovellusta ja käyttävät erillistä repository-toteutusta.
Näin HTTP-sopimuksen, validoinnin ja virhetilanteiden testaus ei riipu ulkoisesta
palvelusta. Testaa varsinainen ORM ja PostgreSQL-yhteys seuraavan osion testeillä.

### PostgreSQL-integraatiotestit

Luo kehitystietokannasta erillinen testitietokanta kerran:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d db
docker compose exec db createdb -U todo todo_test
```

Jos olet muuttanut `POSTGRES_USER`-asetusta, korvaa yllä oleva `todo` sillä. Jos
`todo_test` on jo luotu, `createdb`-komentoa ei tarvitse suorittaa uudelleen.

Aja migraatiot testitietokantaan ja suorita testit. Seuraavat muuttujat koskevat
vain niiden perässä olevaa komentoa eivätkä muuta `.env`-tiedostoasi:

```bash
DATABASE_URL=postgresql://todo:todo_local_password@127.0.0.1:5432/todo_test \
  deno task db:migrate

TEST_DATABASE_URL=postgresql://todo:todo_local_password@127.0.0.1:5432/todo_test \
  deno task test:integration
```

PowerShellissa vastaavat komennot ovat:

```powershell
$env:TEST_DATABASE_URL = "postgresql://todo:todo_local_password@127.0.0.1:5432/todo_test"
$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = $env:TEST_DATABASE_URL
  deno task db:migrate
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
}
deno task test:integration
```

Käytä vain testaukseen tarkoitettua tietokantaa. Testit edellyttävät valmista
skeemaa ja lisäävät testirivejä; ne siivoavat itse luomansa rivit. Testikomento vaatii
`TEST_DATABASE_URL`-arvon eikä käytä sovelluksen `DATABASE_URL`-arvoa varavaihtoehtona.

## Päivittäminen ja lokit

Kun lähdekoodi muuttuu:

```bash
docker compose up --build -d
docker compose ps -a
docker compose logs --tail=100 migrate backend
```

Healthcheckit:

- `/health/live` tarkistaa, että HTTP-prosessi vastaa.
- `/health/ready` tarkistaa lisäksi, että tietokantaan voidaan tehdä kysely.

Composen backend-healthcheck käyttää readiness-reittiä. `unhealthy` kertoo
ongelmasta, mutta Dockerin healthcheck ei itsessään käynnistä konttia uudelleen.
`restart: unless-stopped` koskee prosessin päättymistä. Käynnistysjärjestys ei
myöskään ole jatkuva riippuvuuksien valvoja.

## Tietokannan säilyminen ja varmuuskopio

PostgreSQL 17 käyttää tässä projektissa polkuun `/var/lib/postgresql/data`
liitettyä nimettyä volumea. `docker compose down` poistaa kontit ja verkon,
mutta säilyttää volumen. `docker compose down -v` poistaa sen pysyvästi.

Varmuuskopioi oletusasetusten tietokanta SQL-tiedostoksi:

```bash
docker compose exec -T db pg_dump -U todo -d todo > todo-backup.sql
```

Korvaa käyttäjä ja tietokannan nimi omilla arvoillasi tarvittaessa. Säilytä
varmuuskopio erillään työprojektista ja tietokannan volumesta. Testaa myös
palautus erilliseen tietokantaan ennen kuin luotat kopioon.

`POSTGRES_*`-alustusmuuttujat vaikuttavat uuden, tyhjän datavolumen alustukseen.
Pelkkä `.env`-salasanan vaihto ei vaihda jo olemassa olevan tietokantakäyttäjän
salasanaa. Vaihda olemassa oleva salasana PostgreSQL:ssä ja päivitä yhteysasetukset
sen jälkeen. Esimerkkikehitysympäristön voi myös alustaa uudelleen, jos vanhat
tiedot saa poistaa.

PostgreSQL:n pääversion päivitys tarvitsee oman migraatio- tai
varmuuskopio/palautusmenettelyn. Älä vaihda imagea 17:stä 18:aan samalla
datavolumella. Myös
[virallisen imagen datakansion oletus muuttuu PostgreSQL 18:ssa](https://hub.docker.com/_/postgres).

## Jaettu tai julkinen ympäristö

Tämä toteutus on yhteinen tehtävälista ilman käyttäjäkohtaisia käyttöoikeuksia.
Ennen julkista käyttöönottoa lisää kirjautuminen, omistajuuden tarkistus API:in ja
HTTPS esimerkiksi käänteisvälityspalvelimen kautta. Käytä ympäristön omia
salaisuuksia ja tietokantatunnuksia.

Paikallisen Composen `POSTGRES_USER` luodaan PostgreSQL:n alustuksessa
pääkäyttäjäksi. Jaetussa ympäristössä käytä sovellukselle rajattua tietokantaroolia
ja erillistä migraatioroolia. Varmuuskopiointi, kapasiteettirajat ja valvonta
suunnitellaan käyttöympäristön mukaan.

## Vianetsintä

| Oire                                       | Tarkista / ratkaisu                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Compose vaatii `POSTGRES_PASSWORD`-arvon   | Kopioi `.env.example` tiedostoksi `.env` ja täytä salasana.                              |
| Portti 8000 on varattu                     | Vaihda Composen `APP_PORT`; paikallisen Denon tapauksessa muuta `PORT`.                  |
| Portti 5432 on varattu dev-ajossa          | Vaihda `POSTGRES_PORT` ja päivitä paikallinen `DATABASE_URL` sekä `TEST_DATABASE_URL`.   |
| Backend ei käynnisty                       | Tarkista `docker compose ps -a` ja `docker compose logs migrate db backend`.             |
| `migrate` on `Exited (0)`                  | Normaali onnistunut migraatioajo.                                                        |
| `connection refused` paikallisessa Denossa | Käynnistä tietokanta myös `compose.dev.yaml`-tiedostolla ja käytä `127.0.0.1`-osoitetta. |
| `password authentication failed`           | Tarkista URL:n tunnukset; vanha volume säilyttää alkuperäisen salasanan.                 |
| Koodimuutokset eivät näy Dockerissa        | Suorita `docker compose up --build -d`.                                                  |
| `--frozen`-virhe buildissä                 | Päivitä riippuvuudet ja `deno.lock` tarkoituksella, testaa ja rakenna uudelleen.         |
| Migraatio epäonnistuu                      | Lue SQL ja `migrate`-lokit; korjaa syy ennen backendin käynnistämistä.                   |
| Selain näyttää verkkovirheen               | Tarkista backendin lokit ja `/health/ready`; lataa tehtävät uudelleen.                   |

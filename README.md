# Todo — Deno, Drizzle ja PostgreSQL

Valmis todo-sovellus: suomenkielinen selainkäyttöliittymä, TypeScriptillä tehty
REST-rajapinta ja PostgreSQL-tietokanta. Tietokannan kyselyt ja skeema käyttävät
Drizzle ORM:ia. Docker Compose käynnistää tietokannan, suorittaa migraatiot ja
käynnistää backendin oikeassa järjestyksessä.

## Ominaisuudet

- Tehtävien lisääminen, muokkaaminen, valmistuneeksi merkitseminen ja poistaminen.
- Monitasoiset alitehtävät, esimerkiksi kauppalista ja sen tuotteet.
- Kaikkien, keskeneräisten tai valmistuneiden tehtävien näyttäminen sekä sivutus.
- PostgreSQL:ään tallennetut tehtävät säilyvät konttien uudelleenkäynnistyksissä.
- Syötteiden validointi, yhdenmukaiset JSON-virheet ja tietokantamigraatiot.
- Deno-testit, erilliset tietokantaintegraatiotestit sekä liveness- ja readiness-reitit.
- Käyttöliittymä ja API samassa backendissä; frontendille ei tarvita omaa
  kehityspalvelinta tai build-vaihetta.

## Pika-aloitus Docker Composella

Tarvitset Dockerin ja Docker Compose v2.20:n tai uudemman. Erillistä Deno-, Node.js-
tai PostgreSQL-asennusta ei tarvita.

Suorita komennot projektin juuressa:

```bash
cp .env.example .env
docker compose up --build -d
```

Avaa [http://localhost:8000](http://localhost:8000).

Ensimmäinen build lataa Deno-riippuvuudet ja Docker-imaget. Tarkista palveluiden
tila ja tarvittaessa lokit:

```bash
docker compose ps -a
docker compose logs -f backend migrate
curl http://localhost:8000/health/ready
```

`db`- ja `backend`-palveluiden tilan tulee muuttua arvoon `healthy`. Migraatioajon
tila `Exited (0)` on normaali: sen tehtävä on päättyä onnistuneesti. Jos migraatio
epäonnistuu, backend ei käynnisty.

Windows PowerShellissa ensimmäinen komento on `Copy-Item .env.example .env`.
API-esimerkeissä voit käyttää `curl.exe`-komentoa, jos `curl` on PowerShellin alias.

### Pysäyttäminen

```bash
docker compose down
```

Tietokanta säilyy nimetyssä `postgres_data`-volumessa. Sovellus jatkaa samoilla
tehtävillä seuraavan `docker compose up -d` -komennon jälkeen.

**Tietokannan tyhjennys:** `docker compose down -v` poistaa myös volumen ja kaikki
tehtävät pysyvästi. Käytä sitä vain, kun haluat aloittaa tyhjästä.

## Kokonaisuus

| Osa              | Toteutus                         | Vastuu                                        |
| ---------------- | -------------------------------- | --------------------------------------------- |
| Runtime          | Deno 2.9.6                       | TypeScript, HTTP-palvelin, työkalut ja testit |
| HTTP             | Hono                             | Reititys ja HTTP-vastaukset                   |
| ORM              | Drizzle ORM                      | Tyypitetty skeema ja kyselyt                  |
| PostgreSQL-ajuri | postgres.js                      | Tietokantayhteydet ja yhteyspooli             |
| Tietokanta       | PostgreSQL 17                    | Tehtävien pysyvä tallennus                    |
| Käyttöliittymä   | HTML, CSS ja JavaScript          | Selainkäyttö ilman build-vaihetta             |
| Migraatiot       | Drizzle Kit ja Drizzlen migrator | Versionhallittu SQL-skeema                    |
| Käynnistys       | Docker Compose                   | Palvelut, verkko, healthcheckit ja volume     |

Selain kutsuu saman palvelimen `/api/todos`-rajapintaa. Hono käsittelee ja validoi
pyynnön, repository suorittaa kyselyn Drizzlen kautta ja PostgreSQL tallentaa
muutoksen. Selain ei muodosta tietokantayhteyttä.

Compose-palveluiden vastuut:

1. `db` käynnistää PostgreSQL:n ja ilmoittaa valmiudesta `pg_isready`-tarkistuksella.
2. `migrate` odottaa tietokannan valmiutta ja soveltaa puuttuvat migraatiot.
3. `backend` käynnistyy onnistuneen migraatioajon jälkeen ja palvelee UI:n sekä API:n.

`depends_on`-ehdot ja healthcheckit seuraavat
[Docker Composen käynnistysjärjestysohjetta](https://docs.docker.com/compose/how-tos/startup-order/).
Backend pyörii kontin `deno`-käyttäjänä. Riippuvuudet haetaan build-vaiheessa
lukitustiedoston perusteella, ja ajossa käytetään vain valmiiksi välimuistissa
olevia riippuvuuksia.

## Asetukset

Kopioi `.env.example` tiedostoksi `.env`. `.env` on jätetty pois Docker-imagesta ja
versionhallinnasta.

| Muuttuja            | Esimerkki / oletus                                          | Käyttö                                                |
| ------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| `POSTGRES_DB`       | `todo`                                                      | Composen luoman tietokannan nimi                      |
| `POSTGRES_USER`     | `todo`                                                      | Composen tietokantakäyttäjä                           |
| `POSTGRES_PASSWORD` | `todo_local_password`                                       | Paikallinen esimerkkisalasana; Compose vaatii arvon   |
| `APP_PORT`          | `8000`                                                      | Backendin julkaistu portti omalla koneella            |
| `POSTGRES_PORT`     | `5432`                                                      | Tietokannan julkaistu portti vain dev-lisätiedostossa |
| `DATABASE_URL`      | `postgresql://todo:todo_local_password@127.0.0.1:5432/todo` | Paikallisesti ajettavan Denon tietokantayhteys        |
| `HOST`              | `.env.example`: `127.0.0.1`; sovellus: `0.0.0.0`            | Paikallisen Deno-palvelimen kuunteluosoite            |
| `PORT`              | `8000`                                                      | Paikallisen Deno-palvelimen kuunteluportti            |
| `TEST_DATABASE_URL` | Ei oletusta                                                 | Integraatiotestien erillinen tietokanta               |

Compose muodostaa konttien `DATABASE_URL`-arvon `POSTGRES_*`-muuttujista ja käyttää
palvelinnimeä `db`. Kontissa `HOST` on `0.0.0.0` ja `PORT` on `8000`; näitä ei lueta
`.env`-tiedoston paikalliskehityksen arvoista. Jos vaihdat `APP_PORT=8080`, avaa
`http://localhost:8080`.

Composen URL:n muodostus edellyttää, että `POSTGRES_USER`, `POSTGRES_PASSWORD` ja
`POSTGRES_DB` käyttävät URL-turvallisia merkkejä: kirjaimia `A–Z` ja `a–z`, numeroita,
alaviivaa tai yhdysmerkkiä. Paikallisen Denon `DATABASE_URL` on päivitettävä
erikseen, jos muutat tunnuksia tai tietokannan porttia. Ulkoisen tietokannan URL:ssa
erikoismerkit tulee URL-koodata.

Esimerkkisalasana on paikallista kokeilua varten. Sovellus on yhteinen tehtävälista
ilman kirjautumista. Compose julkaisee backendin vain `127.0.0.1`-osoitteessa ja
pitää tietokannan oletuksena sisäverkossa. Julkinen palvelu tarvitsee
käyttäjähallinnan, käyttöoikeudet ja HTTPS:n. Tarkemmat käyttöhuomiot löytyvät
[kehitys- ja ylläpito-ohjeesta](docs/DEVELOPMENT.md).

## API nopeasti

Luo esimerkiksi tehtävä **Kauppalista** ja avaa sen **Lisää alitehtäviä** -painike.
Lisää tuotteet listan sisällä ja merkitse ne erikseen valmiiksi. Murupolulla pääset
takaisin ylemmälle tasolle; alilistan osoite säilyy myös sivua päivitettäessä.
Ylätehtävän poistaminen poistaa myös sen alitehtävät kaikilta tasoilta.

Tietomallin valinnainen `parentId` viittaa saman `todos`-taulun `id`-kenttään.
Migraatio `0001_subtasks.sql` lisää viitteen olemassa olevaan tietokantaan:
vanhat tehtävät säilyvät päätasolla. API tukee myös tehtävän siirtämistä toisen
tehtävän alle tai takaisin päätasolle. Kehämäiset viittaukset estetään.

```bash
# Lisää tehtävä.
curl -i http://localhost:8000/api/todos \
  -H 'Content-Type: application/json' \
  -d '{"title":"Tee ensimmäinen tehtävä","description":"Kokeile myös muokkaamista."}'

# Listaa keskeneräiset tehtävät.
curl 'http://localhost:8000/api/todos?completed=false&limit=20&offset=0'
```

| Metodi   | Reitti           | Tarkoitus                                 |
| -------- | ---------------- | ----------------------------------------- |
| `GET`    | `/api/todos`     | Listaa ja suodata tehtäviä                |
| `GET`    | `/api/todos/:id` | Hae yksittäinen tehtävä                   |
| `POST`   | `/api/todos`     | Lisää tehtävä                             |
| `PATCH`  | `/api/todos/:id` | Muokkaa tehtävää tai sen valmistumistilaa |
| `DELETE` | `/api/todos/:id` | Poista tehtävä                            |
| `GET`    | `/health/live`   | Tarkista, että HTTP-prosessi vastaa       |
| `GET`    | `/health/ready`  | Tarkista myös tietokantayhteys            |

Täsmälliset kentät, vastausmuodot, validointi ja esimerkit:
[API-dokumentaatio](docs/API.md).

## Paikallinen kehitys ja testit

Tarvitset Deno 2.9.6:n. Käynnistä vain tietokanta ja avaa sen portti dev-asetuksella:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d db
deno task db:migrate
deno task dev
```

Jos Compose-backend on jo käynnissä samassa portissa, pysäytä se ensin komennolla
`docker compose stop backend`. `deno task dev` käynnistää backendin uudelleen
lähdekoodin muuttuessa. Käyttöliittymätiedostojen muutokset näkyvät selaimen
päivityksellä.

```bash
deno task check
deno task lint
deno fmt --check
deno task test
```

`deno task test` ei tarvitse tietokantaa. Integraatiotestit testaavat oikeaa
PostgreSQL:ää ja ajetaan erikseen. Niiden asetukset sekä migraatioiden tekeminen on
kuvattu [kehitys- ja ylläpito-ohjeessa](docs/DEVELOPMENT.md).

## Projektin tiedostot

| Polku                        | Sisältö                                               |
| ---------------------------- | ----------------------------------------------------- |
| `src/main.ts`                | Palvelimen käynnistys ja hallittu sammutus            |
| `src/app.ts`                 | HTTP-sovellus ja reitit                               |
| `src/todos/`                 | Tehtävien käsittely ja repository                     |
| `src/db/`                    | Drizzle-skeema, yhteydet ja migraatioajo              |
| `public/`                    | Suomenkielinen selainkäyttöliittymä                   |
| `drizzle/`                   | Versionhallittavat SQL-migraatiot ja skeemametatiedot |
| `tests/`                     | Yksikkö-/API-testit ja tietokantaintegraatiotestit    |
| `docker/healthcheck.ts`      | Backend-kontin readiness-tarkistus                    |
| `deno.json`, `deno.lock`     | Työkalukomennot ja lukitut riippuvuudet               |
| `drizzle.config.ts`          | Migraatiogeneraattorin asetukset                      |
| `Dockerfile`, `compose.yaml` | Konttibuild ja sovelluksen käynnistys                 |
| `compose.dev.yaml`           | PostgreSQL-portin avaaminen paikalliskehitykseen      |
| `docs/`                      | API:n, kehityksen, migraatioiden ja ylläpidon ohjeet  |

## Toimituksen tarkistus

Alitehtäviä tukevan version tarkistus 17.11.2026: `deno task verify` läpäistiin
(muotoilu, lint, tyyppitarkistus ja 31 yksikkö-/API-testiä). Docker-imagessa
läpäistiin kaikki 34 testiä, mukaan lukien kolme PostgreSQL 17.12 -integraatiotestiä.
Testit kattavat myös monitasoiset alitehtävät, siirrot, laskurit, kaskadipoiston
sekä kehän estämisen samanaikaisissa siirroissa.

Vanhan tietokannan päivitys säilytti olemassa olevan tehtävän tiedot. Kolmitasoisen
tehtäväpuun tiedot ja viitteet säilyivät myös Compose-konttien poistamisen ja
uudelleenluonnin yli. Oikealla Chromella läpäistiin 30 toiminnallista tarkistusta
sekä 390 ja 1440 pikselin levyisten näkymien tarkistus ilman vaakasuuntaista ylivuotoa.
Testitiedot siivottiin. Tarkat tulokset ja Docker-/WSL-ympäristön palautustoimet:
[testausraportti](docs/VERIFICATION.md).

## Lisätietoa käytetyistä työkaluista

- [Deno ja Docker](https://docs.deno.com/runtime/reference/docker/)
- [Deno ja Drizzle ORM](https://docs.deno.com/examples/drizzle_tutorial/)
- [Drizzle ja PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql)
- [PostgreSQL:n virallinen Docker-image](https://hub.docker.com/_/postgres)

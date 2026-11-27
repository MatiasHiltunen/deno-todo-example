# REST API

Oletusosoite: `http://localhost:8000`. Kaikki tehtäväreitit alkavat polulla
`/api/todos`. API ei vaadi tunnistautumista: sama tehtävälista on kaikkien
sovelluksen käyttäjien käytettävissä.

## Tehtävän tietomalli

```json
{
  "id": "411b4d48-0735-4cc3-b2f2-4f711a1d907f",
  "parentId": null,
  "title": "Kirjoita dokumentaatio",
  "description": "Lisää käynnistys- ja API-esimerkit.",
  "completed": false,
  "createdAt": "2026-11-17T10:00:00.000Z",
  "updatedAt": "2026-11-17T10:00:00.000Z",
  "subtaskCount": 0,
  "completedSubtaskCount": 0
}
```

| Kenttä                  | Tyyppi                     | Sääntö                                                           |
| ----------------------- | -------------------------- | ---------------------------------------------------------------- |
| `id`                    | UUID-merkkijono            | Palvelin luo, ei asiakkaan muutettavissa                         |
| `parentId`              | UUID-merkkijono tai `null` | Ylätehtävä samassa taulussa; `null` tarkoittaa päätason tehtävää |
| `title`                 | Merkkijono                 | Pakollinen luotaessa; 1–200 merkkiä reunavälien poiston jälkeen  |
| `description`           | Merkkijono                 | Enintään 2 000 merkkiä; oletus tyhjä merkkijono                  |
| `completed`             | Boolean                    | Oletus `false`; muutetaan PATCH-pyynnöllä                        |
| `createdAt`             | ISO 8601 -aikaleima        | Palvelimen luontiaika UTC:ssa                                    |
| `updatedAt`             | ISO 8601 -aikaleima        | Palvelin päivittää muokkauksessa                                 |
| `subtaskCount`          | Kokonaisluku               | Suorien alitehtävien määrä; vain luettava                        |
| `completedSubtaskCount` | Kokonaisluku               | Valmiiden suorien alitehtävien määrä; vain luettava              |

Otsikon reunavälit poistetaan; kuvauksen välilyönnit ja rivinvaihdot säilytetään.
Merkkirajat lasketaan Unicode-koodipisteinä. NUL-merkki (`\u0000`) ei ole sallittu
otsikossa tai kuvauksessa.

Tehtävillä voi olla useita alitehtävätasoja. Valmistumistila on jokaisella
tehtävällä itsenäinen: ylätehtävän valmistuminen ei muuta alitehtävien tilaa tai
päinvastoin. Laskurit koskevat aina kaikkia suoria alitehtäviä, riippumatta listan
suodattimesta. Ne eivät sisällä seuraavien tasojen jälkeläisiä.

Reiteissä käytetään UUID-tunnusta. Alla olevissa esimerkeissä `TODO_ID` on
luontipyynnön vastauksesta kopioitu todellinen `id`:

```bash
TODO_ID=411b4d48-0735-4cc3-b2f2-4f711a1d907f
```

Korvaa esimerkkitunnus omalla tunnuksellasi. Esimerkkiriviä ei luoda automaattisesti.

## Listaa tehtävät

```http
GET /api/todos?completed=false&limit=20&offset=0
```

| Parametri   | Oletus        | Sallitut arvot                                            |
| ----------- | ------------- | --------------------------------------------------------- |
| `completed` | Ei suodatusta | `true` tai `false`                                        |
| `parentId`  | Ei suodatusta | UUID: suorat alitehtävät; merkkijono `null`: vain päätaso |
| `limit`     | `50`          | Kokonaisluku 1–100                                        |
| `offset`    | `0`           | Kokonaisluku 0–2 147 483 647                              |

Tuntemattomat parametrit ja saman parametrin toistaminen tuottavat virheen `400`.
Sivutuksessa `offset` tarkoittaa ohitettavien tehtävien määrää. `total` kertoo
suodattimeen sopivien tehtävien kokonaismäärän, ei vain tämän sivun kokoa.
Uusimmat tehtävät tulevat ensin: järjestys on `createdAt` laskevasti ja saman
luontiajan tehtävissä `id` laskevasti.

Ilman `parentId`-parametria vastaus sisältää edelleen kaikkien tasojen tehtäviä.
`parentId=null` palauttaa vain päätason ja `parentId=<UUID>` vain kyseisen tehtävän
suorat alitehtävät. Suodatuksen voi yhdistää valmistumistilaan ja sivutukseen.
Kelvollinen mutta olematon ylätehtävän UUID palauttaa tyhjän listan.

```bash
curl 'http://localhost:8000/api/todos?completed=false&limit=20&offset=0'
```

Vastaus: `200 OK`.

```json
{
  "data": [
    {
      "id": "411b4d48-0735-4cc3-b2f2-4f711a1d907f",
      "parentId": null,
      "title": "Kirjoita dokumentaatio",
      "description": "Lisää käynnistys- ja API-esimerkit.",
      "completed": false,
      "createdAt": "2026-11-17T10:00:00.000Z",
      "updatedAt": "2026-11-17T10:00:00.000Z",
      "subtaskCount": 0,
      "completedSubtaskCount": 0
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 1
  }
}
```

Tyhjä lista palautuu normaalina `200`-vastauksena, jossa `data` on `[]`.

## Hae yksittäinen tehtävä

```http
GET /api/todos/:id
```

```bash
curl "http://localhost:8000/api/todos/$TODO_ID"
```

Vastaus: `200 OK`, `{ "data": { ...tehtävä... } }`. Kelvollinen UUID, jota ei löydy,
tuottaa vastauksen `404 Not Found`. Virheellinen UUID tuottaa vastauksen `400`.

## Luo tehtävä

```http
POST /api/todos
Content-Type: application/json
```

```bash
curl -i http://localhost:8000/api/todos \
  -H 'Content-Type: application/json' \
  -d '{"title":"Kirjoita dokumentaatio","description":"Lisää käynnistys- ja API-esimerkit."}'
```

Sallitut kentät ovat `title`, `description` ja `parentId`. `title` on pakollinen.
`parentId` on oletuksena `null`. Uusi tehtävä on aina keskeneräinen; `completed`
ei kuulu luontipyynnön kenttiin.

Vastaus: `201 Created`, `{ "data": { ...luotu tehtävä... } }`.
Vastauksen `Location`-otsake sisältää luodun tehtävän polun `/api/todos/:id`.

## Muokkaa tehtävää

```http
PATCH /api/todos/:id
Content-Type: application/json
```

Muuta yksi tai useampi kenttä: `title`, `description`, `completed` tai `parentId`.
Lähettämättä jätetyt kentät säilyvät ennallaan. Tyhjä objekti `{}` on virheellinen.
`null` on sallittu vain `parentId`-kentässä, jolloin tehtävä siirtyy päätasolle.
Ylätehtävän vaihtaminen siirtää myös sen alla olevan alipuun mukana.

```bash
# Merkitse valmistuneeksi.
curl -i -X PATCH "http://localhost:8000/api/todos/$TODO_ID" \
  -H 'Content-Type: application/json' \
  -d '{"completed":true}'

# Muokkaa nimeä ja tyhjennä kuvaus.
curl -i -X PATCH "http://localhost:8000/api/todos/$TODO_ID" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Tarkista dokumentaatio","description":""}'
```

Vastaus: `200 OK`, `{ "data": { ...päivitetty tehtävä... } }`.

## Esimerkki: kauppalista

Luo ensin päätason tehtävä ja sijoita vastauksen `data.id` muuttujaan `PARENT_ID`:

```bash
curl http://localhost:8000/api/todos \
  -H 'Content-Type: application/json' \
  -d '{"title":"Kauppalista"}'

# Korvaa PARENT_ID luodun kauppalistan todellisella UUID:lla.
curl http://localhost:8000/api/todos \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"Maito\",\"parentId\":\"$PARENT_ID\"}"

curl "http://localhost:8000/api/todos?parentId=$PARENT_ID&completed=false"
```

Olematon ylätehtävä, itsensä ylätehtäväksi asettaminen tai siirto oman jälkeläisen
alle palauttaa `400 VALIDATION_ERROR`. Tietokanta estää kehät myös suorissa
SQL-kirjoituksissa. API:n samanaikaiset hierarkiamuutokset sarjallistetaan
tietokannan transaktiolukolla.

## Poista tehtävä

```http
DELETE /api/todos/:id
```

```bash
curl -i -X DELETE "http://localhost:8000/api/todos/$TODO_ID"
```

Vastaus: `204 No Content`, ei vastausrunkoa. Jos tehtävää ei ole, vastaus on `404`.

Poisto poistaa myös kaikki tehtävän alitehtävät kaikilta tasoilta
(`ON DELETE CASCADE`). Muiden listojen tehtävät säilyvät. Käyttöliittymän
poistovahvistus kertoo myös alitehtävien poistamisesta.

## Validointi ja virheet

POST- ja PATCH-pyynnöissä tarvitaan `Content-Type: application/json` ja kelvollinen
JSON-objekti. Pyyntörungon enimmäiskoko on 16 KiB. Tuntemattomat kentät hylätään;
esimerkiksi asiakas ei voi asettaa tunnusta tai aikaleimoja. Boolean-arvot ovat
JSON-arvoja `true` ja `false`, eivät merkkijonoja `"true"` ja `"false"`.

Virheen runko on:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Todo not found."
  }
}
```

`code` on ohjelmalliseen käsittelyyn tarkoitettu arvo. `message` on ihmisen
luettava, englanninkielinen kuvaus; asiakkaan ei pidä verrata sen tarkkaa tekstiä.
Selainkäyttöliittymä näyttää käyttäjäviestit suomeksi.

| HTTP-tila | `error.code`             | Merkitys                                                             |
| --------- | ------------------------ | -------------------------------------------------------------------- |
| `400`     | `VALIDATION_ERROR`       | Virheellinen UUID, kenttäarvo, query-parametri tai tuntematon kenttä |
| `400`     | `INVALID_JSON`           | Virheellinen JSON-runko                                              |
| `404`     | `NOT_FOUND`              | Tehtävää tai reittiä ei löydy                                        |
| `413`     | `PAYLOAD_TOO_LARGE`      | Pyyntörunko ylittää 16 KiB                                           |
| `415`     | `UNSUPPORTED_MEDIA_TYPE` | POST/PATCH-pyynnön sisältötyyppi ei ole JSON                         |
| `500`     | `INTERNAL_ERROR`         | Odottamaton palvelin- tai tietokantavirhe                            |

Tietokantavirheiden yksityiskohdat eivät kuulu API:n virhevastauksiin. Katso
palvelinlokit vian selvittämiseksi.

## Healthcheckit

### Liveness

```bash
curl -i http://localhost:8000/health/live
```

`200 OK`:

```json
{ "status": "ok" }
```

Tarkistus kertoo, että HTTP-prosessi vastaa. Se ei tee tietokantakyselyä.

### Readiness

```bash
curl -i http://localhost:8000/health/ready
```

`200 OK`:

```json
{ "status": "ok", "database": "ok" }
```

Jos tietokantatarkistus epäonnistuu, vastaus on `503 Service Unavailable`:

```json
{ "status": "unavailable", "database": "unavailable" }
```

Readiness tarkistaa tietokantayhteyden ja tehtävätaulun käytettävyyden. Tätä
reittiä käyttää myös Compose-backendin healthcheck.

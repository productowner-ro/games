# The game log of the three games

Spec for the issue "Spec the game log of the three games". Date: 2026-10-20. The terms: `GLOSSARY.md`.

## The answer

Each game writes one text line per decision, in its own tab-separated format. The page keeps the lines in its memory and pushes them to `POST /api/log` every minute, at 50 waiting lines, or when the page closes. The Worker writes one D1 row per line. The lines hold the moves, the random draws and the probabilities of Jev, so a logged game can be replayed on a local machine. The visitor sees nothing new.

## What the log keeps about the visitor

Nothing. A game id from `crypto.randomUUID()` joins the lines of one game. It lives in page memory only, and a new game gets a new id. No IP address, no browser string, no visitor id.

The reason: Article 5(3) of the ePrivacy Directive allows "the storing of information … in the terminal equipment" of a user only with consent, or when the service that the user asked for needs it (EDPB Guidelines 2/2023, version 2.0, point 1: https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf). The games run without a visitor id and without stored lines, so the log stores nothing in the browser and needs no consent.

**Change from the issue text:** the issue keeps the lines in browser storage. This spec keeps them in page memory. A lost connection still loses no line, but a page reload loses the lines that wait.

## The lines

Tab-separated. `-` marks an empty field. Each game also writes these lines:

- `# game <game id>` starts a game. Mitropoly adds the seats: `# game <game id> <name>:<h|j>:<style>` for each seat.
- `# end <result> <reason>` ends a game.
- `# undo` takes one move back (chess only).

### Chess

No change to the format: the legend above `logLine` in `areas/chess/chess.js`. The moves alone give the replay. The game id and the push change: today chess uses an ISO time as its id and sends one request per line.

### Tetris

`n src act piece rot col row cleared danger mode conf top3`

- `n`: number of the line in the game.
- `src`: `h` = a person, `j` = Jev. When a Jev call fails, the bot stops, so no line comes from a code pick.
- `act`: `lock` = the piece lands, `hold` = the piece goes on hold.
- `piece`: the type of the piece (`I`, `O`, `T`, `S`, `Z`, `J`, `L`).
- `rot`, `col`, `row`: the rotation and the cell where the piece lands. Empty on a `hold` line.
- `cleared`: the lines that the piece clears.
- `danger`: the probability of Jev that the stack is in danger.
- `mode`: `edge` or `safe`, the question whose pick the bot played.
- `conf`: the confidence of Jev in that pick.
- `top3`: the top candidates of that question, as `id:p`.

The pieces in their order give the replay. No timing is needed.

### Mitropoly

`turn seat src kind choice draw p top3`

- `turn`: the turn of the game.
- `seat`: the seat that acts, 0 to 3.
- `src`: `h` = a person, `j` = Jev, `c` = code took the only option.
- `kind`: `roll`, `buy`, `jail`, `manage` or `debt`.
- `choice`: the key of the option, for example `buy`, `pay_bribe`, `build_12`.
- `draw`: on a `roll` line, the dice and the card drawn, for example `3,4` or `3,4;chance:12`, where 12 is the index of the card in its list.
- `p`: the probability of the choice.
- `top3`: the top options of Jev, as `key:p`.

The dice and the cards give the replay.

## The push

- **Route:** `POST /api/log`, `Content-Type: text/plain`, so `navigator.sendBeacon` can send it when the page closes.
- **Body:** the first line is `<game>\t<game id>`, with `<game>` as `chess`, `tetris` or `mitropoly`. Each next line is `<seq>\t<line>`. `seq` counts the lines of the game from 1, `#` lines too.
- **When:** every minute, at 50 waiting lines, or when the page closes. The page sends no push when no line waits.
- **Answers of the Worker:**
  - `204`: the lines are in D1. The page drops them.
  - `400`: the body breaks a limit. The page drops the lines.
  - `503`: D1 is past its daily limit. The lines wait for the next push.
  - A lost connection or another `5xx`: the lines wait for the next push.
- **Buffer:** at most 500 lines wait in the page. Past that, the page drops the oldest line.

## The limits

- 50 lines per push, 500 characters per line. The Worker answers `400` past either.
- D1 Free writes 100,000 rows per day. Past that, "you will not be able to run queries against D1" until 00:00 UTC (https://developers.cloudflare.com/d1/platform/pricing/). Then the Worker answers `503`.
- Each push is a Worker request, and Workers Free allows 100,000 requests per day for `/api/jev` and `/api/log` together (https://developers.cloudflare.com/workers/platform/limits/). One tab that stays open all day sends at most 1,440 pushes.

## The table

```sql
CREATE TABLE log_lines (
  game        TEXT NOT NULL,
  game_id     TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  line        TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (game_id, seq)
);
```

The Worker writes with `INSERT OR IGNORE`, so a push sent twice writes no duplicate rows. `npx wrangler d1 export <database> --remote --output=./log.sql` reads the log back (https://developers.cloudflare.com/d1/best-practices/import-export-data/).

## Not in this spec

- The build: a later task takes this spec.
- What people click on the page: the PostHog issue.

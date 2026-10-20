# Handoff: Jev vs Jev chess (2026-09-25)

## Goal

A browser chess game in this folder, modelled on `../tetris/`. Two Jev bots (TypeSafe System One model) play each other. The user wants **Jev to make the decisions**. Do not replace Jev's choices with code rules or a search engine: the user rejected that ("this breaks the purpose").

## Status

Step 1 (playable chess) and step 2 (two Jev bots) are done. Nothing is committed yet. The server and the watch are stopped.

## Files

| File | What it holds |
|---|---|
| `index.html` | Page: board canvas, turn/status panel, bot panels, move list |
| `chess.js` | Rules engine, UI, and the bot section ("Autoplay with Jev") |
| `server.js` | Serves the page, proxies `/api/jev` to TypeSafe, appends `/api/log` lines to `games.log` |
| `rules-test.js` | Headless perft + game-end + SAN + repetition-fact checks. Must print `ALL PASS` |
| `bot-test.js` | Headless Jev games: `node bot-test.js [half-moves] [games] [start FEN]`. Prints results, plans, "real losses" |
| `games.log` | Tab-separated game log, legend at the top of each format block |

## How to run

- Server: `node areas/chess/server.js` from the `games` folder, then open http://localhost:8788. Click the page, press A (bots on/off), R restarts, U undo, F flip.
- The server and `bot-test.js` read the TypeSafe API key only from the env var `TYPESAFE_API_KEY`.
- Browser automation: key presses often miss the page. Start the bots with `toggleAutoplay()` through the JS tool.

## Bot design (current)

- Code lists all legal moves and computes one-move facts per move (`describe()`): captures, check, mate, stalemate, `advantage_after_move`, `advantage_after_best_reply` (net of one recapture), `enemy_king_squares`, `king_distance`, `repeats_position`, `draws_by_repetition`.
- Code rules: play a mate in one; never allow a mate in one.
- One Jev request per move: a `plan` Choice (develop, win_material, attack_king, mate_weak_king, hold_draw) plus one move Choice per plan. Code plays the move of the chosen plan.
- The move is **sampled** from Jev's probabilities with `TEMPERATURE = 0.5` (user wanted variety; Jev argmax replayed the same game every time).
- Bot styles: White "Attacker", Black "Solid" (`BOTS` in `chess.js`).

## Findings from 5 logged games + tests

- Jev picks sensible plans with high confidence (hold_draw .8-.99 when behind; develop in the opening).
- Jev often picks moves whose facts show a material loss (e.g. 29. Rxe5 at .85 with −2 → −6). Every game had 6+ swings of 2+ points.
- The `mate_weak_king` plan makes the leading side walk its king toward the enemy king and ignore pawns. In 3 of 5 games a pawn promotion decided the result.
- Sampling sometimes draws weak moves (probabilities .08-.23).
- Repetition fact works: P(repeat) fell from .38 to .00-.01 in the test position.

## Open recommendations (not started; user has not approved)

1. Add a "promote a pawn" plan and a pawn-distance-to-promotion fact (and "stops enemy pawn").
2. Add threat facts (what the move attacks next; forks) and measure with `bot-test.js` whether material losses drop.
3. The user rejected code filters that remove losing moves. Improvements must keep Jev choosing.

## Log gotchas

- `games.log` holds two formats. Lines above the second legend use a half-move number plus a side column. Lines below it use the UI move number (`38.` White, `38...` Black).
- The first logged game misses moves 1-9 and its `# game` line (lost during a server restart).

## Suggested skills

- `typesafe:typesafe-ai`: before you change the Jev questions; read the live docs (Choice, Noul, Score, confidence).
- `claude-in-chrome`: to watch a game in the browser.
- `run`: to start the server and check a change in the real app.

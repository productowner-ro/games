# Games

Browser games built with Claude, where Jev makes the decisions of the players. The goal: show on games.productowner.ro what Claude can build, and how Jev works as a gameplay engine. The terms: `GLOSSARY.md`.

- `areas/<game>/`: one folder per game: tetris, chess, mitropoly. A game has no end state, so it is an area.
- `worker/`: the Worker that serves the games and passes the calls to Jev, under a daily cap. `worker/prod/` runs the same Worker on workerd, the open-source Workers runtime.
- Run the games: `docker compose up dev` reloads on each save; `docker compose up prod` runs the Worker on workerd. Both read the TypeSafe key from the env var `TYPESAFE_API_KEY`.
- The plan that puts the games online: the map issue [Map: put the Jev games on games.productowner.ro](https://github.com/productowner-ro/games/issues/1) and its sub-issues.
- `docs/agents/`: how the agent skills use the issue tracker and the glossary.
- `resources/`: research notes that issues cite.
- `projects/`, `inbox/`, `archives/`: PARA folders, empty for now.

Licence: copyright (C) 2026 Gabi Udrescu, under the GNU Affero General Public License v3.0 (`LICENSE`). A site or app that runs a changed copy of the games must publish its source.

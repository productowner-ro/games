# PostHog on the games

Spec for issue #8. PostHog shows what people do on tetris, chess and mitropoly. It stores nothing in the browser, so the games show no cookie banner.

## Setup

- **Project:** a new PostHog project, "games", in the EU region.
- **Project setting:** "Cookieless server hash mode" on (Project Settings > Web analytics). Without it, PostHog drops cookieless events ([PostHog: data collection](https://posthog.com/docs/privacy/data-collection)).
- **Init:** one shared file, `areas/analytics.js`, loads posthog-js on each game page with:

```js
posthog.init('phc_khRa5UDQ3qqZXhD6KZe7BVL7kyhNDBfyVrAto25M3Jmm', {
  api_host: 'https://eu.i.posthog.com',
  cookieless_mode: 'always',
  person_profiles: 'never',
  autocapture: false,
  disable_session_recording: true,
  capture_pageview: true,
});
```

The project token is public by design: it can only send events.

## Why cookieless

With `cookieless_mode: 'always'`, PostHog "never stores data in cookies or local/session storage" and needs no cookie banner. PostHog counts visitors per day with a hash of the IP address, the user agent and a salt that changes daily ([How to do cookieless tracking](https://posthog.com/docs/tutorials/cookieless-tracking)). This matches the game log ([game log spec](2026-10-20-game-log-spec.md)): no visitor id, no consent.

The cost: no visitor shows as the same person across days, and session replay stays off. PostHog disables session replay without cookie consent, "because both features rely on storing data in cookies/local storage" (same tutorial, section "Limitations"). The game log replays each game decision by decision.

## Events

Each event carries the property `game`: `tetris`, `chess` or `mitropoly`.

| Event | When | Extra properties |
|---|---|---|
| `$pageview` | A game page opens. | none |
| `game_started` | A new game starts. | mitropoly: `seats`, `jev_seats` |
| `game_over` | A game ends. | tetris: `lines`, `score`; chess: `result`, `moves`; mitropoly: `winner`, `turns` |
| `jev_toggled` | A person turns a Jev player on or off. | `on` (true or false); mitropoly: `seat` |
| `jev_rested` | A Jev player stops at the daily cap. | none |
| `jev_failed` | A Jev call fails below the cap and the Jev player stops. | `error` (the error message) |
| `jev_retry` | A person asks a stopped Jev player to try again. | mitropoly only: `seat` |

No event per move: the game log holds the moves.

## Not in this spec

- A share of Jev calls per visitor: out of scope on the map.
- Surveys and feature flags.

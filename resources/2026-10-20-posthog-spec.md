# PostHog on the games

Spec for issue #8. PostHog shows what people do on tetris, chess and mitropoly. A cookie banner asks the visitor first, for Legea 506/2004 art. 4 alin. (5)-(5^6): PostHog sends no event and stores nothing until the visitor answers.

## Setup

- **Project:** a new PostHog project, "games", in the EU region.
- **Project setting:** "Cookieless server hash mode" on (Project Settings > Web analytics). Without it, PostHog drops cookieless events ([PostHog: data collection](https://posthog.com/docs/privacy/data-collection)).
- **Init:** one shared file, `areas/analytics.js`, loads posthog-js and the cookie banner on each game page with:

```js
posthog.init('phc_khRa5UDQ3qqZXhD6KZe7BVL7kyhNDBfyVrAto25M3Jmm', {
  api_host: 'https://eu.i.posthog.com',
  cookieless_mode: 'on_reject',
  person_profiles: 'never',
  autocapture: false,
  disable_session_recording: true,
  capture_pageview: true,
});
```

The project token is public by design: it can only send events.

## Why a banner

EDPB Guidelines 2/2023 count a script that collects data from the browser as access to the device, even when it stores nothing. So PostHog waits for the visitor's answer. Two steps still happen without consent, by the owner's choice: PostHog loads its script and its remote config before the answer, and after a Reject it sends events with no cookie. PostHog runs with `cookieless_mode: 'on_reject'` ([How to do cookieless tracking](https://posthog.com/docs/tutorials/cookieless-tracking)):

| Moment | What PostHog does (measured in Chrome on a local copy) |
|---|---|
| Before an answer | Loads its script and its remote config. Sends no event, stores nothing. |
| Accept | `opt_in_capturing()` sets the cookie `ph_<key>_posthog`, the same data in localStorage and session keys in sessionStorage, and sends `$opt_in` with `consent_version`: the proof of the consent and its moment. Then it sends the events. |
| Reject | `opt_out_capturing()` keeps only `__ph_opt_in_out_<key>` in localStorage. PostHog sends the events with no cookie: it counts visitors per day with a hash of the IP address, the user agent and a salt that changes daily. |

The banner has "Accept" and "Reject" in one style, on one layer. A "Cookie settings" button at the bottom left of each game opens it again, shows the current choice, and lets the visitor change it; the button shows only when PostHog has loaded. Keys pressed inside the banner do not reach the game, and the banner gives the keys back to the game when it closes. The banner text follows the `lang` of the page: English on tetris and chess, Romanian on mitropoly. Raise `CONSENT_VERSION` in `areas/analytics.js` when the banner text or what PostHog stores changes.

The cost: PostHog does not see a visit until the visitor answers, so a visitor who plays without an answer sends no `$pageview` and no game event. Session replay stays off. The game log replays each game decision by decision ([game log spec](2026-10-20-game-log-spec.md)).

The project setting "Cookieless server hash mode" stays on: PostHog needs it for the events after a Reject.

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

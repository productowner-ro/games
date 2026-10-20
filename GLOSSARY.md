# Games

Browser games built with Claude, where Jev makes the moves of the bot players. They go public on games.productowner.ro.

## Language

**Jev**:
The TypeSafe System One model. It picks one option from a list that the game gives it, with a probability for each option.
_Avoid_: the AI, the engine, the LLM

**Jev player**:
A player in a game whose decisions Jev makes. Code lists the legal options and their facts; Jev chooses.
_Avoid_: bot, AI player, autoplay

**Gameplay engine**:
The role Jev plays in a game: the part that decides, not the part that holds the rules.
_Avoid_: game engine, rules engine

**Daily cap**:
The highest number of Jev calls that the public site makes in one day. Past it, the Jev players stop until the next day.
_Avoid_: budget, quota, rate limit

**Game log**:
The record of what happens in a game on the site, so that we can look back at real games later. It holds one log line per decision.
_Avoid_: analytics, events, tracking

**Log line**:
One decision that changes a game, made by a person or by Jev: a tetris piece that lands or goes on hold, a chess move, a mitropoly roll or choice. A key press or a click that changes nothing in the game is not a log line.
_Avoid_: event, entry, record

**Game id**:
A random id for one game on the site. It joins the log lines of that game and says nothing about the visitor.
_Avoid_: session id, visitor id, user id

**Replay**:
Playing a logged game again on a local machine, move by move, with the same dice, cards and pieces.
_Avoid_: rerun, re-ask

**Semaphore**:
The light on the page of a game that shows about how many Jev calls are left today: green, yellow or red.
_Avoid_: quota bar, meter

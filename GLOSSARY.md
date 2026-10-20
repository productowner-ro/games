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

**Semaphore**:
The light on the page of a game that shows about how many Jev calls are left today: green, yellow or red.
_Avoid_: quota bar, meter

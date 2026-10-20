# Disclosure rules

This repo is public, and so are its GitHub issues. Check each commit, push, issue and comment against these rules before it leaves the machine. A fact that breaks a rule goes into `private/`, which git ignores.

1. **Game facts are public**: the rules of the games, the code, the Jev questions and the chess game log.
2. **The stack is public at product level only**: for example "Cloudflare Workers, a Durable Object, D1". No hostnames other than games.productowner.ro, no DNS records, account ids, routes or deploy pipelines.
3. **Other sites of the owner stay private**: no word on how any other site or Worker of the owner runs.
4. **The machine of the owner stays private**: no home paths, folder layout, local ports in prose, or names of private projects. The code reads the TypeSafe key only from the env var `TYPESAFE_API_KEY`.
5. **Accounts stay private**: no credits, key names, key counts or billing state. Facts from public vendor docs are fine, for example the TypeSafe rate limits.
6. **Habits and tools of the owner stay private**: no names of private skills, secret stores or local tooling.

When a rule does not settle a case, ask Gabi before the text leaves the machine.

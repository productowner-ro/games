# The prod stage: the games Worker on workerd, the open-source Workers runtime.
# The Dockerfile copies this file to /app; the paths below are paths in the image.
using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "files", worker = .files),
    (name = "games", worker = .games),
    (name = "d1", worker = .d1),
    (name = "areas", disk = (path = "/app/areas")),
    (name = "count", disk = (path = "/data", writable = true)),
    (name = "internet", network = (allow = ["public"], tlsOptions = (trustBrowserCas = true))),
  ],
  sockets = [(name = "http", address = "*:8787", http = (), service = "files")],
);

# Stands in for the static files layer of Cloudflare.
const files :Workerd.Worker = (
  modules = [(name = "files.js", esModule = embed "files.js")],
  compatibilityDate = "2026-10-01",
  bindings = [
    (name = "API", service = "games"),
    (name = "FILES", service = "areas"),
  ],
);

# The same src/index.js that runs on Cloudflare. The count of Jev calls and the game log live in /data.
const games :Workerd.Worker = (
  modules = [(name = "index.js", esModule = embed "index.js")],
  compatibilityDate = "2026-10-01",
  bindings = [
    (name = "JEV_COUNT", durableObjectNamespace = "JevCount"),
    (name = "TYPESAFE_API_KEY", fromEnvironment = "TYPESAFE_API_KEY"),
    (name = "DAILY_CAP", fromEnvironment = "DAILY_CAP"),
    # The D1 API of workerd, the same one that Cloudflare gives the Worker, over the stand-in d1.js.
    (name = "LOG", wrapped = (moduleName = "cloudflare-internal:d1-api", innerBindings = [(name = "fetcher", service = "d1")])),
  ],
  durableObjectNamespaces = [(className = "JevCount", uniqueKey = "games-jev-count", enableSql = true)],
  durableObjectStorage = (localDisk = "count"),
  globalOutbound = "internet",
);

# Stands in for D1: the game log, in a SQLite file in /data (issue #12).
const d1 :Workerd.Worker = (
  modules = [
    (name = "d1.js", esModule = embed "d1.js"),
    (name = "0001_log_lines.sql", text = embed "migrations/0001_log_lines.sql"),
  ],
  compatibilityDate = "2026-10-01",
  bindings = [(name = "DB", durableObjectNamespace = "Database")],
  durableObjectNamespaces = [(className = "Database", uniqueKey = "games-log", enableSql = true)],
  durableObjectStorage = (localDisk = "count"),
);

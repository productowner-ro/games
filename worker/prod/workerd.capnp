# The prod stage: the games Worker on workerd, the open-source Workers runtime.
# The Dockerfile copies this file to /app; the paths below are paths in the image.
using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "files", worker = .files),
    (name = "games", worker = .games),
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

# The same src/index.js that runs on Cloudflare. The count of Jev calls lives in /data.
const games :Workerd.Worker = (
  modules = [(name = "index.js", esModule = embed "index.js")],
  compatibilityDate = "2026-10-01",
  bindings = [
    (name = "JEV_COUNT", durableObjectNamespace = "JevCount"),
    (name = "TYPESAFE_API_KEY", fromEnvironment = "TYPESAFE_API_KEY"),
    (name = "DAILY_CAP", fromEnvironment = "DAILY_CAP"),
  ],
  durableObjectNamespaces = [(className = "JevCount", uniqueKey = "games-jev-count", enableSql = true)],
  durableObjectStorage = (localDisk = "count"),
  globalOutbound = "internet",
);

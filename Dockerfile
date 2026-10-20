# The Worker of games.productowner.ro in Docker.
# dev: wrangler dev on the mounted repo; it reloads on each save. Run it with `docker compose up dev`.
# prod: the same Worker on workerd, with the files baked in. Run it with `docker compose up prod`.
FROM node:22-bookworm AS dev
WORKDIR /repo/worker
COPY worker/package.json worker/package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund --loglevel=error
# wrangler reads TYPESAFE_API_KEY from the environment of the container, not from a file.
ENV CLOUDFLARE_INCLUDE_PROCESS_ENV=true \
    WRANGLER_SEND_METRICS=false
EXPOSE 8787
# wrangler dev does not create the tables of migrations/ in the local D1: apply them first.
CMD npx wrangler d1 migrations apply games-log --local && exec npx wrangler dev --ip 0.0.0.0 --port 8787

# The files of areas/ that the site serves: the patterns of areas/.assetsignore go, as on Cloudflare.
FROM debian:bookworm-slim AS files
COPY areas /app/areas
WORKDIR /app/areas
RUN grep -v -e '^#' -e '^$' .assetsignore | while read -r pat; do \
      case "$pat" in */*) find . -path "./$pat" -delete ;; *) find . -name "$pat" -delete ;; esac; \
    done && rm .assetsignore

FROM debian:bookworm-slim AS prod
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=dev /repo/worker/node_modules/@cloudflare/workerd-linux-*/bin/workerd /usr/local/bin/workerd
COPY --from=files /app/areas /app/areas
COPY worker/prod/workerd.capnp worker/prod/files.js worker/prod/d1.js worker/src/index.js /app/
COPY worker/migrations /app/migrations
# The count of Jev calls and the game log: mount a volume here, so they survive a restart.
RUN mkdir /data
EXPOSE 8787
# --experimental: workerd marks the storage of a Durable Object on local disk as experimental.
CMD ["workerd", "serve", "--experimental", "/app/workerd.capnp"]

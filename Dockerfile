# The Worker of games.productowner.ro in Docker.
# dev: wrangler dev on the mounted repo; it reloads on each save. Run it with `docker compose up dev`.
FROM node:22-bookworm AS dev
WORKDIR /repo/worker
COPY worker/package.json worker/package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund --loglevel=error
# wrangler reads TYPESAFE_API_KEY from the environment of the container, not from a file.
ENV CLOUDFLARE_INCLUDE_PROCESS_ENV=true \
    WRANGLER_SEND_METRICS=false
EXPOSE 8787
CMD ["npx", "wrangler", "dev", "--ip", "0.0.0.0", "--port", "8787"]

# Deno version is shared by the build and runtime stages.
ARG DENO_VERSION=2.9.6

FROM denoland/deno:${DENO_VERSION} AS dependencies

ENV DENO_DIR=/deno-dir \
    DENO_NO_UPDATE_CHECK=1
WORKDIR /app

COPY deno.json deno.lock ./
COPY src ./src
COPY docker ./docker

# Fail if the checked-in lockfile does not match the dependencies.
RUN deno cache --frozen src/main.ts src/db/migrate.ts docker/healthcheck.ts

FROM denoland/deno:${DENO_VERSION} AS runtime

ENV DENO_DIR=/deno-dir \
    DENO_NO_UPDATE_CHECK=1 \
    HOST=0.0.0.0 \
    PORT=8000
WORKDIR /app

COPY --from=dependencies --chown=deno:deno /deno-dir /deno-dir
COPY --from=dependencies --chown=deno:deno /app /app
COPY --chown=deno:deno drizzle ./drizzle
COPY --chown=deno:deno public ./public

USER deno
EXPOSE 8000

# The official image's entrypoint runs this command through tini.
# Dependencies are downloaded at build time, never during startup.
CMD ["run", "--cached-only", "--frozen", "--allow-net", "--allow-env", "--allow-read", "src/main.ts"]

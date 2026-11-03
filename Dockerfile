FROM node:22-slim

# sqlite3 takes the nightly backups.
RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@12.16.1

WORKDIR /app
COPY . .
# The Technical details page shows this, because .git isn't copied in.
ARG GIT_COMMIT=
ENV GIT_COMMIT=$GIT_COMMIT
RUN pnpm install --frozen-lockfile && pnpm build

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 NUXT_DB_PATH=/data/pictures.db NUXT_PICTURES_DIR=/data
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", ".output/server/index.mjs"]

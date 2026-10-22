# syntax=docker/dockerfile:1
# TableMates API image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t tablemates-api .
# Base images are pinned by digest so builds are reproducible.

FROM node:26.12.0-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS build
WORKDIR /repo
RUN corepack enable
COPY . .
# Install only the API and its workspace dependencies, then copy the API with
# its production dependencies into /out.
RUN pnpm install --frozen-lockfile --filter @tablemates/api... \
 && pnpm --filter @tablemates/api deploy --prod --legacy /out

FROM node:26.12.0-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5
ENV NODE_ENV=production PORT=4000
# The API runs with plain node. Remove the bundled package managers, which are
# unused at runtime and carry their own advisories.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Run as the unprivileged "node" user that the base image provides.
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:4000/health || exit 1
# Migrations run as a separate step before a release: node --import tsx src/db/migrate.ts
CMD ["node", "--import", "tsx", "src/server.ts"]

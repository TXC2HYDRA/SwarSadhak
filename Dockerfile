# syntax=docker/dockerfile:1

FROM node:22.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY src ./src
COPY test ./test
RUN npm ci --ignore-scripts
RUN npm test
RUN npm run build

FROM node:22.19.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173
COPY --from=build /app/apps/web/dist ./dist
COPY server.mjs ./server.mjs
USER node
EXPOSE 4173
CMD ["node", "server.mjs"]

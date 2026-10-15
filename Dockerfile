# syntax=docker/dockerfile:1

FROM node:22.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY src ./src
COPY test ./test
RUN npm ci
RUN npm run build

FROM node:22.19.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
RUN npm ci --omit=dev
USER node
EXPOSE 4173
CMD ["npm", "run", "preview", "--workspace", "@swarsadhak/web"]

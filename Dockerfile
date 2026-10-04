FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY build.mjs ./
COPY apps ./apps
RUN npm run build
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY scripts/serve.mjs ./scripts/serve.mjs
ENV HOST=0.0.0.0 PORT=5174
EXPOSE 5174
CMD ["node", "scripts/serve.mjs"]

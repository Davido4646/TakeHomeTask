FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package.json
COPY tsconfig.json tsconfig.json
COPY tsconfig.app.json tsconfig.app.json
COPY vite.config.ts vite.config.ts
COPY index.html index.html
RUN npm install
COPY src ./src
RUN npm run build

FROM node:22-bookworm
WORKDIR /app
COPY package.json package.json
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 5173
CMD ["npm", "run", "preview"]

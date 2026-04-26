FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git docker.io \
  && rm -rf /var/lib/apt/lists/*

RUN curl -sSL https://railpack.com/install.sh | sh -s -- --bin-dir /usr/local/bin

WORKDIR /app
COPY package.json package.json
COPY tsconfig.json tsconfig.json
RUN npm install
COPY src ./src
RUN npm run build

EXPOSE 4000
CMD ["npm", "start"]


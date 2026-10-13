FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV HELIX_DEPLOYMENT_SANDBOX=container
ENV HELIX_NETWORK_POLICY=deny
ENV HELIX_FILESYSTEM_POLICY=isolated
ENV HELIX_RAW_KEYS_DENIED=true
ENV HELIX_PRIVILEGE_RESTRICTED=true

RUN useradd --create-home --uid 10001 helix
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY . .
RUN chown -R helix:helix /app
USER 10001:10001

ENTRYPOINT ["node", "--experimental-permission", "--disable-proto=throw", "scripts/start-worker.mjs"]

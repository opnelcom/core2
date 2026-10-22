FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY server.js config.js healthcheck.js ./
EXPOSE 3000
CMD ["node","server.js"]

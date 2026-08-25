FROM node:20-alpine
WORKDIR /app
COPY package.json server.js healthcheck.js ./
RUN npm install --omit=dev
ENV PORT=3000 CONTENT_ROOT=/app/content
EXPOSE 3000
CMD ["node","server.js"]

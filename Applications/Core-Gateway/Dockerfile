FROM node:20-alpine
WORKDIR /app
COPY package.json server.js ./
ENV PORT=3000 HTTPS_PORT=3443 CONTENT_ROOT=/app/content
EXPOSE 3000 3443
CMD ["node","server.js"]

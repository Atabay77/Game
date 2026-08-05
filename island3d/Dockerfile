# Issız Ada 3B — herhangi bir konteyner sağlayıcısında (Fly.io, Railway, Render…) çalışır
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/index.js"]

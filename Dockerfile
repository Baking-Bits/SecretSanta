FROM node:18-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production --no-audit --no-fund

# Copy app
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node","server.js"]

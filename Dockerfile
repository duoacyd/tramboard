FROM node:24-alpine

WORKDIR /app

# install dependencies first so layer is cached separately from source
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# non-root user for security
RUN addgroup -S tram && adduser -S tram -G tram
USER tram

CMD ["node", "index.js"]
# backend/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Copy and make entrypoint script executable
COPY db/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN apk add --no-cache postgresql-client

EXPOSE 5000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "./app/app.js"]

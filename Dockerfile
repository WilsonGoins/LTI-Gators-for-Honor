FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better Docker cache)
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

EXPOSE 3001

CMD ["node", "src/app.js"]

# Start from the Cloudflare sandbox base image
FROM docker.io/cloudflare/sandbox:0.6.2

# Install Node.js
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY sandbox/package*.json ./
RUN npm ci --omit=dev

# Copy server code
COPY sandbox/*.js ./

# Required during local development to access exposed ports
EXPOSE 8080

# Run WebSocket server
CMD ["node", "server.js"]

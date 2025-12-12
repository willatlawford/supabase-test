# Start from the Cloudflare sandbox base image
FROM docker.io/cloudflare/sandbox:0.6.5

# Install Node.js
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create app directory in workspace (sandbox working directory)
WORKDIR /workspace

# Copy package files and install dependencies
COPY sandbox/package*.json ./
RUN npm ci --omit=dev

# Agent script is injected at runtime via sandbox.writeFile()
# No CMD - scripts are run via startProcess() from the worker

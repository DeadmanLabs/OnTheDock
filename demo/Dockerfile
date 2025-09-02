FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy library dist (built externally)
COPY ../packages/docker-control/dist ./node_modules/@org/docker-control/dist/

# Copy demo files
COPY . .

# Expose port
EXPOSE 3001

# Start the demo server
CMD ["node", "library-demo.js"]
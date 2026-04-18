# Use a Node.js version that meets Vite 8's requirements (>= 22.12.0)
FROM node:22.14.0-bookworm

WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY package.json ./
COPY website/package.json ./website/
COPY server/package.json ./server/

# Install dependencies explicitly for each part to ensure native bindings match Linux
RUN cd website && npm install --include=optional
RUN cd server && npm install
RUN npm install

# Copy the entire project code
COPY . .

# Build the website
RUN cd website && npm run build

# Port setup (Railway provides PORT environment variable)
EXPOSE 3000

# Start the server using the root start script
CMD ["npm", "start"]

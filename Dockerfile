# Use a Node.js version that meets Vite 8's requirements (>= 22.12.0)
FROM node:22.14.0-bookworm

WORKDIR /app

# Copy root package files
COPY package.json ./

# Copy the entire project
COPY . .

# Clean up any existing node_modules or lockfiles to avoid architecture mismatches
RUN rm -rf node_modules website/node_modules server/node_modules package-lock.json website/package-lock.json server/package-lock.json

# Install dependencies for all parts of the app
# The root install script handles subdirectories: "cd website && npm install && cd ../server && npm install"
RUN npm install

# Build the website
RUN cd website && npm run build

# Expose the port the server runs on (adjust if different)
EXPOSE 3000

# Start the server
CMD ["npm", "start"]

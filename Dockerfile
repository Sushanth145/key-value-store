# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory in container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files into container
COPY . .

# Set environment variables (if needed)
ENV PORT=3000

# Expose the port for the container
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]

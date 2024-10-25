# Start from Node.js 20 based on Alpine Linux
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to install dependencies first
COPY package*.json ./

# Install application dependencies (with production flag for smaller image)
RUN npm install --production

# Copy the rest of your application code
COPY . .

# Expose the port that the app listens on
EXPOSE 3000

# Start the Node.js application with memory limits
CMD ["node", "--max-old-space-size=16384", "app.js"]

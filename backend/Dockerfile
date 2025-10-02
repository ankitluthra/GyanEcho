# Use official Node image
FROM node:20-alpine

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy all backend files
COPY . .

EXPOSE 4000
CMD ["node", "server.js"]

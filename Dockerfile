FROM node:16-alpine

# Install dependencies termasuk git
RUN apk add --no-cache \
    git \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    python3 \
    make \
    g++

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm install --production --legacy-peer-deps

# Bundle app source
COPY . .

# Create auth directory
RUN mkdir -p auth_info_baileys

# Environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Port (if needed)
EXPOSE 8080

# Start command
CMD ["npm", "start"]

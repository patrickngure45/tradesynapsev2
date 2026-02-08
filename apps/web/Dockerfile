# Use Node.js LTS
FROM node:22-alpine

WORKDIR /app

# Copy dependency definitions
COPY package.json package-lock.json* ./

# Install dependencies (installing all including devDeps so tsx is available)
# If you want to optimize image size later, move tsx to dependencies or use multi-stage build
RUN npm install

# Copy source code
COPY . .

# Build the Next.js application
# Note: If your build process relies on environment variables (NEXT_PUBLIC_...), 
# you should pass them as build args or ensuring .env exists.
RUN npm run build

# Expose the listening port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3000

# Make entrypoint executable
RUN chmod +x scripts/entrypoint.sh

# Start using the entrypoint script
CMD ["/bin/sh", "scripts/entrypoint.sh"]

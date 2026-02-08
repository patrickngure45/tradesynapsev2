# Use Node.js LTS
FROM node:22-alpine

# Set working directory to the container root
WORKDIR /app

# Copy the specific app and the shared db folder
# We do this to preserve the relative paths (../../../db/migrations) needed by the migration script
COPY apps/web ./apps/web
COPY db ./db

# Change context to the web app
WORKDIR /app/apps/web

# Install dependencies
RUN npm install

# Build the application
RUN npm run build

# Make the entrypoint script executable
RUN chmod +x scripts/entrypoint.sh

# Expose the listening port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3000

# Start using the entrypoint script
CMD ["/bin/sh", "scripts/entrypoint.sh"]
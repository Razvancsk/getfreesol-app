#!/bin/bash

# Build script for deployment
echo "Building application for production..."

# Build the frontend with Vite
echo "Building frontend..."
vite build

# Copy built files to server directory where serveStatic expects them
echo "Copying built files to server/public..."
cp -r dist/public server/

# Build the backend with esbuild
echo "Building backend..."
esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

echo "Build completed successfully!"
echo "Frontend files available at: server/public/"
echo "Backend bundle available at: dist/index.js"
# Proxy Server Setup for Production

## Problem
The proxy server isn't working because `VITE_PROXY_SERVER` is being set to `http://localhost:8090` during the Docker build, which won't work from the browser on a remote server.

## Solution

When building and deploying on the remote server, you need to build the Docker image with the correct build argument.

### For Manual Docker Run Commands

**IMPORTANT:** `VITE_PROXY_SERVER` must be set during Docker BUILD (as a build argument), NOT at runtime. It gets baked into the JavaScript bundle.

Rebuild the Jumble image with the correct proxy URL:

```bash
# Build with the correct proxy URL (baked into the JS bundle)
# Users access via https://jumble.imwald.eu, so proxy must be HTTPS too
docker build \
  --build-arg VITE_PROXY_SERVER=https://jumble.imwald.eu:8090 \
  -t silberengel/imwald-jumble:12 \
  .

# Then push to Docker Hub
docker push silberengel/imwald-jumble:12

# Then on the remote server, pull and restart:
docker stop imwald-jumble
docker rm imwald-jumble
docker pull silberengel/imwald-jumble:12

# Run with the same command (NO env vars needed for proxy - it's already in the bundle)
docker run -d \
  --name imwald-jumble \
  --network jumble-network \
  -p 0.0.0.0:32768:80 \
  --restart unless-stopped \
  silberengel/imwald-jumble:12
```

**Note on Docker Network:**

You only need to create the network once (it persists). Check if it exists first:

```bash
# Check if network exists
docker network ls | grep jumble-network

# If it doesn't exist, create it (only needed once)
docker network create jumble-network
```

### For Docker Compose

### 1. Set Environment Variables Before Building

```bash
export JUMBLE_PROXY_SERVER_URL="https://jumble.imwald.eu:8090"
export JUMBLE_SOCIAL_URL="https://jumble.imwald.eu"
```

### 2. Rebuild the Docker Image

```bash
docker-compose build --no-cache
```

### 3. Restart the Containers

```bash
docker-compose down
docker-compose up -d
```

## How to Check if it's Working

1. After deploying, open the browser console on `https://jumble.imwald.eu`
2. Navigate to a page with a URL that should show OpenGraph data
3. Look for `[WebService]` log messages that will show:
   - Whether the proxy server is configured
   - What URL is being used to fetch metadata
   - Any errors (CORS, network, etc.)

## Update Proxy Server's ALLOW_ORIGIN

Since users access via `https://jumble.imwald.eu`, you need to update the proxy server's `ALLOW_ORIGIN`:

```bash
# Stop the proxy container
docker stop imwald-jumble-proxy
docker rm imwald-jumble-proxy

# Restart with correct ALLOW_ORIGIN (must match how users access the frontend)
docker run -d \
  --name imwald-jumble-proxy \
  --network jumble-network \
  -p 0.0.0.0:8090:8080 \
  -e ALLOW_ORIGIN=https://jumble.imwald.eu \
  -e ENABLE_PPROF=true \
  --restart unless-stopped \
  ghcr.io/danvergara/jumble-proxy-server:latest
```

## Important Notes

- The `VITE_PROXY_SERVER` value is baked into the JavaScript bundle during build time
- You MUST rebuild the Docker image if you change `VITE_PROXY_SERVER`
- The proxy server's `ALLOW_ORIGIN` must match the frontend URL users access (`https://jumble.imwald.eu`)
- Both must use the same protocol (http vs https)
- If the proxy is accessed via HTTPS on port 8090, make sure HTTPS is configured for that port

## Troubleshooting

If you see errors in the console:
- `[WebService] No proxy server configured` - `VITE_PROXY_SERVER` is undefined or empty
- `[WebService] CORS/Network error` - The proxy URL might be wrong, or CORS isn't configured
- `[WebService] Failed to fetch metadata` - The proxy server might not be running or accessible


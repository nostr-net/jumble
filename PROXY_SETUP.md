# Proxy Server Setup for Production

## Problem
The proxy server isn't working because `VITE_PROXY_SERVER` is being set to `http://localhost:8090` during the Docker build, which won't work from the browser on a remote server.

## Solution

When building and deploying on the remote server, you need to build the Docker image with the correct build argument.

### For Manual Docker Run Commands

Rebuild the Jumble image with the correct proxy URL:

```bash
docker build \
  --build-arg VITE_PROXY_SERVER=http://jumble.imwald.eu:8090 \
  -t silberengel/imwald-jumble:12 \
  .

# Then push to Docker Hub
docker push silberengel/imwald-jumble:12
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
export JUMBLE_PROXY_SERVER_URL="http://jumble.imwald.eu:8090"
export JUMBLE_SOCIAL_URL="http://jumble.imwald.eu:32768"
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

## Important Notes

- The `VITE_PROXY_SERVER` value is baked into the JavaScript bundle during build time
- You MUST rebuild the Docker image if you change `JUMBLE_PROXY_SERVER_URL`
- The proxy server's `ALLOW_ORIGIN` must match the frontend URL (`JUMBLE_SOCIAL_URL`)
- Both must use the same protocol (http vs https)

## Troubleshooting

If you see errors in the console:
- `[WebService] No proxy server configured` - `VITE_PROXY_SERVER` is undefined or empty
- `[WebService] CORS/Network error` - The proxy URL might be wrong, or CORS isn't configured
- `[WebService] Failed to fetch metadata` - The proxy server might not be running or accessible


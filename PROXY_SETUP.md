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
# 
# IMPORTANT: Since users access via HTTPS (https://jumble.imwald.eu), 
# the proxy URL MUST also use HTTPS or browsers will block it (mixed content).
#
# You have two options:
#
# Option 1: Configure HTTPS for port 8090 (requires SSL certificate)
# docker build --build-arg VITE_PROXY_SERVER=https://jumble.imwald.eu:8090 ...
#
# Option 2: Route proxy through your reverse proxy (recommended if you have nginx/Apache)
# Configure reverse proxy to route /proxy/* to http://localhost:8090/
# The code constructs: ${proxyServer}/sites/${encodeURIComponent(url)}
# So /proxy/sites/... is forwarded to http://localhost:8090/sites/...
# Then use: https://jumble.imwald.eu/proxy
#
# Using Option 2 (recommended - route through Apache reverse proxy):
docker build \
  --build-arg VITE_PROXY_SERVER=https://jumble.imwald.eu/proxy \
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
# Use the reverse proxy route if you've configured Apache/nginx
export JUMBLE_PROXY_SERVER_URL="https://jumble.imwald.eu/proxy"
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

## HTTPS Certificate Setup for Port 8090

Since users access via `https://jumble.imwald.eu`, you need HTTPS for the proxy to avoid mixed content errors.

**Option A: SSL Certificate for Port 8090**

If you want to access the proxy directly on port 8090 with HTTPS, you'll need an SSL certificate:

```bash
# Using Let's Encrypt with certbot
certbot certonly --standalone -d jumble.imwald.eu --expand

# Then configure your reverse proxy or the proxy server itself to use the certificate
# The exact steps depend on your setup (nginx, Apache, or direct in the proxy container)
```

**Option B: Route Through Reverse Proxy (Recommended)**

If you already have a reverse proxy (nginx/Apache) handling HTTPS for `jumble.imwald.eu`, route the proxy through it:

### Apache Reverse Proxy Setup

1. **Enable required Apache modules:**
```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod rewrite
sudo a2enmod headers
sudo systemctl restart apache2
```

2. **Add reverse proxy configuration to your Apache virtual host** (typically in `/etc/apache2/sites-available/jumble.imwald.eu-le-ssl.conf` or similar):

```apache
<IfModule mod_ssl.c>
<VirtualHost 217.154.126.125:443>
    ServerName jumble.imwald.eu
    ServerAlias www.jumble.imwald.eu
    
    # Reverse Proxy Configuration
    ProxyPreserveHost On
    
    # Proxy for the jumble-proxy-server (must come BEFORE the catch-all / rule)
    # The code constructs: ${proxyServer}/sites/${encodeURIComponent(url)}
    # So /proxy/sites/... needs to be forwarded to http://127.0.0.1:8090/sites/...
    ProxyPass /proxy/ http://127.0.0.1:8090/
    ProxyPassReverse /proxy/ http://127.0.0.1:8090/
    
    # Reverse Proxy for the main Jumble app
    ProxyPass / http://127.0.0.1:32768/
    ProxyPassReverse / http://127.0.0.1:32768/
    
    # Headers for proper proxying
    Header always set X-Forwarded-Proto https
    Header always set X-Forwarded-Port 443

Include /etc/letsencrypt/options-ssl-apache.conf
SSLCertificateFile /etc/letsencrypt/live/jumble.imwald.eu/fullchain.pem
SSLCertificateKeyFile /etc/letsencrypt/live/jumble.imwald.eu/privkey.pem
</VirtualHost>
</IfModule>
```

**Important:** The code constructs URLs like `https://jumble.imwald.eu/proxy/sites/https%3A%2F%2Fexample.com`. Apache receives `/proxy/sites/https%3A%2F%2Fexample.com` and forwards it to `http://127.0.0.1:8090/sites/https%3A%2F%2Fexample.com` (strips `/proxy` prefix).

3. **Enable the site (if not already enabled):**
```bash
sudo a2ensite jumble.imwald.eu-le-ssl.conf
```

4. **Reload Apache:**
```bash
sudo apache2ctl configtest  # Check for errors first
sudo systemctl reload apache2
```

5. **Test the proxy route:**
```bash
# Test with a real URL - the code constructs /proxy/sites/{encoded-url}
curl -I https://jumble.imwald.eu/proxy/sites/https%3A%2F%2Fexample.com
# Should return 200 OK if working correctly
```

6. **Build with the proxy URL:**
```bash
docker build \
  --build-arg VITE_PROXY_SERVER=https://jumble.imwald.eu/proxy \
  -t silberengel/imwald-jumble:12 \
  .
```

**Note:** The proxy URL in `VITE_PROXY_SERVER` should be `https://jumble.imwald.eu/proxy` (without trailing slash), and the code will append `/sites/...` automatically.

## Important Notes

- The `VITE_PROXY_SERVER` value is baked into the JavaScript bundle during build time
- You MUST rebuild the Docker image if you change `VITE_PROXY_SERVER`
- The proxy server's `ALLOW_ORIGIN` must match the frontend URL users access (`https://jumble.imwald.eu`)
- Mixed content: HTTPS pages cannot load HTTP resources - both must use HTTPS
- If using direct port access (8090), you need an SSL certificate for that port

## Troubleshooting

If you see errors in the console:
- `[WebService] No proxy server configured` - `VITE_PROXY_SERVER` is undefined or empty
- `[WebService] CORS/Network error` - The proxy URL might be wrong, or CORS isn't configured
- `[WebService] Failed to fetch metadata` - The proxy server might not be running or accessible


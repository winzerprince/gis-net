#!/bin/sh
# ==================================================
# Docker entrypoint script for GIS-NET frontend
# Injects runtime environment variables into React build
# ==================================================

set -e

# Replace environment variables in JavaScript files
# This allows runtime configuration without rebuilding the image
if [ "$NODE_ENV" = "production" ]; then
    echo "Injecting runtime environment variables..."
    
    # Create env-config.js with runtime variables
    cat > /usr/share/nginx/html/env-config.js << EOF
window.ENV = {
  REACT_APP_API_URL: '${REACT_APP_API_URL:-/api}',
  REACT_APP_SOCKET_URL: '${REACT_APP_SOCKET_URL:-}',
  REACT_APP_DEFAULT_LAT: '${REACT_APP_DEFAULT_LAT:-40.7128}',
  REACT_APP_DEFAULT_LNG: '${REACT_APP_DEFAULT_LNG:--74.0060}',
  REACT_APP_MAP_TILE_URL: '${REACT_APP_MAP_TILE_URL:-https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png}',
  REACT_APP_NOMINATIM_BASE_URL: '${REACT_APP_NOMINATIM_BASE_URL:-https://nominatim.openstreetmap.org}'
};
EOF
fi

# Start Nginx
echo "Starting Nginx..."
nginx -g "daemon off;"

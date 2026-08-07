#!/bin/sh
echo "Injecting runtime environment variables..."

cat <<EOF > /usr/share/nginx/html/assets/env.js
(function(window) {
  window.__env = window.__env || {};
  window.__env.apiUrl = '${API_PUBLIC_URL:-http://localhost:8787}';
})(this);
EOF
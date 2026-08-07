(function (window) {
  window.__env = window.__env || {};
  // Default fallback for local development without Docker
  window.__env.apiUrl = 'http://localhost:8787';
})(this);

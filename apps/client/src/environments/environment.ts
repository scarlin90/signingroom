export const environment = {
  production: false,
  // Safely check if 'window' exists before trying to access it
  apiUrl:
    typeof window !== 'undefined' && (window as any).__env?.apiUrl
      ? (window as any).__env.apiUrl
      : 'http://localhost:8787',
};

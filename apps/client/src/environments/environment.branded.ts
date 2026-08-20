export const environment = {
  production: false,
  configUrl: '/brand/branded-config.json',
  apiUrl:
    typeof window !== 'undefined' && (window as any).__env?.apiUrl
      ? (window as any).__env.apiUrl
      : 'http://localhost:8787',
};

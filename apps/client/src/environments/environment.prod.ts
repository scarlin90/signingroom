export const environment = {
  production: true,
  configUrl: '/brand/public-good-config.json',
  apiUrl:
    typeof window !== 'undefined' && (window as any).__env?.apiUrl
      ? (window as any).__env.apiUrl
      : 'https://api.signingroom.io',
};

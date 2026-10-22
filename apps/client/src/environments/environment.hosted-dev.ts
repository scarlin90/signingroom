export const environment = {
  production: false,
  configUrl: '/brand/public-good-config.json',
  apiUrl:
    typeof window !== 'undefined' && (window as any).__env?.apiUrl
      ? (window as any).__env.apiUrl
      : 'https://api-dev.signingroom.io',
};

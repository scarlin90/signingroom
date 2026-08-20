export const environment = {
  production: false,
  configUrl: '/brand/branded-config.json',
  apiUrl:
    typeof window !== 'undefined' && (window as any).__env?.apiUrl
      ? (window as any).__env.apiUrl
      : 'https://api-staging-branded.signingroom.io',
};

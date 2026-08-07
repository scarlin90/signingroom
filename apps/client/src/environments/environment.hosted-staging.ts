export const environment = {
  production: false,
  apiUrl:
    typeof window !== 'undefined' && (window as any).__env?.apiUrl
      ? (window as any).__env.apiUrl
      : 'https://api-staging.signingroom.io',
};

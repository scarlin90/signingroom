export interface BrandingConfig {
  whitelabel: boolean;
  useTradeMark: boolean;
  brandName: string;
  brandSuffix?: string;
  brandColorHex: string;
  tagline: string;
  subTagline: string;
  logoUrl: string;
  defaultRoomName: string;
  hideFooter: boolean;
  hideNetworkBadges: boolean;
}

export const DEFAULT_BRANDING_CONFIG: BrandingConfig = {
  whitelabel: false,
  useTradeMark: true,
  brandName: 'Signing Room®',
  brandSuffix: '.io',
  brandColorHex: '#10b981',
  tagline: 'The secure coordination layer for Bitcoin multisig ceremonies.',
  subTagline: 'Multi-Signature Consensus',
  logoUrl: '/brand/logo.svg',
  defaultRoomName: 'Signing Room',
  hideFooter: false,
  hideNetworkBadges: false,
};

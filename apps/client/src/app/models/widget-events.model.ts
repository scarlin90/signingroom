export type PrivacySection = 'transaction-overview' | 'transaction-proposal' | 'signers' | 'transaction-details';
export type PrivacyState = 'blurred' | 'reveal-all' | 'reveal-section' | 'hidden';

export interface ModalViewedPayload {
  modalName: string;
  context?: string;
}

export interface PrivacyToggledPayload {
  section: PrivacySection;
  state: PrivacyState;
}

export interface RoomRenamedPayload {
  newName: string;
}

export interface DataCopiedPayload {
  dataType: 'room-id' | 'session-id' | 'decryption-key' | 'admin-token' | 'share-link' | 'share-link-full' | 'final-hex';
}

export interface ParticipantLabelledPayload {
  target: 'self' | 'signer';
  label: string;
  fingerprint?: string;
}

export interface DownloadTriggeredPayload {
  fileType: 'audit-log' | 'csv' | 'unsigned-psbt' | 'qr-code-image';
}

export interface RoomStateChangedPayload {
  state: 'locked' | 'unlocked' | 'closed';
}

export interface QrStateChangedPayload {
  includesKey: boolean;
  isRevealed: boolean;
}
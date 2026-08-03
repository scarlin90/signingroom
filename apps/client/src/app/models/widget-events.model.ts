export interface BaseEventContext {
  roomId: string | null;
  sessionId: string | null;
  role: 'coordinator' | 'guest' | 'unknown';
  network: 'bitcoin' | 'testnet' | 'signet' | null;
  timestamp: number;
}

export interface RoomCreatedPayload {
  roomId: string;
  network: string;
}

export type PrivacySection =
  | 'transaction-overview'
  | 'transaction-proposal'
  | 'signers'
  | 'transaction-details';
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
  dataType:
    | 'room-id'
    | 'session-id'
    | 'decryption-key'
    | 'admin-token'
    | 'share-link'
    | 'share-link-full'
    | 'final-hex';
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

export interface FountainFormatChangedPayload {
  format: 'ur' | 'bbqr';
}

export interface FountainStateChangedPayload {
  isRevealed: boolean;
  format: 'ur' | 'bbqr';
}

export interface PsbtImportedPayload {
  method: 'scan' | 'upload';
}

export interface TransactionViewChangedPayload {
  view: 'inputs' | 'outputs';
}

export interface DestinationVerifiedPayload {
  type: 'input' | 'output';
  address: string | 'batch';
  isVerified: boolean;
}

export interface ParticipantPresencePayload extends BaseEventContext {
  action: 'joined' | 'left';
  participantId: string;
  participantRole: string; // 'coordinator' | 'guest'
  displayName?: string;
}

export interface SignatureReceivedPayload extends BaseEventContext {
  fingerprint: string;
  signerLabel?: string;
  signerSessionId?: string;
  signerName?: string;
}

export interface ParticipantLabelledPayload extends BaseEventContext {
  target: 'self' | 'participant' | 'signer';
  label: string;
  fingerprint?: string;
  participantId?: string;
}

export interface SecurityAlertPayload extends BaseEventContext {
  alertType: 'access_denied';
  severity: 'low' | 'medium' | 'high';
  message: string;
}

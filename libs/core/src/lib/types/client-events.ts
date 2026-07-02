export type RoomEventType =
  | 'ROOM_CONNECTED'
  | 'ROOM_DISCONNECTED'
  | 'ROOM_CREATED'
  | 'GUEST_JOINED'
  | 'PARTICIPANT_PRESENCE'
  | 'SIGNATURE_RECEIVED'
  | 'TRANSACTION_FINALIZED'
  | 'SECURITY_ALERT'
  | 'ERROR'
  | 'RAW_MESSAGE'
  | 'STATE_SYNC_DECRYPTED'
  | 'NEW_PARTIAL_DECRYPTED'
  | 'DECRYPTION_ERROR'
  | 'STATE_SYNC_DECRYPTED'
  | 'NEW_PARTIAL_DECRYPTED'
  | 'DECRYPTION_ERROR'
  | 'SESSION_CONNECTED'
  | 'ROLE_UPDATE'
  | 'ROOM_CLOSED'
  | 'LOCK_UPDATED'
  | 'PROTOCOL_ERROR'
  | 'LABELS_DECRYPTED'
  | 'ROOM_RENAMED_DECRYPTED'
  | 'LOG_UPDATE_DECRYPTED'
  | 'CONNECTIONS_DECRYPTED'
  | 'WHITELIST_DECRYPTED'
  | 'PARTICIPANTS_DECRYPTED'
  | 'TX_FINALIZED_DECRYPTED'
  | 'STATE_CHANGED';

export interface BaseEventContext {
  roomId: string | null;
  sessionId: string | null;
  role: 'coordinator' | 'guest' | 'unknown';
  network: 'mainnet' | 'testnet' | 'signet' | null;
  timestamp: number;
}

export interface RoomEvent {
  type: RoomEventType;
  action: string;
  context: BaseEventContext;
  payload: any;
}
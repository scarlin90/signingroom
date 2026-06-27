export type RoomEventType =
  | 'ROOM_CONNECTED'
  | 'ROOM_CREATED'
  | 'GUEST_JOINED'
  | 'PARTICIPANT_PRESENCE'
  | 'SIGNATURE_RECEIVED'
  | 'TRANSACTION_FINALIZED'
  | 'SECURITY_ALERT'
  | 'ERROR';

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
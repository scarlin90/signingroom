/**
 * Represents the exhaustive list of discrete event types emitted or consumed
 * during the lifecycle of a real-time collaborative cryptographic room.
 * Includes network connection status, participant activity, key negotiation, and decoupled decryption states.
 */
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

/**
 * Common environmental metadata attached to every room event.
 * Provides the localized context required to route, validate, or audit a payload.
 */
export interface BaseEventContext {
  /** Unique identifier of the specific room where the event originated, or null if out-of-room scope. */
  roomId: string | null;
  /** Unique session identifier mapping to the active client connection lifecycle. */
  sessionId: string | null;
  /** The localized administrative or access authorization tier of the event emitter. */
  role: 'coordinator' | 'guest' | 'unknown';
  /** The target cryptographic network context used to validate signatures and transactional states. */
  network: 'mainnet' | 'testnet' | 'signet' | null;
  /** High-precision Unix timestamp recorded at the exact moment the event payload was constructed. */
  timestamp: number;
}

/**
 * Universal envelope structuring all broadcasted or ingested message traffic.
 * Encapsulates standard network routing contexts alongside dynamic payloads.
 */
export interface RoomEvent {
  /** The strictly typed structural class of this event. */
  type: RoomEventType;
  /** Sub-action indicator or method string declaring the explicit operational path. */
  action: string;
  /** Contextual ambient metadata containing active environment configuration details. */
  context: BaseEventContext;
  /** Dynamic payload data structures specific to the designated event type. */
  payload: any;
}

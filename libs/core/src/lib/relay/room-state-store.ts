import { RoomEventBus } from '../events/room-event-bus';
import { PsbtUtils } from '../bitcoin/psbt-utils';


// -------------------------------------------------------------------------
// Interfaces
// -------------------------------------------------------------------------

export interface AuditEntry {
  timestamp: number;
  event: string;
  detail?: string;
  encryptedDetail?: string;
  user: string;
}

export interface RoomState {
  protocolVersion: string;
  roomId: string;
  roomName: string;
  network: 'bitcoin' | 'testnet' | 'signet';
  
  // Transaction Data
  psbt: string; 
  signatures: string[]; 
  finalTxHex?: string;
  finalTxId?: string;
  
  // Metadata
  connectedCount: number;
  createdAt: number;
  expiresAt: number;
  isLocked: boolean;
  
  // Governance
  auditLog: AuditEntry[];
  signerLabels: Record<string, string>; 
  whitelist: string[];
  participants?: Record<string, { id: string; role: string; encryptedDisplayName?: string; displayName?: string }>;
}

export class RoomStateStore {
  private state: RoomState | null = null;

  constructor(private events: RoomEventBus) {
    this.events.on('STATE_SYNC_DECRYPTED').subscribe(e => this.sync(e.payload));
    this.events.on('NEW_PARTIAL_DECRYPTED').subscribe(e => this.merge(e.payload));
    this.events.on('LOCK_UPDATED').subscribe(e => this.updatePartial({ isLocked: e.payload }));
    this.events.on('LABELS_DECRYPTED').subscribe(e => this.updatePartial({ signerLabels: e.payload }));
    this.events.on('ROOM_RENAMED_DECRYPTED').subscribe(e => this.updatePartial({ roomName: e.payload }));
    this.events.on('LOG_UPDATE_DECRYPTED').subscribe(e => this.updatePartial({ auditLog: e.payload }));
    this.events.on('WHITELIST_DECRYPTED').subscribe(e => this.updatePartial({ whitelist: e.payload }));
    this.events.on('PARTICIPANTS_DECRYPTED').subscribe(e => this.updatePartial({ participants: e.payload }));
    this.events.on('CONNECTIONS_DECRYPTED').subscribe(e => this.updatePartial({ connectedCount: e.payload.count }));
    this.events.on('TX_FINALIZED_DECRYPTED').subscribe(e => this.updatePartial({ 
        finalTxHex: e.payload.finalTxHex, 
        finalTxId: e.payload.finalTxId 
    }));
  }

  private updatePartial(partialState: Partial<RoomState>) {
      if (!this.state) return;
      this.state = { ...this.state, ...partialState };
      this.events.dispatch('STATE_CHANGED', this.state);
  }

  public getState(): RoomState | null { return this.state; }

  public init(roomId: string, protocolVersion: string) {
      this.state = {
        roomId, psbt: '', 
        signatures: [], 
        connectedCount: 0, 
        createdAt: Date.now(),
        expiresAt: Date.now() + 1200000, 
        auditLog: [], signerLabels: {}, 
        roomName: 'Signing Room', 
        whitelist: [], 
        participants: {},
        isLocked: false, network: 'bitcoin',
        protocolVersion: protocolVersion
      };
  }

  private sync(data: any) {
    this.state = { ...this.state, ...data };
    this.events.dispatch('STATE_CHANGED', this.state);
  }

  public update(updater: (s: RoomState | null) => RoomState | null) {
      this.state = updater(this.state);
      if (this.state) {
        this.events.dispatch('STATE_CHANGED', this.state);
    }
  }
  
  public set(newState: RoomState | null) {
      this.state = newState;
      if (newState) {
        this.events.dispatch('STATE_CHANGED', newState);
      }
  }

  private merge(payload: any) {
    if (!this.state) return;
    this.state = {
        ...this.state,
        psbt: PsbtUtils.merge(this.state.psbt, payload.decryptedPsbt),
        signatures: [...this.state.signatures, payload.decryptedPsbt]
    };
    this.events.dispatch('STATE_CHANGED', this.state);
  }
}
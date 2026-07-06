import { RoomEventBus } from '../events/room-event-bus';
import { PsbtUtils } from '../bitcoin/psbt-utils';

/**
 * Metadata record depicting a distinct action or operational step within the workspace.
 */
export interface AuditEntry {
  /** Unix millisecond epoch timestamp tracking execution entry runtime. */
  timestamp: number;
  /** Primary event identifier string description tag. */
  event: string;
  /** Unencrypted human-readable details about the audit operation if available. */
  detail?: string;
  /** Securely encrypted detail package payload string. */
  encryptedDetail?: string;
  /** Identity handle or role label indicating the operational participant actor. */
  user: string;
}

/**
 * Complete internal application memory representation of a collaborative signing chamber session.
 */
export interface RoomState {
  /** Semantic version string specifying structural validation expectations. */
  protocolVersion: string;
  /** The unique string tracking identifier for the session room space. */
  roomId: string;
  /** Descriptive name or structural text label assigned to the room workspace. */
  roomName: string;
  /** Blockchain execution context parameters constraint tag. */
  network: 'bitcoin' | 'testnet' | 'signet';
  /** The core partially signed bitcoin transaction matrix string. */
  psbt: string;
  /** A collection of individual cryptographic partial signatures collected from room members. */
  signatures: string[];
  /** The fully constructed, serialized network transaction payload string if finalized. */
  finalTxHex?: string;
  /** The resulting unique TXID string identifying the transaction payload on-chain. */
  finalTxId?: string;
  /** Live counter tracking active socket socket connection instances. */
  connectedCount: number;
  /** Unix millisecond timestamp pinpointing workspace initialization. */
  createdAt: number;
  /** Unix millisecond timestamp signaling workspace eviction criteria. */
  expiresAt: number;
  /** Flag restricting incoming user registrations or transaction state adjustments. */
  isLocked: boolean;
  /** Chronological ledger sequence caching actions performed inside the module environment. */
  auditLog: AuditEntry[];
  /** Cryptographic hardware key identifiers matched against human-readable custom aliases. */
  signerLabels: Record<string, string>;
  /** Explicit list containing authorized public access keys permitted inside the workspace. */
  whitelist: string[];
  /** Dictionary caching active participant entities tracked by unique public identifiers. */
  participants?: Record<
    string,
    { id: string; role: string; encryptedDisplayName?: string; displayName?: string }
  >;
}

/**
 * State container managing reactive read, write, initialization, and sync configurations
 * for live signature multi-sig sessions. Listens to specialized topic boundaries on the
 * global bus channel and updates data profiles seamlessly.
 */
export class RoomStateStore {
  /** The current active memory allocation tree layer mapping state metrics. */
  private state: RoomState | null = null;

  /**
   * Initializes state layout streams and establishes implicit event bus subscription handlers.
   * @param events - The central decoupled messaging interface system layer.
   */
  constructor(private events: RoomEventBus) {
    this.events.on('STATE_SYNC_DECRYPTED').subscribe((e) => this.sync(e.payload));
    this.events.on('NEW_PARTIAL_DECRYPTED').subscribe((e) => this.merge(e.payload));
    this.events.on('LOCK_UPDATED').subscribe((e) => {
      const isLocked = typeof e.payload?.isLocked === 'boolean' ? e.payload.isLocked : e.payload;
      this.updatePartial({ isLocked });
    });
    this.events
      .on('LABELS_DECRYPTED')
      .subscribe((e) => this.updatePartial({ signerLabels: e.payload }));
    this.events
      .on('ROOM_RENAMED_DECRYPTED')
      .subscribe((e) => this.updatePartial({ roomName: e.payload }));
    this.events
      .on('LOG_UPDATE_DECRYPTED')
      .subscribe((e) => this.updatePartial({ auditLog: e.payload }));
    this.events
      .on('WHITELIST_DECRYPTED')
      .subscribe((e) => this.updatePartial({ whitelist: e.payload }));
    this.events
      .on('PARTICIPANTS_DECRYPTED')
      .subscribe((e) => this.updatePartial({ participants: e.payload }));
    this.events
      .on('CONNECTIONS_DECRYPTED')
      .subscribe((e) => this.updatePartial({ connectedCount: e.payload.count }));
    this.events.on('TX_FINALIZED_DECRYPTED').subscribe((e) =>
      this.updatePartial({
        finalTxHex: e.payload.finalTxHex,
        finalTxId: e.payload.finalTxId,
      }),
    );
    this.events.on('UPDATE_LABEL').subscribe((e) => {
      const { fingerprint, label } = e.payload;
      this.updatePartial({
        signerLabels: {
          ...this.state?.signerLabels,
          [fingerprint]: label,
        },
      });
    });
  }

  /**
   * Mutates current state map attributes on-the-fly and broadcasts modification signals.
   * Short-circuits execution completely if the store has not been structurally initialized.
   * @param partialState - An object mapping key properties to match against the schema structure.
   */
  private updatePartial(partialState: Partial<RoomState>) {
    if (!this.state) return;
    this.state = { ...this.state, ...partialState };
    this.events.dispatch('STATE_CHANGED', this.state);
  }

  /**
   * Returns a synchronous snapshot of the active memory allocation reference structure.
   * @returns The active RoomState model blueprint or null if unallocated.
   */
  public getState(): RoomState | null {
    return this.state;
  }

  /**
   * Allocates a baseline structural template mapping zeroed default attributes for a session.
   * * @param roomId - The unique tracking identifier mapping space boundary scopes.
   * @param protocolVersion - Semantic version string targeting execution profiles.
   */
  public init(roomId: string, protocolVersion: string) {
    this.state = {
      roomId,
      psbt: '',
      signatures: [],
      connectedCount: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + 1200000,
      auditLog: [],
      signerLabels: {},
      roomName: 'Signing Room',
      whitelist: [],
      participants: {},
      isLocked: false,
      network: 'bitcoin',
      protocolVersion: protocolVersion,
    };
    this.events.dispatch('STATE_CHANGED', this.state);
  }

  /**
   * Replaces existing state structures wholesale by executing deep assignment merges.
   * @param data - The raw model mapping representation extracted from a socket stream line.
   */
  private sync(data: any) {
    this.state = { ...this.state, ...data };
    this.events.dispatch('STATE_CHANGED', this.state);
  }

  /**
   * Higher-order transformation function executing functional updates safely.
   * @param updater - A mutation callback function mapping state maps to newly evaluated profiles.
   */
  public update(updater: (s: RoomState | null) => RoomState | null) {
    this.state = updater(this.state);
    if (this.state) {
      this.events.dispatch('STATE_CHANGED', this.state);
    }
  }

  /**
   * Directly overrides the state tracking allocation profile with an explicit input target.
   * @param newState - The new complete model configuration or null to wipe clean.
   */
  public set(newState: RoomState | null) {
    this.state = newState;
    if (newState) {
      this.events.dispatch('STATE_CHANGED', newState);
    }
  }

  /**
   * Combines incoming partial transactional details into current active signature layers.
   * Leverages structural PsbtUtils helpers to reconcile divergent hex paths.
   * @param payload - Data configuration structures tracking network signature details.
   */
  private merge(payload: any) {
    if (!this.state) return;
    this.state = {
      ...this.state,
      psbt: PsbtUtils.merge(this.state.psbt, payload.decryptedPsbt),
      signatures: [...this.state.signatures, payload.decryptedPsbt],
    };
    this.events.dispatch('STATE_CHANGED', this.state);
  }
}

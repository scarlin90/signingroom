import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { RoomEventType, RoomEvent, BaseEventContext } from './types/client-events';

export interface ClientConfig {
  relayEndpoint: string;
  network: 'mainnet' | 'testnet' | 'signet';
}

export class SigningRoomClient {
  private config: ClientConfig;
  private eventSubject = new Subject<RoomEvent>();

  // Tracks stateless, internal running session metrics dynamically
  private currentRoomId: string | null = null;
  private currentSessionId: string | null = null;
  private isCoordinatorRole = false;

  constructor(config: ClientConfig) {
    this.config = config;
  }

  /**
   * Safe, runtime check to evaluate if code is executing inside an iframe boundary
   */
  public get isEmbedded(): boolean {
    try {
      return typeof window !== 'undefined' && window !== window.top;
    } catch (e) {
      return true;
    }
  }

  /**
   * Sets runtime context dynamically as the stateless relay changes states
   */
  public updateSessionContext(roomId: string | null, sessionId: string | null, isCoordinator: boolean): void {
    this.currentRoomId = roomId;
    this.currentSessionId = sessionId;
    this.isCoordinatorRole = isCoordinator;
  }

  /**
   * Resolves the real-time cryptographic metadata baseline for regulatory tracking
   */
  private getBaseContext(): BaseEventContext {
    return {
      roomId: this.currentRoomId,
      sessionId: this.currentSessionId,
      role: this.isCoordinatorRole ? 'coordinator' : (this.currentRoomId ? 'guest' : 'unknown'),
      network: this.config.network,
      timestamp: Date.now()
    };
  }

  /**
   * Core execution pipeline: fires internal RxJS hooks AND safe boundary postMessages
   */
  public emitEvent(type: RoomEventType, action: string, payload: any): void {
    const context = this.getBaseContext();
    const enrichedEvent: RoomEvent = {
      type,
      action,
      context,
      payload
    };

    // 1. Dispatch to local software subscribers (e.g., Angular App or Node Agents)
    this.eventSubject.next(enrichedEvent);

    // 2. Dispatch across parent execution window for IFRAME integrators
    if (this.isEmbedded && typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage({
        type: 'SIGNING_ROOM_EVENT',
        action: action,
        payload: {
          ...context,
          ...payload
        }
      }, '*'); // Targeted origin can be tightened per installation parameter
    }
  }

  /**
   * RxJS Hook to subscribe to a specific subset of workspace events
   */
  public on(type: RoomEventType): Observable<RoomEvent> {
    return this.eventSubject.asObservable().pipe(filter(e => e.type === type));
  }

  /**
   * RxJS Hook to subscribe to ALL infrastructure signals (Critical for Audit Logs)
   */
  public onAll(): Observable<RoomEvent> {
    return this.eventSubject.asObservable();
  }

  // --- SAMPLE IMPLEMENTATION PIPELINES (To be mapped to future logic) ---

  public dispatchSignatureReceived(data: { fingerprint: string; label?: string; sessionId?: string; name?: string }): void {
    this.emitEvent('SIGNATURE_RECEIVED', 'signatureReceived', data);
  }

  public dispatchSecurityAlert(alertType: string, severity: 'low' | 'medium' | 'high', message: string): void {
    this.emitEvent('SECURITY_ALERT', 'securityAlert', { alertType, severity, message });
  }

  public dispatchTransactionFinalized(data: { txId: string; txHex: string; auditPdfUri: string | null }): void {
    this.emitEvent('TRANSACTION_FINALIZED', 'transactionFinalized', data);
  }
}
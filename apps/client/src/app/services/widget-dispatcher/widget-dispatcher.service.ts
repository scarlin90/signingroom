import { Injectable } from '@angular/core';
import { SocketService } from '../socket/socket.service';
import { ModalViewedPayload, PrivacyToggledPayload, PrivacySection, PrivacyState, DataCopiedPayload, RoomRenamedPayload, ParticipantLabelledPayload, DownloadTriggeredPayload, RoomStateChangedPayload, QrStateChangedPayload, FountainFormatChangedPayload, PsbtImportedPayload, TransactionViewChangedPayload, BaseEventContext, SecurityAlertPayload } from '../../models/widget-events.model';

@Injectable({
  providedIn: 'root'
})
export class WidgetDispatcherService {

  constructor(private socket: SocketService) {}

  /**
   * Securely checks if the application is running inside an iframe.
   */
  public get isEmbedded(): boolean {
    try {
      return window !== window.top;
    } catch (e) {
      return true; 
    }
  }

  /**
   * Helper to return current state of room
   */
  private getBaseContext(): BaseEventContext {
    const state = this.socket.roomState();
    return {
      roomId: state?.roomId || null,
      sessionId: this.socket.currentSessionId() || null,
      role: this.socket.isCoordinator() ? 'coordinator' : (state ? 'guest' : 'unknown'),
      network: state?.network || null,
      timestamp: Date.now()
    };
  }
  
  /**
   * Core dispatcher that emits events to the parent window (signing room) with a consistent structure. All widget events should funnel through this method.
   */
  private dispatchEvent(action: string, payload: any): void {
    if (!this.isEmbedded) {
        return; 
    }

    if (window && window.parent) {

      const enrichedPayload = {
        ...this.getBaseContext(),
        ...payload
      };

      window.parent.postMessage({
        type: 'SIGNING_ROOM_EVENT',
        action: action,
        payload: enrichedPayload
      }, '*');
    }
  }

  // --- PRIVACY TOGGLES ---

  emitModalView(modalName: string, context?: string): void {
    const payload: ModalViewedPayload = { modalName, context };
    this.dispatchEvent('modalViewed', payload);
  }

  emitPrivacyToggle(section: PrivacySection, state: PrivacyState): void {
    const payload: PrivacyToggledPayload = { section, state };
    this.dispatchEvent('privacyToggled', payload);
  }

  // --- ROOM OVERVIEW & ACTIONS ---

  emitRoomRenamed(newName: string): void {
    const payload: RoomRenamedPayload = { newName };
    this.dispatchEvent('roomRenamed', payload);
  }

  emitDataCopied(dataType: DataCopiedPayload['dataType']): void {
    const payload: DataCopiedPayload = { dataType };
    this.dispatchEvent('dataCopied', payload);
  }

  emitDownloadTriggered(fileType: DownloadTriggeredPayload['fileType']): void {
    const payload: DownloadTriggeredPayload = { fileType };
    this.dispatchEvent('downloadTriggered', payload);
  }

  emitRoomStateChanged(state: RoomStateChangedPayload['state']): void {
    const payload: RoomStateChangedPayload = { state };
    this.dispatchEvent('roomStateChanged', payload);
  }

  emitQrStateChanged(includesKey: boolean, isRevealed: boolean): void {
    const payload: QrStateChangedPayload = { includesKey, isRevealed };
    this.dispatchEvent('qrStateChanged', payload);
  }

  // --- SIGNER ACTIONS & TRANSACTION DETAILS ---

  emitFountainFormatChanged(format: FountainFormatChangedPayload['format']): void {
    this.dispatchEvent('fountainFormatChanged', { format });
  }

  emitFountainStateChanged(isRevealed: boolean, format: string): void {
    this.dispatchEvent('fountainStateChanged', { isRevealed, format });
  }

  emitPsbtImported(method: PsbtImportedPayload['method']): void {
    this.dispatchEvent('psbtImported', { method });
  }

  emitTransactionViewChanged(view: TransactionViewChangedPayload['view']): void {
    this.dispatchEvent('transactionViewChanged', { view });
  }

  emitDestinationVerified(type: 'inputs' | 'outputs', address: string | 'batch', isVerified: boolean): void {
    this.dispatchEvent('destinationVerified', { type, address, isVerified });
  }

  emitRoomCreated(roomId: string, network: string): void {
    this.dispatchEvent('roomCreated', { roomId, network });
  }

  // --- TRANSACTION FINALIZATION ---
  emitTransactionFinalized(payload: { 
    txId: string; 
    txHex: string; 
    roomState: any; 
    auditLogCsv: string; 
    settlementCsv: string | undefined; 
    auditPdfUri: string | null;
  }): void {
    this.dispatchEvent('transactionFinalized', payload);
  }

  // --- PARTICIPANT PRESENCE ---
  emitParticipantPresence(
    action: 'joined' | 'left', 
    participantId: string, 
    participantRole: string, 
    displayName?: string
  ): void {
    this.dispatchEvent('participantPresence', { action, participantId, participantRole, displayName });
  }

  // --- SIGNATURES ---
  emitSignatureReceived(fingerprint: string, signerLabel?: string, signerSessionId?: string, signerName?: string): void {
    this.dispatchEvent('signatureReceived', { fingerprint, signerLabel, signerSessionId, signerName });
  }

  emitParticipantLabelled(
    target: 'self' | 'participant' | 'signer', 
    label: string, 
    fingerprint?: string, 
    participantId?: string
  ): void {
    this.dispatchEvent('participantLabelled', { target, label, fingerprint, participantId });
  }

  emitSecurityAlert(alertType: SecurityAlertPayload['alertType'], severity: SecurityAlertPayload['severity'], message: string): void {
    this.dispatchEvent('securityAlert', { alertType, severity, message });
  }
  
}
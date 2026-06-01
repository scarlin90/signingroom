import { Injectable } from '@angular/core';
import { ModalViewedPayload, PrivacyToggledPayload, PrivacySection, PrivacyState, DataCopiedPayload, RoomRenamedPayload, ParticipantLabelledPayload, DownloadTriggeredPayload, RoomStateChangedPayload, QrStateChangedPayload } from '../../models/widget-events.model';

@Injectable({
  providedIn: 'root'
})
export class WidgetDispatcherService {
  
  /**
   * Core dispatcher that emits events to the parent window (signing room) with a consistent structure. All widget events should funnel through this method.
   */
  private dispatchEvent(action: string, payload: any): void {
    if (window && window.parent) {
      window.parent.postMessage({
        type: 'SIGNING_ROOM_EVENT',
        action: action,
        payload: payload
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

  emitParticipantLabelled(target: 'self' | 'signer', label: string, fingerprint?: string): void {
    const payload: ParticipantLabelledPayload = { target, label, fingerprint };
    this.dispatchEvent('participantLabelled', payload);
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
}
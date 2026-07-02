import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

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
  | 'STATE_CHANGED'
  | 'TOGGLE_LOCK';

export interface RoomEvent {
  type: RoomEventType;
  payload?: any;
}

export class RoomEventBus {
  private eventsSubject = new Subject<RoomEvent>();

  // Internal method for the library to emit events to the apps
  public dispatch(type: RoomEventType, payload?: any): void {
    this.eventsSubject.next({ type, payload });
  }

  // External method for apps (like Angular) to subscribe to specific events
  public on(eventType: RoomEventType): Observable<RoomEvent> {
    return this.eventsSubject.asObservable().pipe(
      filter(event => event.type === eventType)
    );
  }

  // External method for apps to subscribe to ALL events (useful for your Audit Logs)
  public onAll(): Observable<RoomEvent> {
    return this.eventsSubject.asObservable();
  }
}
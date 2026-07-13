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
  | 'TOGGLE_LOCK'
  | 'UPDATE_LABEL'
  | 'THRESHOLD_MET';

/**
 * Represents an individual event emitted inside a live collaboration room session workspace.
 */
export interface RoomEvent {
  /** The distinct string identifier classifying the event category. */
  type: RoomEventType;
  /** Optional contextual payload structure matching the unique demands of the event type. */
  payload?: any;
}

/**
 * Central broker implementation providing decoupled RxJS-based reactive event lines.
 * Enables the library kernel to transparently dispatch signals to listening host platforms (such as Angular apps).
 */
export class RoomEventBus {
  /** Internal streaming subject piping incoming signals down active subscriber branches. */
  private eventsSubject = new Subject<RoomEvent>();

  /**
   * Publishes an event to the messaging bus layout, casting it to all current observers.
   * Typically used internally by the SDK module components.
   * * @param type - The exact event classifier tag.
   * @param payload - Optional extra metadata parameters associated with the operation scope.
   */
  public dispatch(type: RoomEventType, payload?: any): void {
    this.eventsSubject.next({ type, payload });
  }

  /**
   * Generates a reactive channel filtered down to an isolated event string type.
   * * @param eventType - The target event indicator to listen for.
   * @returns An RxJS Observable yielding exclusive target events.
   */
  public on(eventType: RoomEventType): Observable<RoomEvent> {
    return this.eventsSubject.asObservable().pipe(filter((event) => event.type === eventType));
  }

  /**
   * Generates an un-filtered event stream listening to every message running across the bus architecture.
   * Perfect for building centralized auditing engines, telemetry logs, or state synchronizers.
   * * @returns An RxJS Observable catching all events moving across the channel surface.
   */
  public onAll(): Observable<RoomEvent> {
    return this.eventsSubject.asObservable();
  }
}

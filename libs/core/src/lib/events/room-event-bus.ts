import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

export type RoomEventType = 
  | 'ROOM_CONNECTED' 
  | 'GUEST_JOINED' 
  | 'SIGNATURE_SYNCED' 
  | 'ROOM_DESTROYED'
  | 'ERROR';

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
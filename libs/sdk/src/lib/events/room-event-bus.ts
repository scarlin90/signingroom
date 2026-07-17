import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { RoomEvent, RoomEventType } from '../types/client-events';

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

import { describe, it, expect, beforeEach } from 'vitest';
import { RoomEventBus, RoomEvent } from './room-event-bus';

describe('RoomEventBus', () => {
  let eventBus: RoomEventBus;

  beforeEach(() => {
    eventBus = new RoomEventBus();
  });

  it('should successfully dispatch and receive events when subscribing to onAll()', () => {
    const receivedEvents: RoomEvent[] = [];

    // Subscribe to all signals moving across the bus line
    const subscription = eventBus.onAll().subscribe((event) => {
      receivedEvents.push(event);
    });

    eventBus.dispatch('ROOM_CONNECTED', { roomId: 'test-room-123' });
    eventBus.dispatch('SECURITY_ALERT', { severity: 'high' });

    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0]).toEqual({
      type: 'ROOM_CONNECTED',
      payload: { roomId: 'test-room-123' },
    });
    expect(receivedEvents[1]).toEqual({ type: 'SECURITY_ALERT', payload: { severity: 'high' } });

    subscription.unsubscribe();
  });

  it('should only deliver matched signals when filtering via on()', () => {
    const connectedEvents: RoomEvent[] = [];
    const alertEvents: RoomEvent[] = [];

    // Attach explicit individual target observers
    const subConnected = eventBus.on('ROOM_CONNECTED').subscribe((e) => connectedEvents.push(e));
    const subAlerts = eventBus.on('SECURITY_ALERT').subscribe((e) => alertEvents.push(e));

    // Dispatch a series of alternating signals
    eventBus.dispatch('ROOM_CONNECTED', { id: 1 });
    eventBus.dispatch('ERROR', { msg: 'Bypassed error condition' }); // Should be ignored by both
    eventBus.dispatch('SECURITY_ALERT', { id: 2 });
    eventBus.dispatch('ROOM_CONNECTED', { id: 3 });

    // Assert isolated routing logic
    expect(connectedEvents).toHaveLength(2);
    expect(connectedEvents[0].payload.id).toBe(1);
    expect(connectedEvents[1].payload.id).toBe(3);

    expect(alertEvents).toHaveLength(1);
    expect(alertEvents[0].payload.id).toBe(2);

    subConnected.unsubscribe();
    subAlerts.unsubscribe();
  });

  it('should cleanly handle optional undefined payloads during transmission layouts', () => {
    const receivedEvents: RoomEvent[] = [];

    const subscription = eventBus.on('ROOM_CLOSED').subscribe((e) => receivedEvents.push(e));

    // Dispatch an event omitting the optional second parameter completely
    eventBus.dispatch('ROOM_CLOSED');

    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toEqual({ type: 'ROOM_CLOSED', payload: undefined });

    subscription.unsubscribe();
  });
});

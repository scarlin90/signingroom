import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoomStateStore, RoomState } from './room-state-store';
import { RoomEventBus } from '../events/room-event-bus';
import { PsbtUtils } from '../bitcoin/psbt-utils';

// Mock PsbtUtils execution pathways explicitly
vi.mock('../bitcoin/psbt-utils', () => ({
  PsbtUtils: {
    merge: vi.fn((a, b) => `${a}-${b}-merged`),
  },
}));

describe('RoomStateStore', () => {
  let eventBus: RoomEventBus;
  let store: RoomStateStore;

  beforeEach(() => {
    eventBus = new RoomEventBus();
    store = new RoomStateStore(eventBus);
  });

  it('should initially return null state values before allocation initialization', () => {
    expect(store.getState()).toBeNull();
  });

  it('should cleanly initialize basic template configurations and broadcast adjustments', () => {
    let capturedState: RoomState | null = null;
    eventBus.onAll().subscribe((e) => {
      if (e.type === 'STATE_CHANGED') capturedState = e.payload;
    });

    store.init('room-abc-123', '1.0.0');

    const state = store.getState();
    expect(state).not.toBeNull();
    expect(state?.roomId).toBe('room-abc-123');
    expect(state?.protocolVersion).toBe('1.0.0');
    expect(state?.roomName).toBe('Signing Room');
    expect(state?.addressLabels).toEqual({});
    expect(capturedState).toEqual(state);
  });

  it('should ignore input signals gracefully if updatePartial encounters an uninitialized store', () => {
    // Dispatch an operation when store is uninitialized (this.state is null)
    eventBus.dispatch('LOCK_UPDATED', { isLocked: true });
    expect(store.getState()).toBeNull();
  });

  describe('Reactive Event Integration Flow Checks', () => {
    beforeEach(() => {
      store.init('active-room', '1.0.0');
    });

    it('should overwrite entire structures wholesale when receiving STATE_SYNC_DECRYPTED mappings', () => {
      const mockSyncData = { roomName: 'Overwritten Title', network: 'signet', psbt: 'xyz' };
      eventBus.dispatch('STATE_SYNC_DECRYPTED', mockSyncData);

      const state = store.getState();
      expect(state?.roomName).toBe('Overwritten Title');
      expect(state?.network).toBe('signet');
      expect(state?.psbt).toBe('xyz');
    });

    it('should correctly handle diverse formats of boolean parameters or payload structures under LOCK_UPDATED', () => {
      // Test explicit parameter object mapping formats
      eventBus.dispatch('LOCK_UPDATED', { isLocked: true });
      expect(store.getState()?.isLocked).toBe(true);

      // Test raw object direct values path configuration
      eventBus.dispatch('LOCK_UPDATED', false);
      expect(store.getState()?.isLocked).toBe(false);
    });

    it('should update signer labels map arrays when LABELS_DECRYPTED triggers', () => {
      const labels = { 'fingerprint-1': 'Ledger Nano' };
      eventBus.dispatch('LABELS_DECRYPTED', labels);
      expect(store.getState()?.signerLabels).toEqual(labels);
    });

    it('should update address labels map arrays when ADDRESS_LABELS_DECRYPTED triggers', () => {
      const labels = { tb1q123: 'Cold Storage' };
      eventBus.dispatch('ADDRESS_LABELS_DECRYPTED' as any, labels);
      expect(store.getState()?.addressLabels).toEqual(labels);
    });

    it('should re-assign titles cleanly when ROOM_RENAMED_DECRYPTED fires', () => {
      eventBus.dispatch('ROOM_RENAMED_DECRYPTED', 'New Vault Name');
      expect(store.getState()?.roomName).toBe('New Vault Name');
    });

    it('should replace tracking lists cleanly when LOG_UPDATE_DECRYPTED fires', () => {
      const logs = [{ timestamp: 123, event: 'TEST', user: 'alice' }];
      eventBus.dispatch('LOG_UPDATE_DECRYPTED', logs);
      expect(store.getState()?.auditLog).toEqual(logs);
    });

    it('should append parameters cleanly when WHITELIST_DECRYPTED fires', () => {
      const list = ['key1', 'key2'];
      eventBus.dispatch('WHITELIST_DECRYPTED', list);
      expect(store.getState()?.whitelist).toEqual(list);
    });

    it('should map participant matrices cleanly when PARTICIPANTS_DECRYPTED fires', () => {
      const entries = { 'id-1': { id: 'id-1', role: 'admin' } };
      eventBus.dispatch('PARTICIPANTS_DECRYPTED', entries);
      expect(store.getState()?.participants).toEqual(entries);
    });

    it('should pull internal sub-properties safely when CONNECTIONS_DECRYPTED triggers', () => {
      eventBus.dispatch('CONNECTIONS_DECRYPTED', { count: 42 });
      expect(store.getState()?.connectedCount).toBe(42);
    });

    it('should modify final target hashes securely when TX_FINALIZED_DECRYPTED targets trigger', () => {
      eventBus.dispatch('TX_FINALIZED_DECRYPTED', { finalTxHex: '01000000', finalTxId: 'txid123' });
      expect(store.getState()?.finalTxHex).toBe('01000000');
      expect(store.getState()?.finalTxId).toBe('txid123');
    });

    it('should modify single entries cleanly while maintaining prior states when UPDATE_LABEL triggers', () => {
      // Establish an existing dictionary state first
      eventBus.dispatch('LABELS_DECRYPTED', { 'fp-1': 'Label A', 'fp-2': 'Label B' });

      // Update one target slot selectively
      eventBus.dispatch('UPDATE_LABEL', { fingerprint: 'fp-2', label: 'Label B Mod' });

      const finalLabels = store.getState()?.signerLabels;
      expect(finalLabels?.['fp-1']).toBe('Label A');
      expect(finalLabels?.['fp-2']).toBe('Label B Mod');
    });

    it('should merge transaction tracking records cleanly via PsbtUtils when NEW_PARTIAL_DECRYPTED updates arrive', () => {
      store.update((s) => {
        if (s) s.psbt = 'base-psbt';
        return s;
      });

      eventBus.dispatch('NEW_PARTIAL_DECRYPTED', { decryptedPsbt: 'partial-addon' });

      const state = store.getState();
      expect(PsbtUtils.merge).toHaveBeenCalledWith('base-psbt', 'partial-addon');
      expect(state?.psbt).toBe('base-psbt-partial-addon-merged');
      expect(state?.signatures).toContain('partial-addon');
    });

    it('should ignore data merge pipelines if store instance is completely uninitialized', () => {
      store.set(null); // Force wipe state tracking records completely
      eventBus.dispatch('NEW_PARTIAL_DECRYPTED', { decryptedPsbt: 'ignored' });
      expect(store.getState()).toBeNull();
    });
  });

  describe('Manual Mutation and Value Overrides', () => {
    it('should call high order updater callbacks smoothly and broadcast mutations via update()', () => {
      store.init('room-xyz', '1.0.0');

      store.update((s) => {
        if (s) s.roomName = 'Custom Functional Name';
        return s;
      });

      expect(store.getState()?.roomName).toBe('Custom Functional Name');
    });

    it('should skip update dispatch channels completely if high order callbacks return null structures', () => {
      let changeFired = false;
      eventBus.on('STATE_CHANGED').subscribe(() => {
        changeFired = true;
      });

      store.update(() => null);
      expect(changeFired).toBe(false);
    });

    it('should allow forcing clean object mappings directly using set() methods', () => {
      const targetObject = { roomId: 'manual-override' } as RoomState;
      store.set(targetObject);
      expect(store.getState()).toEqual(targetObject);
    });

    it('should bypass event channel transmissions entirely if set() methods receive a null tracking instance', () => {
      let changeFired = false;
      eventBus.on('STATE_CHANGED').subscribe(() => {
        changeFired = true;
      });

      store.set(null);
      expect(changeFired).toBe(false);
    });
  });
});

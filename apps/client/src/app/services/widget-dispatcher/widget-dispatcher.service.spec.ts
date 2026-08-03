import { TestBed } from '@angular/core/testing';
import { WidgetDispatcherService } from './widget-dispatcher.service';
import { SocketService } from '../socket/socket.service';
import { vi } from 'vitest';

describe('WidgetDispatcherService', () => {
  let service: WidgetDispatcherService;
  let socketSpy: any;
  let postMessageSpy: any;

  const TEST_ORIGIN = 'https://trusted-host.com';

  beforeEach(() => {
    socketSpy = {
      roomState: vi.fn().mockReturnValue({ roomId: 'test-room', network: 'testnet' }),
      currentSessionId: vi.fn().mockReturnValue('session-123'),
      isCoordinator: vi.fn().mockReturnValue(true),
    };

    postMessageSpy = vi.fn();

    // Mock a deeply embedded iframe environment by default
    Object.defineProperty(window, 'parent', {
      value: { postMessage: postMessageSpy },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(window, 'top', {
      value: {}, // Different from 'window', signifying we are in an iframe
      configurable: true,
      writable: true,
    });

    TestBed.configureTestingModule({
      providers: [WidgetDispatcherService, { provide: SocketService, useValue: socketSpy }],
    });
    service = TestBed.inject(WidgetDispatcherService);
    service.setTargetOrigin(TEST_ORIGIN);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // ENVIRONMENT & CONTEXT TESTS
  // ==========================================

  describe('Environment & Context', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should correctly identify when running standalone (not embedded)', () => {
      Object.defineProperty(window, 'top', { value: window, configurable: true });
      expect(service.isEmbedded).toBe(false);
    });

    it('should fallback to embedded=true if accessing window.top throws a CORS error', () => {
      Object.defineProperty(window, 'top', {
        get: () => {
          throw new Error('CORS Security Error');
        },
        configurable: true,
      });
      expect(service.isEmbedded).toBe(true);
    });

    it('should NOT dispatch events if the widget is running standalone', () => {
      Object.defineProperty(window, 'top', { value: window, configurable: true }); // Standalone
      service.emitRoomRenamed('Test Name');
      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('should safely do nothing if window.parent is somehow missing', () => {
      Object.defineProperty(window, 'parent', { value: null, configurable: true });
      service.emitRoomRenamed('Test Name');
      // Should not throw an error, just fail silently
      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('should append the correct base context for a Coordinator', () => {
      vi.useFakeTimers();
      const mockTime = 1600000000000;
      vi.setSystemTime(mockTime);

      service.emitRoomRenamed('Alpha');

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          type: 'SIGNING_ROOM_EVENT',
          action: 'roomRenamed',
          payload: {
            roomId: 'test-room',
            sessionId: 'session-123',
            role: 'coordinator',
            network: 'testnet',
            timestamp: mockTime,
            newName: 'Alpha',
          },
        },
        TEST_ORIGIN,
      );

      vi.useRealTimers();
    });

    it('should append the correct base context for a Guest', () => {
      socketSpy.isCoordinator.mockReturnValue(false);
      service.emitRoomRenamed('Alpha');

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ role: 'guest' }),
        }),
        TEST_ORIGIN,
      );
    });

    it('should handle null/missing state context safely', () => {
      socketSpy.roomState.mockReturnValue(null);
      socketSpy.currentSessionId.mockReturnValue(null);
      socketSpy.isCoordinator.mockReturnValue(false);

      service.emitRoomRenamed('Alpha');

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            roomId: null,
            sessionId: null,
            role: 'unknown',
            network: null,
          }),
        }),
        TEST_ORIGIN,
      );
    });
  });

  // ==========================================
  // EVENT EMITTER TESTS
  // ==========================================

  describe('Event Emitters', () => {
    it('emitModalView', () => {
      service.emitModalView('MyModal', 'Context123');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'modalViewed',
          payload: expect.objectContaining({ modalName: 'MyModal', context: 'Context123' }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitPrivacyToggle', () => {
      service.emitPrivacyToggle('signers', 'hidden');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'privacyToggled',
          payload: expect.objectContaining({ section: 'signers', state: 'hidden' }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitRoomRenamed', () => {
      service.emitRoomRenamed('New Room');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'roomRenamed',
          payload: expect.objectContaining({ newName: 'New Room' }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitDataCopied', () => {
      service.emitDataCopied('room-id');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'dataCopied',
          payload: expect.objectContaining({ dataType: 'room-id' }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitDownloadTriggered', () => {
      service.emitDownloadTriggered('audit-log');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'downloadTriggered',
          payload: expect.objectContaining({ fileType: 'audit-log' }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitRoomStateChanged', () => {
      service.emitRoomStateChanged('locked');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'roomStateChanged',
          payload: expect.objectContaining({ state: 'locked' }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitQrStateChanged', () => {
      service.emitQrStateChanged(true, false);
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'qrStateChanged',
          payload: expect.objectContaining({ includesKey: true, isRevealed: false }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitFountainFormatChanged', () => {
      service.emitFountainFormatChanged('bbqr');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'fountainFormatChanged',
          payload: expect.objectContaining({ format: 'bbqr' }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitFountainStateChanged', () => {
      service.emitFountainStateChanged(true, 'ur');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'fountainStateChanged',
          payload: expect.objectContaining({ isRevealed: true, format: 'ur' }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitPsbtImported', () => {
      service.emitPsbtImported('scan');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'psbtImported',
          payload: expect.objectContaining({ method: 'scan' }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitTransactionViewChanged', () => {
      service.emitTransactionViewChanged('outputs');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'transactionViewChanged',
          payload: expect.objectContaining({ view: 'outputs' }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitDestinationVerified', () => {
      service.emitDestinationVerified('outputs', 'batch', true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'destinationVerified',
          payload: expect.objectContaining({ type: 'outputs', address: 'batch', isVerified: true }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitRoomCreated', () => {
      service.emitRoomCreated('id-123', 'signet');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'roomCreated',
          payload: expect.objectContaining({ roomId: 'id-123', network: 'signet' }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitTransactionFinalized', () => {
      service.emitTransactionFinalized({
        txId: 'tx1',
        txHex: 'hex1',
        roomState: {},
        auditLogCsv: 'csv1',
        settlementCsv: 'csv2',
        auditPdfUri: 'pdf1',
      });
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'transactionFinalized',
          payload: expect.objectContaining({ txId: 'tx1', txHex: 'hex1' }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitParticipantPresence', () => {
      service.emitParticipantPresence('joined', 'p123', 'guest', 'Bob');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'participantPresence',
          payload: expect.objectContaining({
            action: 'joined',
            participantId: 'p123',
            participantRole: 'guest',
            displayName: 'Bob',
          }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitSignatureReceived', () => {
      service.emitSignatureReceived('fp123', 'Ledger', 's123', 'Alice');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'signatureReceived',
          payload: expect.objectContaining({
            fingerprint: 'fp123',
            signerLabel: 'Ledger',
            signerSessionId: 's123',
            signerName: 'Alice',
          }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitParticipantLabelled', () => {
      service.emitParticipantLabelled('signer', 'Trezor', 'fp123');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'participantLabelled',
          payload: expect.objectContaining({
            target: 'signer',
            label: 'Trezor',
            fingerprint: 'fp123',
          }),
        }),
        TEST_ORIGIN,
      );
    });

    it('emitSecurityAlert', () => {
      service.emitSecurityAlert('access_denied', 'high', 'Alert!');
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'securityAlert',
          payload: expect.objectContaining({
            alertType: 'access_denied',
            severity: 'high',
            message: 'Alert!',
          }),
        }),
        TEST_ORIGIN,
      );
    });

    it('should securely emit addressCopied event to the host', () => {
      const mockAddress = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';

      service.emitAddressCopied(mockAddress);

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SIGNING_ROOM_EVENT',
          action: 'addressCopied',
          payload: expect.objectContaining({
            address: mockAddress,
            network: 'testnet',
            role: 'coordinator',
            roomId: 'test-room',
          }),
        }),
        'https://trusted-host.com',
      );
    });
  });
});

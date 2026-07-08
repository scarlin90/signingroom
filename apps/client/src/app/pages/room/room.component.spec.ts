import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomComponent } from './room.component';
import { ActivatedRoute, Router } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { SocketService } from '../../services/socket/socket.service';
import { UrService } from '../../services/ur/ur.service';
import { WidgetDispatcherService } from '../../services/widget-dispatcher/widget-dispatcher.service';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { Html5Qrcode } from 'html5-qrcode';
import * as QRCode from 'qrcode';

// --- MOCKS ---
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: vi.fn(function () {
    return {
      start: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockReturnValue(2),
      stop: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    };
  }),
  Html5QrcodeSupportedFormats: { QR_CODE: 0 },
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockqr'),
  toCanvas: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('RoomComponent', () => {
  let component: RoomComponent;
  let fixture: ComponentFixture<RoomComponent>;

  // Service Mocks
  let mockRouter: any;
  let mockActivatedRoute: any;
  let mockSocketService: any;
  let mockUrService: any;
  let mockDispatcherService: any;
  let mockTitle: any;

  beforeEach(async () => {
    // Inject required DOM elements for canvas queries
    document.body.innerHTML = '<canvas id="fountain-psbt-canvas"></canvas>';

    // Mock Browser APIs
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();
    window.open = vi.fn();

    mockRouter = { navigate: vi.fn() };
    mockTitle = { setTitle: vi.fn() };

    mockActivatedRoute = {
      snapshot: { fragment: 'secret-key' },
      paramMap: of(new Map([['id', 'room-123']])),
    };

    mockDispatcherService = {
      isEmbedded: false,
      emitRoomStateChanged: vi.fn(),
      emitParticipantPresence: vi.fn(),
      emitParticipantLabelled: vi.fn(),
      emitSignatureReceived: vi.fn(),
      emitSecurityAlert: vi.fn(),
      emitPsbtImported: vi.fn(),
      emitDownloadTriggered: vi.fn(),
      emitTransactionFinalized: vi.fn(),
      emitModalView: vi.fn(),
      emitRoomRenamed: vi.fn(),
      emitDestinationVerified: vi.fn(),
      emitTransactionViewChanged: vi.fn(),
      emitQrStateChanged: vi.fn(),
      emitDataCopied: vi.fn(),
      emitPrivacyToggle: vi.fn(),
      emitFountainFormatChanged: vi.fn(),
      emitFountainStateChanged: vi.fn(),
    };

    mockUrService = {
      resetDecoder: vi.fn(),
      processFragment: vi.fn(),
      lastScannedText: vi.fn(() => ''),
      scanError: vi.fn(() => ''),
      scanProgress: vi.fn(() => 0),
      generateFrames: vi.fn(() => ['frame-ur-1', 'frame-ur-2']),
      generateBBQrFrames: vi.fn(() => ['frame-bbqr-1', 'frame-bbqr-2']),
    };

    mockSocketService = {
      status: signal('connected'),
      isClosed: signal(false),
      roomNotFound: signal(false),
      isLockedOut: signal(false),
      isRoomFull: signal(false),
      decryptionError: signal(''),
      roomState: signal({
        roomId: 'room-123',
        roomName: 'Test Room',
        isLocked: false,
        network: 'bitcoin',
        psbt: 'psbt-data',
        whitelist: ['verified-addr-1'],
        signerLabels: { 'fp-1': 'Alice' },
        signatures: [], // FIX: Included empty signatures array to satisfy `canFinalize` checks
      }),
      txDetails: signal({
        inputs: 1,
        inputsList: [{ address: 'in-addr-1', txId: 'tx1', vout: 0, amount: 50000 }],
        outputs: [
          { address: 'verified-addr-1', isChange: false, amount: 20000 },
          { address: 'unverified-addr-2', isChange: false, amount: 20000 },
          { address: 'change-addr-3', isChange: true, amount: 5000 },
        ],
        amount: 40000,
        feeRate: 10,
      }),
      signers: signal([{ fingerprint: 'fp-1', signed: true }]),
      signerCount: signal(1),
      signerThreshold: signal(2),
      activeSessions: signal([{ id: 'sess-1', role: 'admin', displayName: 'Alice' }]),
      currentSessionId: signal('sess-1'),
      isCoordinator: signal(true),
      isReadyToBroadcast: signal(false),
      networkSignatureReceived$: new Subject(),
      securityAlert$: new Subject(),
      sdk: {
        store: { getState: vi.fn(() => ({ roomId: 'room-123' })) },
        parsePsbtFile: vi.fn().mockResolvedValue('parsed-psbt-data'),
      },

      connect: vi.fn(),
      disconnect: vi.fn(),
      reset: vi.fn(),
      setRoomKey: vi.fn(),
      getThreshold: vi.fn(() => 2),
      uploadSignature: vi.fn(),
      logAction: vi.fn(),
      getRoomKey: vi.fn(() => 'secret-key'),
      claimCoordinator: vi.fn(),
      closeRoom: vi.fn(),
      renameRoom: vi.fn(),
      toggleLock: vi.fn(),
      updateSignerLabel: vi.fn(),
      saveToAddressBook: vi.fn(),
      removeFromAddressBook: vi.fn(),
      updateWhitelist: vi.fn(),
      setDisplayName: vi.fn(),
      getFinalTxHex: vi.fn(() => 'final-hex-payload'),
      getFinalTxId: vi.fn(() => 'final-tx-id'),
      finalizeTransaction: vi.fn(),
      getRoomLink: vi.fn(() => 'https://app.com/room/123#key'),
      getLocalLabel: vi.fn(),
      getAuditLogPdf: vi.fn(() =>
        Promise.resolve({
          doc: { save: vi.fn(), output: vi.fn(() => 'pdf-base64-data') },
          filename: 'audit.pdf',
        }),
      ),
      getAuditLogCsv: vi.fn(() => 'csv-log'),
      getSettlementCsvData: vi.fn(() => 'csv-settlement'),
      checkAndApplyLocalLabels: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [RoomComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: SocketService, useValue: mockSocketService },
        { provide: UrService, useValue: mockUrService },
        { provide: WidgetDispatcherService, useValue: mockDispatcherService },
        { provide: Title, useValue: mockTitle },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization & Lifecycle Hooks', () => {
    it('should connect to the socket using route parameters and fragment', () => {
      // FIX: Force state to disconnected so it bypasses early return protection in ngOnInit
      mockSocketService.status.set('disconnected');
      fixture.detectChanges();

      expect(component.roomId()).toBe('room-123');
      expect(mockSocketService.setRoomKey).toHaveBeenCalledWith('secret-key');
      expect(mockSocketService.connect).toHaveBeenCalledWith('room-123', 'secret-key');
    });

    it('should properly disconnect the socket when component is destroyed', () => {
      fixture.detectChanges();
      component.ngOnDestroy();
      expect(mockSocketService.disconnect).toHaveBeenCalled();
      expect(mockSocketService.reset).toHaveBeenCalled();
    });

    it('should permit unloading if conditions are met', () => {
      const event = { returnValue: false };
      mockSocketService.status.set('connected');
      component.unloadNotification(event);
      expect(event.returnValue).toBe(true);
    });
  });

  describe('UI State & Computed Properties', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should compute whitelist status accurately', () => {
      expect(component.isWhitelisted('verified-addr-1')).toBe(true);
      expect(component.isWhitelisted('unverified-addr-2')).toBe(false);
    });

    it('should extract correct labels for signers', () => {
      expect(component.getSignerLabel('fp-1')).toBe('Alice (fp-1)');
      expect(component.getSignerLabel('fp-unknown')).toBe('fp-unknown');
    });

    it('should filter inputs based on the search query', () => {
      component.inputSearchQuery.set('addr-1');
      expect(component.filteredInputs().length).toBe(1);

      component.inputSearchQuery.set('not-found');
      expect(component.filteredInputs().length).toBe(0);
    });

    it('should flag network fee thresholds', () => {
      expect(component.requiredSignatures).toBe(2);
      expect(component.canFinalize).toBe(false); // 1 / 2 signed
    });
  });

  describe('Room Management Actions', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should execute rename room when valid text is provided', () => {
      component.newRoomName.set('New Alpha Room');
      component.saveRoomName();

      expect(mockSocketService.renameRoom).toHaveBeenCalledWith('New Alpha Room');
      expect(mockDispatcherService.emitRoomRenamed).toHaveBeenCalledWith('New Alpha Room');
    });

    it('should allow coordinator to toggle room lock', () => {
      component.toggleLock();
      expect(component.showConfirmModal()).toBe(true);

      component.executeConfirmAction();
      expect(mockSocketService.toggleLock).toHaveBeenCalledWith(true);
    });

    it('should save a signer label and optionally append it to the address book', () => {
      component.editingFingerprint.set('fp-new');
      component.editingLabel.set('Bob Hardware');
      component.saveToBook.set(true);

      component.saveLabel();

      expect(mockSocketService.updateSignerLabel).toHaveBeenCalledWith('fp-new', 'Bob Hardware');
      expect(mockSocketService.saveToAddressBook).toHaveBeenCalledWith('fp-new', 'Bob Hardware');
    });

    it('should trigger batch whitelist verifications for inputs and outputs', () => {
      component.verifyAllInputs();
      expect(mockSocketService.updateWhitelist).toHaveBeenCalledWith(['in-addr-1'], false);

      component.verifyAllOutputs();
      component.executeConfirmAction();
      expect(mockSocketService.updateWhitelist).toHaveBeenCalledWith(
        ['unverified-addr-2', 'change-addr-3'],
        false,
      );
    });
  });

  describe('Data Export & Sharing', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should build a download link for unsigned PSBTs', () => {
      component.downloadUnsignedPsbt();
      expect(window.URL.createObjectURL).toHaveBeenCalled();
    });

    it('should generate CSV settlements safely', () => {
      component.downloadCsv();
      expect(window.URL.createObjectURL).toHaveBeenCalled();
      expect(mockSocketService.getSettlementCsvData).toHaveBeenCalled();
    });

    it('should copy securely decoupled share links', () => {
      component.copySecureLink();
      expect(navigator.clipboard.writeText).toHaveBeenCalled();

      // FIX: Matches argument structure from the component definition `this.socket.logAction('Link Copied (No Key)', 'User copied room link');`
      expect(mockSocketService.logAction).toHaveBeenCalledWith(
        expect.stringContaining('(No Key)'),
        expect.anything(),
      );
    });
  });

  describe('Transaction Finalization', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should throw an alert if finalization is attempted with unverified addresses', () => {
      component.finalize();

      expect(component.showConfirmModal()).toBe(true);
      expect(component.confirmData().message).toContain('1 unverified');

      component.executeConfirmAction();
      expect(mockSocketService.finalizeTransaction).toHaveBeenCalled();
    });

    it('should route user to mempool space upon broadcast', () => {
      // FIX: Simulate manual hex to match clipboard expectations
      mockSocketService.roomState.set({ finalTxHex: '0100', network: 'bitcoin', signatures: [] });

      component.broadcastAndCopy();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('0100');
      expect(window.open).toHaveBeenCalledWith('https://mempool.space/tx/push', '_blank');
    });
  });

  describe('Optical Scanners & QR Generators', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      fixture.detectChanges();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should initialize and display the QR Share Code', async () => {
      await component.openQr();
      expect(component.showQrModal()).toBe(true);
      expect(QRCode.toDataURL).toHaveBeenCalled();
      expect(component.qrDataUrl()).toBe('data:image/png;base64,mockqr');
    });

    it('should start the camera scanner and correctly decode inbound signed PSBTs', async () => {
      component.startScanner();
      await vi.advanceTimersByTimeAsync(150);

      expect(Html5Qrcode).toHaveBeenCalled();
      expect(component.html5QrCode?.start).toHaveBeenCalled();

      mockUrService.processFragment.mockReturnValue('1234abcd');
      component.handleScanResult('UR:BYTES/XYZ');

      expect(mockSocketService.uploadSignature).toHaveBeenCalled();
      expect(component.html5QrCode?.stop).toHaveBeenCalled();
    });

    it('should orchestrate fountain code loops (Air-Gapped Export)', async () => {
      component.openFountainModal();

      expect(component.activeFountainFrames).toEqual(['frame-ur-1', 'frame-ur-2']);

      component.toggleFountainReveal();
      expect(component.isFountainRevealed()).toBe(true);

      await vi.advanceTimersByTimeAsync(400);

      expect(QRCode.toCanvas).toHaveBeenCalled();
      expect(component.currentFrameIndex()).toBe(1);
    });

    it('should switch fountain export formats to BBQr', () => {
      component.openFountainModal();
      component.setExportFormat('bbqr');

      expect(mockUrService.generateBBQrFrames).toHaveBeenCalled();
      expect(component.activeFountainFrames).toEqual(['frame-bbqr-1', 'frame-bbqr-2']);
    });
  });

  describe('Privacy Blur Modifiers', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should intercept initial blur unmask requests with an OpSec warning', () => {
      expect(component.blurStates()['transaction-overview']).toBe(true);

      component.togglePrivacyBlur('transaction-overview');

      expect(component.showPrivacyWarning()).toBe(true);
      expect(component.pendingUnblurSection()).toBe('transaction-overview');
    });

    it('should clear blurs globally when user selects Reveal All', () => {
      component.togglePrivacyBlur('transaction-overview');
      component.confirmUnblurAll();

      expect(component.showPrivacyWarning()).toBe(false);
      expect(component.blurStates().signers).toBe(false);
      expect(component.blurStates()['transaction-overview']).toBe(false);
      expect(component.blurStates()['transaction-proposal']).toBe(false);
      expect(component.blurStates()['transaction-details']).toBe(false);
    });
  });
});

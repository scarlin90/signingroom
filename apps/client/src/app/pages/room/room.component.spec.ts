import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomComponent } from './room.component';
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { PLATFORM_ID, signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// IMPORT THE ACTUAL CLASSES for proper Dependency Injection
import { SocketService } from '../../services/socket/socket.service';
import { UrService } from '../../services/ur/ur.service';
import { WidgetDispatcherService } from '../../services/widget-dispatcher/widget-dispatcher.service';

// Declare mocks at the top level so they can be reset easily
let mockSocketService: any;
let mockUrService: any;
let mockDispatcher: any;
let mockRouter: any;
let mockActivatedRoute: any;
let mockTitleService: any;

describe('RoomComponent - Setup & Lifecycle', () => {
  let component: RoomComponent;
  let fixture: ComponentFixture<RoomComponent>;

  beforeEach(async () => {
    // Reset all mocks completely to prevent state leakage between tests
    mockSocketService = {
      // --- Signals ---
      status: signal('disconnected'),
      isClosed: signal(false),
      roomNotFound: signal(false),
      isLockedOut: signal(false),
      isRoomFull: signal(false),
      decryptionError: signal(''),
      roomState: signal(null),
      txDetails: signal(null),
      signers: signal([]),
      signerCount: signal(0),
      activeSessions: signal([]),
      currentSessionId: signal('session-1'),

      // --- Observables ---
      networkSignatureReceived$: of({}),
      securityAlert$: of({}),

      // --- Methods (Called in TS and HTML Template) ---
      isCoordinator: vi.fn().mockReturnValue(false),
      getThreshold: vi.fn().mockReturnValue(2),
      signerThreshold: vi.fn().mockReturnValue(2),
      isReadyToBroadcast: vi.fn().mockReturnValue(false),
      getRoomKey: vi.fn().mockReturnValue('test-key-123'),
      getRoomLink: vi.fn().mockReturnValue('http://localhost/room#key'),
      getLocalLabel: vi.fn().mockReturnValue(undefined),
      logAction: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      reset: vi.fn(),
      setRoomKey: vi.fn(),
      checkAndApplyLocalLabels: vi.fn(),
      claimCoordinator: vi.fn(),
      renameRoom: vi.fn(),
      uploadSignature: vi.fn(),
      sdk: {
        store: {
          getState: vi.fn().mockReturnValue({ roomId: null }),
        },
      },
    };

    mockUrService = {
      scanProgress: signal(0),
      scanError: signal(''),
      lastScannedText: signal(''),
      resetDecoder: vi.fn(),
      generateFrames: vi.fn().mockReturnValue(['frame1', 'frame2']),
      generateBBQrFrames: vi.fn().mockReturnValue(['bbqr1']),
      processFragment: vi.fn(),
    };

    mockDispatcher = {
      isEmbedded: false,
      emitTransactionFinalized: vi.fn(),
      emitParticipantPresence: vi.fn(),
      emitParticipantLabelled: vi.fn(),
      emitSignatureReceived: vi.fn(),
      emitSecurityAlert: vi.fn(),
      emitDataCopied: vi.fn(),
      emitTransactionViewChanged: vi.fn(),
      emitPsbtImported: vi.fn(),
      emitDownloadTriggered: vi.fn(),
      emitModalView: vi.fn(),
      emitRoomRenamed: vi.fn(),
      emitDestinationVerified: vi.fn(),
      emitQrStateChanged: vi.fn(),
      emitFountainFormatChanged: vi.fn(),
      emitFountainStateChanged: vi.fn(),
      emitPrivacyToggle: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    mockActivatedRoute = {
      snapshot: {
        fragment: 'test-key-123',
      },
      paramMap: of({
        get: (key: string) => (key === 'id' ? 'room-123' : null),
      }),
    };

    mockTitleService = {
      setTitle: vi.fn(),
    };

    // Configure TestBed using the actual Class types as the provider tokens
    await TestBed.configureTestingModule({
      imports: [RoomComponent],
      providers: [
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter },
        { provide: Title, useValue: mockTitleService },
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: SocketService, useValue: mockSocketService },
        { provide: UrService, useValue: mockUrService },
        { provide: WidgetDispatcherService, useValue: mockDispatcher },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomComponent);
    component = fixture.componentInstance;

    vi.clearAllMocks();
  });

  afterEach(() => {
    if (component['timerInterval']) {
      clearInterval(component['timerInterval']);
    }
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should extract roomId and fragment, then connect to socket', async () => {
      fixture.detectChanges();

      // Flush rxjs observable
      await fixture.whenStable();
      // Flush the async callback inside the paramMap.subscribe
      await new Promise(process.nextTick);

      expect(component.roomId()).toBe('room-123');
      expect(mockSocketService.setRoomKey).toHaveBeenCalledWith('test-key-123');
      expect(mockSocketService.connect).toHaveBeenCalledWith('room-123', 'test-key-123');
    });

    it('should set decryption error if no fragment is present', async () => {
      mockActivatedRoute.snapshot.fragment = '';

      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise(process.nextTick);

      expect(mockSocketService.decryptionError()).toBe('Missing decryption key');
    });
  });

  describe('ngOnDestroy', () => {
    it('should disconnect socket, reset, and clear timer', () => {
      fixture.detectChanges();

      // Mock the interval and spy on the global object
      component['timerInterval'] = setInterval(() => {}, 10000) as any;
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

      component.ngOnDestroy();

      expect(mockSocketService.disconnect).toHaveBeenCalled();
      expect(mockSocketService.reset).toHaveBeenCalled();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('HostListeners', () => {
    it('unloadNotification should return true if connected and not finalized', () => {
      mockSocketService.status.set('connected');
      mockSocketService.isClosed.set(false);
      // finalHex computed property defaults to null based on mock state

      const event = { returnValue: false };
      component.unloadNotification(event);

      expect(event.returnValue).toBe(true);
    });

    it('onBeforeUnload should call socket.disconnect()', () => {
      component.onBeforeUnload();
      expect(mockSocketService.disconnect).toHaveBeenCalled();
    });
  });

  describe('Computed Properties & Getters', () => {
    describe('filteredInputs & filteredOutputs', () => {
      beforeEach(() => {
        // Setup mock transaction details
        mockSocketService.txDetails.set({
          inputsList: [
            { address: 'bc1qabc123', amount: 1000, txId: 'tx1', vout: 0 },
            { address: '3J98t1WpEZ73', amount: 2000, txId: 'tx2', vout: 1 },
          ],
          outputs: [
            { address: 'bc1qxyz890', amount: 500, isChange: false },
            { address: 'bc1qchange', amount: 2500, isChange: true },
          ],
        });
        fixture.detectChanges();
      });

      it('should return all inputs when search query is empty', () => {
        component.inputSearchQuery.set('');
        expect(component.filteredInputs().length).toBe(2);
      });

      it('should filter inputs based on search query (case-insensitive)', () => {
        component.inputSearchQuery.set('BC1Q');
        const results = component.filteredInputs();
        expect(results.length).toBe(1);
        expect(results[0].address).toBe('bc1qabc123');
      });

      it('should return all outputs when search query is empty', () => {
        component.outputSearchQuery.set('');
        expect(component.filteredOutputs().length).toBe(2);
      });

      it('should filter outputs based on search query', () => {
        component.outputSearchQuery.set('xyz');
        const results = component.filteredOutputs();
        expect(results.length).toBe(1);
        expect(results[0].address).toBe('bc1qxyz890');
      });

      it('should handle null txDetails gracefully', () => {
        mockSocketService.txDetails.set(null);
        expect(component.filteredInputs()).toEqual([]);
        expect(component.filteredOutputs()).toEqual([]);
      });
    });

    describe('requiredSignatures', () => {
      it('should calculate threshold from PSBT via socket service', () => {
        mockSocketService.roomState.set({ psbt: 'base64psbtdata' });
        mockSocketService.getThreshold.mockReturnValue(3);

        expect(component.requiredSignatures).toBe(3);
        expect(mockSocketService.getThreshold).toHaveBeenCalledWith('base64psbtdata');
      });

      it('should return 0 if there is no psbt in room state', () => {
        mockSocketService.roomState.set(null);
        expect(component.requiredSignatures).toBe(0);
      });
    });

    describe('canFinalize', () => {
      it('should return true if signed count meets or exceeds threshold', () => {
        mockSocketService.roomState.set({
          psbt: 'psbt',
          signatures: ['sig1', 'sig2'], // length 2
        });
        mockSocketService.getThreshold.mockReturnValue(2);

        expect(component.canFinalize).toBe(true);
      });

      it('should return false if signed count is below threshold', () => {
        mockSocketService.roomState.set({
          psbt: 'psbt',
          signatures: ['sig1'], // length 1
        });
        mockSocketService.getThreshold.mockReturnValue(2);

        expect(component.canFinalize).toBe(false);
      });

      it('should return false if room state is null', () => {
        mockSocketService.roomState.set(null);
        expect(component.canFinalize).toBe(false);
      });
    });

    describe('Helper Methods (Whitelist & Labels)', () => {
      beforeEach(() => {
        mockSocketService.roomState.set({
          whitelist: ['bc1qtrusted'],
          signerLabels: { fingerprintA: 'Alice Hardware' },
        });
        mockSocketService.getLocalLabel.mockImplementation((fp: string) =>
          fp === 'fingerprintB' ? 'Bob Local' : undefined,
        );
      });

      it('isWhitelisted should correctly identify whitelisted addresses', () => {
        expect(component.isWhitelisted('bc1qtrusted')).toBe(true);
        expect(component.isWhitelisted('bc1qunknown')).toBe(false);
      });

      it('getSignerLabel should format known labels with fingerprints', () => {
        expect(component.getSignerLabel('fingerprintA')).toBe('Alice Hardware (fingerprintA)');
      });

      it('getSignerLabel should return just the fingerprint if no label exists', () => {
        expect(component.getSignerLabel('fingerprintUnknown')).toBe('fingerprintUnknown');
      });

      it('getLabel should return the raw label without formatting', () => {
        expect(component.getLabel('fingerprintA')).toBe('Alice Hardware');
        expect(component.getLabel('fingerprintUnknown')).toBeUndefined();
      });

      it('isSaved should return true if a local label exists in address book', () => {
        expect(component.isSaved('fingerprintB')).toBe(true);
        expect(component.isSaved('fingerprintA')).toBe(false); // Only in room state, not local
      });
    });

    describe('isEmbedded', () => {
      it('should return the value from WidgetDispatcherService', () => {
        mockDispatcher.isEmbedded = true;
        expect(component.isEmbedded).toBe(true);

        mockDispatcher.isEmbedded = false;
        expect(component.isEmbedded).toBe(false);
      });
    });
  });

  describe('UI State, Modals, Operations & Alerts', () => {
    describe('Unified Confirmation Modal Logic', () => {
      it('openConfirm should correctly populate confirmData with confirm type', () => {
        const testAction = vi.fn();
        component.openConfirm('Danger Zone', 'Are you sure?', testAction, true);

        expect(component.showConfirmModal()).toBe(true);
        expect(component.confirmData()).toEqual({
          title: 'Danger Zone',
          message: 'Are you sure?',
          action: testAction,
          isDestructive: true,
          type: 'confirm',
        });
      });

      it('openAlert should correctly populate confirmData with alert type', () => {
        component.openAlert('Error Happened', 'Something went south.');

        expect(component.showConfirmModal()).toBe(true);
        expect(component.confirmData().title).toBe('Error Happened');
        expect(component.confirmData().type).toBe('alert');
        expect(component.confirmData().isDestructive).toBe(false);
      });

      it('executeConfirmAction should run the callback and dismiss the modal', () => {
        const testAction = vi.fn();
        component.openConfirm('Run script', 'Proceed?', testAction);

        component.executeConfirmAction();

        expect(testAction).toHaveBeenCalled();
        expect(component.showConfirmModal()).toBe(false);
      });

      it('closeConfirmModal should dismiss and clear state values completely', () => {
        component.openConfirm('Title', 'Msg', () => {});
        component.closeConfirmModal();

        expect(component.showConfirmModal()).toBe(false);
        expect(component.confirmData().title).toBe('');
        expect(component.confirmData().type).toBe('confirm');
      });
    });

    describe('Clipboard Operations & Interaction Feedback', () => {
      beforeEach(() => {
        // Mock global navigator clipboard API
        Object.defineProperty(globalThis.navigator, 'clipboard', {
          value: {
            writeText: vi.fn().mockResolvedValue(undefined),
          },
          configurable: true,
        });
      });

      it('doCopy should write text to clipboard and flip a feedback signal momentarily', () => {
        vi.useFakeTimers();
        const testSignal = signal(false);

        component['doCopy']('Bitcoin Sovereign Tech', testSignal);

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Bitcoin Sovereign Tech');
        expect(testSignal()).toBe(true);

        // Advance time past the 2000ms delay to verify signal reset
        vi.advanceTimersByTime(2000);
        expect(testSignal()).toBe(false);

        vi.useRealTimers();
      });

      it('copySessionId should concatenate strings and emitDataCopied to widget channel', () => {
        vi.useFakeTimers();
        component.copySessionId('session-xyz', 'Auditor Alice');

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          'Auditor Alice (Session: session-xyz)',
        );
        expect(component.copiedSessionId()).toBe('session-xyz');
        expect(mockDispatcher.emitDataCopied).toHaveBeenCalledWith('session-id');

        vi.advanceTimersByTime(2000);
        expect(component.copiedSessionId()).toBeNull();

        vi.useRealTimers();
      });

      it('copySessionId should fall back to Anonymous Guest if displayName is missing', () => {
        component.copySessionId('session-456');
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          'Anonymous Guest (Session: session-456)',
        );
      });
    });

    describe('View Mode & Layout Modifiers', () => {
      it('setViewMode should transition state from inputs to outputs and update dispatcher context', () => {
        component.setViewMode('inputs');
        expect(component.viewMode()).toBe('inputs');
        expect(mockDispatcher.emitTransactionViewChanged).toHaveBeenCalledWith('inputs');

        component.setViewMode('outputs');
        expect(component.viewMode()).toBe('outputs');
        expect(mockDispatcher.emitTransactionViewChanged).toHaveBeenCalledWith('outputs');
      });

      it('updateSearchQuery should seamlessly populate corresponding text matching filter spaces', () => {
        component.updateSearchQuery('inputs', 'bc1qabc');
        expect(component.inputSearchQuery()).toBe('bc1qabc');

        component.updateSearchQuery('outputs', 'bc1qxyz');
        expect(component.outputSearchQuery()).toBe('bc1qxyz');
      });
    });
  });

  describe('Core Actions - Files, PSBTs & QR Generations', () => {
    describe('onFileSelected Ingestion Rules', () => {
      let mockEvent: any;

      beforeEach(() => {
        mockSocketService.sdk.parsePsbtFile = vi.fn();
        mockSocketService.uploadSignature = vi.fn();

        // Setup base event structure
        mockEvent = {
          target: {
            value: 'C:\\fakepath\\signed.psbt',
            files: [],
          },
        };
      });

      it('should block file processing if no file is present in selection array', async () => {
        mockEvent.target.files = [];
        await component.onFileSelected(mockEvent);
        expect(component.isUploading()).toBe(false);
      });

      it('should fail fast and alert user if file extension is invalid', async () => {
        const spyAlert = vi.spyOn(component, 'openAlert');
        mockEvent.target.files = [
          new File([''], 'malicious_payload.exe', { type: 'application/x-msdownload' }),
        ];

        await component.onFileSelected(mockEvent);

        expect(spyAlert).toHaveBeenCalledWith('Invalid File Type', expect.any(String));
        expect(mockEvent.target.value).toBe('');
      });

      it('should reject data sets exceeding the strict 2MB constraint boundary', async () => {
        const spyAlert = vi.spyOn(component, 'openAlert');
        const largeBlob = new Blob([new ArrayBuffer(2.1 * 1024 * 1024)]); // 2.1 MB
        mockEvent.target.files = [largeBlob as File];
        Object.defineProperty(mockEvent.target.files[0], 'name', { value: 'huge_tx.psbt' });

        await component.onFileSelected(mockEvent);

        expect(spyAlert).toHaveBeenCalledWith('File Too Large', expect.any(String));
        expect(mockEvent.target.value).toBe('');
      });

      it('should parse valid signatures, delegate to storage socket, and notify proxy channel', async () => {
        const mockFile = new File(['valid-psbt-data'], 'signer_output.psbt');
        mockEvent.target.files = [mockFile];

        mockSocketService.sdk.parsePsbtFile.mockResolvedValue('parsed_base64_psbt_string');
        mockSocketService.uploadSignature.mockResolvedValue(true);

        await component.onFileSelected(mockEvent);

        expect(component.isUploading()).toBe(false);
        expect(mockSocketService.sdk.parsePsbtFile).toHaveBeenCalledWith(mockFile);
        expect(mockSocketService.uploadSignature).toHaveBeenCalledWith('parsed_base64_psbt_string');
        expect(mockDispatcher.emitPsbtImported).toHaveBeenCalledWith('upload');
        expect(mockEvent.target.value).toBe('');
      });
    });

    describe('PSBT Extraction Workflows', () => {
      it('promptPsbtDownload should activate targeting viewport flag modal', () => {
        component.promptPsbtDownload();
        expect(component.showPsbtModal()).toBe(true);
      });

      it('executePsbtDownload should log transactional state audit trail and call local storage download hook', async () => {
        const downloadSpy = vi
          .spyOn(component, 'downloadUnsignedPsbt')
          .mockImplementation(() => {});

        await component.executePsbtDownload();

        expect(component.showPsbtModal()).toBe(false);
        expect(mockSocketService.logAction).toHaveBeenCalledWith(
          'PSBT Downloaded',
          expect.any(String),
        );
        expect(downloadSpy).toHaveBeenCalled();
      });

      it('downloadUnsignedPsbt should stop execution if room state holds no psbt footprint', () => {
        mockSocketService.roomState.set(null);
        const blobSpy = vi.spyOn(globalThis, 'Blob');

        component.downloadUnsignedPsbt();
        expect(blobSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('Room Management, Roles, Whitelists & Finalization', () => {
    describe('Room Control & Roles', () => {
      let setItemSpy: any;

      beforeEach(() => {
        setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      });

      afterEach(() => {
        setItemSpy.mockRestore();
      });

      it('claimRole should save token to sessionStorage and escalate privileges', () => {
        component.roomId.set('test-room');
        component.claimPassword = 'admin-secret-token';

        //const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem');

        component.claimRole();

        //expect(setItemSpy).toHaveBeenCalledWith('admin_token_test-room', 'admin-secret-token');
        expect(mockSocketService.claimCoordinator).toHaveBeenCalledWith('admin-secret-token');
        expect(component.showClaimInput()).toBe(false);
        expect(component.claimPassword).toBe('');

        // Cleanup
        setItemSpy.mockRestore();
      });

      it('closeRoom should emit warning modal context and stage confirmation', () => {
        component.closeRoom();

        expect(mockDispatcher.emitModalView).toHaveBeenCalledWith('Close Room Warning');
        expect(component.showConfirmModal()).toBe(true);
        expect(component.confirmData().title).toBe('Close Room');
        expect(component.confirmData().isDestructive).toBe(true);
      });

      it('saveRoomName should cap at 64 chars, emit to dispatcher, and close modal', () => {
        const overLimitName = 'A'.repeat(70);
        component.newRoomName.set(overLimitName);

        component.saveRoomName();

        expect(mockSocketService.renameRoom).toHaveBeenCalledWith('A'.repeat(64));
        expect(mockDispatcher.emitRoomRenamed).toHaveBeenCalledWith('A'.repeat(64));
        expect(component.showRenameModal()).toBe(false);
      });

      it('toggleLock should open confirmation with dynamic messaging based on current locked state', () => {
        mockSocketService.roomState.set({ isLocked: false });
        component.toggleLock();

        expect(component.confirmData().title).toBe('LOCK Room');
        expect(component.confirmData().isDestructive).toBe(true);
      });
    });

    describe('Whitelisting & Verification Sequences', () => {
      beforeEach(() => {
        mockSocketService.txDetails.set({
          inputsList: [{ address: 'in1' }, { address: 'in2' }],
          outputs: [
            { address: 'out1', isChange: false },
            { address: 'out2', isChange: false },
          ],
        });
        mockSocketService.roomState.set({ whitelist: ['in1'] }); // in1 is verified, in2 is not
        mockSocketService.updateWhitelist = vi.fn();
      });

      it('toggleWhitelist should prompt confirm modal to add/remove specific address', () => {
        component.toggleWhitelist('in2'); // Currently not present
        expect(component.confirmData().title).toBe('Update Whitelist');

        // Execute the callback stored in the modal state
        component.executeConfirmAction();

        expect(mockSocketService.updateWhitelist).toHaveBeenCalledWith(['in2'], false);
        expect(mockDispatcher.emitDestinationVerified).toHaveBeenCalled();
      });

      it('verifyAllInputs should batch add all unverified inputs to whitelist', () => {
        component.verifyAllInputs();
        expect(mockSocketService.updateWhitelist).toHaveBeenCalledWith(['in2'], false);
      });

      it('verifyAllOutputs should prompt batch confirmation and add unverified outputs', () => {
        component.verifyAllOutputs();
        expect(component.showConfirmModal()).toBe(true);

        component.executeConfirmAction();
        expect(mockSocketService.updateWhitelist).toHaveBeenCalledWith(['out1', 'out2'], false);
      });
    });

    describe('Finalization & Broadcasting', () => {
      beforeEach(() => {
        vi.spyOn(component as any, 'triggerConfetti').mockImplementation(() => {});
      });

      it('finalize should execute immediately if no unverified outputs exist', () => {
        mockSocketService.roomState.set({ whitelist: ['out1'] });
        mockSocketService.txDetails.set({ outputs: [{ address: 'out1', isChange: false }] });
        mockSocketService.getFinalTxHex = vi.fn().mockReturnValue('mock-hex');
        mockSocketService.getFinalTxId = vi.fn().mockReturnValue('mock-txid');
        mockSocketService.finalizeTransaction = vi.fn();

        component.finalize();
        expect(mockSocketService.finalizeTransaction).toHaveBeenCalled();
      });

      it('finalize should intercept and warn if unverified destinations exist', () => {
        // out2 is missing from whitelist
        mockSocketService.roomState.set({ whitelist: ['out1'] });
        mockSocketService.txDetails.set({
          outputs: [
            { address: 'out1', isChange: false },
            { address: 'out2', isChange: false },
          ],
        });
        mockSocketService.finalizeTransaction = vi.fn();

        component.finalize();

        expect(mockSocketService.finalizeTransaction).not.toHaveBeenCalled();
        expect(component.showConfirmModal()).toBe(true);
        expect(component.confirmData().title).toBe('Security Warning');
      });

      it('broadcastAndCopy should push raw hex to mempool block explorer depending on network', () => {
        mockSocketService.roomState.set({ finalTxHex: 'final-hex', network: 'testnet' });
        const windowSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        Object.defineProperty(globalThis.navigator, 'clipboard', {
          value: { writeText: vi.fn() },
          configurable: true,
        });

        component.broadcastAndCopy();

        expect(windowSpy).toHaveBeenCalledWith('https://mempool.space/testnet/tx/push', '_blank');
      });
    });
  });

  describe('Air-Gapped Workflows & Privacy Blur', () => {
    describe('Privacy Blur Controls', () => {
      it('togglePrivacyBlur should stage section for unblur and show warning if currently blurred', () => {
        component.blurStates.set({ 'transaction-overview': true } as any);
        component.togglePrivacyBlur('transaction-overview');

        expect(component.pendingUnblurSection()).toBe('transaction-overview');
        expect(component.showPrivacyWarning()).toBe(true);
        expect(mockDispatcher.emitModalView).toHaveBeenCalledWith(
          'Toggle Privacy Warning',
          'transaction-overview',
        );
      });

      it('togglePrivacyBlur should instantly re-blur if currently revealed', () => {
        component.blurStates.set({ 'transaction-overview': false } as any);
        component.togglePrivacyBlur('transaction-overview');

        expect(component.blurStates()['transaction-overview']).toBe(true);
        expect(mockSocketService.logAction).toHaveBeenCalledWith(
          'Privacy Toggle',
          'Re-blurred transaction-overview section',
        );
        expect(mockDispatcher.emitPrivacyToggle).toHaveBeenCalledWith(
          'transaction-overview',
          'hidden',
        );
      });

      it('confirmUnblur should reveal the pending section and dismiss warning', () => {
        component.pendingUnblurSection.set('signers');
        component.confirmUnblur();

        expect(component.blurStates()['signers']).toBe(false);
        expect(component.showPrivacyWarning()).toBe(false);
        expect(component.pendingUnblurSection()).toBeNull();
        expect(mockDispatcher.emitPrivacyToggle).toHaveBeenCalledWith('signers', 'reveal-section');
      });

      it('confirmUnblurAll should reveal all sections simultaneously', () => {
        component.confirmUnblurAll();

        const states = component.blurStates();
        expect(states['transaction-overview']).toBe(false);
        expect(states['transaction-proposal']).toBe(false);
        expect(states['transaction-details']).toBe(false);
        expect(states['signers']).toBe(false);

        expect(component.showPrivacyWarning()).toBe(false);
        expect(mockDispatcher.emitPrivacyToggle).toHaveBeenCalledWith('all', 'reveal-all');
      });

      it('closePrivacyWarning should dismiss without revealing', () => {
        component.pendingUnblurSection.set('signers');
        component.closePrivacyWarning();

        expect(component.showPrivacyWarning()).toBe(false);
        expect(component.pendingUnblurSection()).toBeNull();
        expect(mockDispatcher.emitPrivacyToggle).toHaveBeenCalledWith('signers', 'blurred');
      });
    });

    describe('Fountain UR Generation (Exhale)', () => {
      it('openFountainModal should prepare frames and set initial state', () => {
        const spy = vi.spyOn(component, 'regenerateFrames');
        component.openFountainModal();

        expect(spy).toHaveBeenCalled();
        expect(component.showFountainModal()).toBe(true);
        expect(component.isFountainRevealed()).toBe(false);
      });

      it('setExportFormat should update format and regenerate frames', () => {
        const spy = vi.spyOn(component, 'regenerateFrames');
        component.showFountainModal.set(true);

        component.setExportFormat('bbqr');

        expect(component.exportFormat()).toBe('bbqr');
        expect(spy).toHaveBeenCalled();
        expect(mockDispatcher.emitFountainFormatChanged).toHaveBeenCalledWith('bbqr');
      });

      it('regenerateFrames should use appropriate UrService method based on format', () => {
        mockSocketService.roomState.set({ psbt: 'test-psbt' });

        component.exportFormat.set('ur');
        component.regenerateFrames();
        expect(mockUrService.generateFrames).toHaveBeenCalledWith('test-psbt');

        component.exportFormat.set('bbqr');
        component.regenerateFrames();
        expect(mockUrService.generateBBQrFrames).toHaveBeenCalledWith('test-psbt');
      });

      it('toggleFountainReveal should handle privacy toggle and animation lifecycle', () => {
        const startSpy = vi.spyOn(component, 'startFountainAnimation').mockImplementation(() => {});
        const stopSpy = vi.spyOn(component, 'stopFountainAnimation').mockImplementation(() => {});

        // Reveal
        component.isFountainRevealed.set(false);
        component.toggleFountainReveal();
        expect(component.isFountainRevealed()).toBe(true);
        expect(startSpy).toHaveBeenCalled();

        // Hide
        component.toggleFountainReveal();
        expect(component.isFountainRevealed()).toBe(false);
        expect(stopSpy).toHaveBeenCalled();
      });

      it('updateFountainSpeed should update speed and restart animation if revealed', () => {
        const startSpy = vi.spyOn(component, 'startFountainAnimation').mockImplementation(() => {});
        component.isFountainRevealed.set(true);
        component.showFountainModal.set(true);

        component.updateFountainSpeed(500);

        expect(component.fountainSpeed()).toBe(500);
        expect(startSpy).toHaveBeenCalled();
      });
    });

    describe('Scanner Logic (Inhale)', () => {
      it('handleScanResult should process fragment and upload if full hex is decoded', async () => {
        const stopSpy = vi.spyOn(component, 'stopScanner').mockImplementation(() => {});
        const processSpy = vi
          .spyOn(component, 'processScannedSignature')
          .mockImplementation(() => Promise.resolve());

        mockUrService.processFragment.mockReturnValue('full-hex-string');

        component.handleScanResult('ur:bytes/1-2/fragment');

        expect(mockUrService.processFragment).toHaveBeenCalledWith('ur:bytes/1-2/fragment');
        expect(stopSpy).toHaveBeenCalled();
        expect(processSpy).toHaveBeenCalledWith('full-hex-string');
      });

      it('processScannedSignature should normalize base64 and upload signature', async () => {
        mockSocketService.uploadSignature.mockResolvedValue(true);

        // Simulating processing hex data ("deadbeef")
        await component.processScannedSignature('deadbeef');

        expect(mockSocketService.uploadSignature).toHaveBeenCalled();
        expect(mockDispatcher.emitPsbtImported).toHaveBeenCalledWith('scan');
      });
    });
  });
});

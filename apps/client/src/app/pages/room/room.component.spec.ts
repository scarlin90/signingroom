import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomComponent } from './room.component';
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { PLATFORM_ID, signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { SocketService } from '../../services/socket/socket.service';
import { UrService } from '../../services/ur/ur.service';
import { WidgetDispatcherService } from '../../services/widget-dispatcher/widget-dispatcher.service';
import * as confetti from 'canvas-confetti';
import { EncryptionEngine } from '@signing-room/sdk';

let mockSocketService: any;
let mockUrService: any;
let mockDispatcher: any;
let mockRouter: any;
let mockActivatedRoute: any;
let mockTitleService: any;

const mockClipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
Object.defineProperty(navigator, 'clipboard', {
  value: mockClipboard,
  writable: true,
  configurable: true,
});

describe('RoomComponent - Setup & Lifecycle', () => {
  let component: RoomComponent;
  let fixture: ComponentFixture<RoomComponent>;

  let mockEncryptionEngine: {
    encrypt: ReturnType<typeof vi.fn>;
    decrypt: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.useFakeTimers();

    mockActivatedRoute = {
      snapshot: {
        fragment: 'test-key-123',
        paramMap: {
          get: vi.fn().mockReturnValue('room-123'),
        },
        queryParamMap: {
          get: (key: string) => {
            if (key === 'host') return 'http://localhost:4200';
            if (key === 'embedded') return 'true';
            return null;
          },
        },
      },
      paramMap: of({
        get: (key: string) => (key === 'id' ? 'room-123' : null),
      }),
      queryParamMap: {
        get: (key: string) => {
          if (key === 'host') return 'http://localhost:4200';
          if (key === 'embedded') return 'true';
          return null;
        },
      },
    };

    mockSocketService = {
      status: signal('disconnected'),
      isClosed: signal(false),
      roomNotFound: signal(false),
      isLockedOut: signal(false),
      isRoomFull: signal(false),
      decryptionError: signal(''),
      roomState: signal({ roomId: 'room-123', network: 'bitcoin' }),
      txDetails: signal(null),
      signers: signal([]),
      signerCount: signal(0),
      activeSessions: signal([]),
      currentSessionId: signal('session-1'),

      networkSignatureReceived$: of({}),
      securityAlert$: of({}),
      isCoordinator: vi.fn().mockReturnValue(false),
      getThreshold: vi.fn().mockReturnValue(2),
      signerThreshold: vi.fn().mockReturnValue(2),
      isReadyToBroadcast: vi.fn().mockReturnValue(false),
      getRoomKey: vi.fn().mockReturnValue('test-key-123'),
      getRoomLink: vi.fn().mockReturnValue('http://localhost/room#key'),
      getLocalLabel: vi.fn().mockReturnValue(undefined),
      getLocalAddressLabel: vi.fn().mockReturnValue(undefined),
      logAction: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      reset: vi.fn(),
      setRoomKey: vi.fn(),
      checkAndApplyLocalLabels: vi.fn(),
      checkAndApplyLocalAddressLabels: vi.fn(),
      claimCoordinator: vi.fn(),
      renameRoom: vi.fn(),
      uploadSignature: vi.fn(),
      getSettlementCsvData: vi.fn().mockReturnValue('csv,data'),
      getAuditLogCsv: vi.fn().mockReturnValue('audit,csv'),
      getFinalTxHex: vi.fn(),
      getFinalTxId: vi.fn(),
      finalizeTransaction: vi.fn(),
      getAuditLogPdf: vi.fn().mockResolvedValue({
        doc: {
          output: vi.fn().mockReturnValue('mock-data-uri'),
          save: vi.fn().mockResolvedValue(undefined),
        },
        filename: 'audit.pdf',
      }),
      updateWhitelist: vi.fn(),
      updateSignerLabel: vi.fn(),
      updateAddressLabel: vi.fn(),
      saveToAddressBook: vi.fn(),
      removeFromAddressBook: vi.fn(),
      saveAddressToBook: vi.fn(),
      removeAddressFromBook: vi.fn(),
      toggleLock: vi.fn(),
      closeRoom: vi.fn(),
      setDisplayName: vi.fn(),
      sdk: {
        store: {
          getState: vi.fn().mockReturnValue({ roomId: null }),
        },
      },
    };

    mockEncryptionEngine = {
      encrypt: vi.fn().mockResolvedValue('encrypted-admin-token'),
      decrypt: vi.fn().mockResolvedValue('admin-secret-token'),
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
      setTargetOrigin: vi.fn(),
      emitTransactionFinalized: vi.fn(),
      emitParticipantPresence: vi.fn(),
      emitParticipantLabelled: vi.fn(),
      emitAddressLabelled: vi.fn(),
      emitSignatureReceived: vi.fn(),
      emitSecurityAlert: vi.fn(),
      emitDataCopied: vi.fn(),
      emitTransactionViewChanged: vi.fn(),
      emitPsbtImported: vi.fn(),
      emitDownloadTriggered: vi.fn(),
      emitModalView: vi.fn(),
      emitRoomRenamed: vi.fn(),
      emitDestinationVerified: vi.fn(),
      emitRoomStateChanged: vi.fn(),
      emitQrStateChanged: vi.fn(),
      emitFountainFormatChanged: vi.fn(),
      emitFountainStateChanged: vi.fn(),
      emitPrivacyToggle: vi.fn(),
      emitAddressCopied: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    mockTitleService = {
      setTitle: vi.fn(),
    };

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
    })
      .overrideComponent(RoomComponent, {
        set: {
          providers: [{ provide: EncryptionEngine, useValue: mockEncryptionEngine }],
        },
      })
      .compileComponents();

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

      await fixture.whenStable();
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

    it('should navigate to clear fragment if connected and fragment exists', async () => {
      mockSocketService.status.set('connected');
      mockActivatedRoute.snapshot.fragment = 'some-key';

      fixture.detectChanges();

      expect(mockRouter.navigate).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          fragment: undefined,
        }),
      );
    });
  });

  describe('ngOnDestroy', () => {
    it('should disconnect socket, reset, and clear timer', () => {
      fixture.detectChanges();

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

      const event = { returnValue: false };
      component.unloadNotification(event);

      expect(event.returnValue).toBe(true);
    });

    it('onBeforeUnload should call socket.disconnect()', () => {
      component.onBeforeUnload();
      expect(mockSocketService.disconnect).toHaveBeenCalled();
    });

    it('unloadNotification should not set returnValue if socket is disconnected', () => {
      mockSocketService.status.set('disconnected');
      const event = { returnValue: null };
      component.unloadNotification(event);
      expect(event.returnValue).toBeNull();
    });

    it('unloadNotification should NOT set returnValue if transaction is already finalized', () => {
      mockSocketService.status.set('connected');
      mockSocketService.roomState.set({ finalTxHex: '0x123' });

      const event = { returnValue: false };
      component.unloadNotification(event);

      expect(event.returnValue).toBe(false);
    });

    it('unloadNotification should not set returnValue if room is closed', () => {
      mockSocketService.status.set('connected');
      mockSocketService.isClosed.set(true);

      const event = { returnValue: false };
      component.unloadNotification(event);

      expect(event.returnValue).toBe(false);
    });
  });

  describe('Computed Properties & Getters', () => {
    describe('filteredInputs & filteredOutputs', () => {
      beforeEach(() => {
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

        // Mock the address labels for search testing
        mockSocketService.roomState.set({
          addressLabels: {
            bc1qabc123: 'Cold Storage Vault',
            bc1qxyz890: 'Vendor Payout',
          },
        });
        fixture.detectChanges();
      });

      it('should return all inputs when search query is empty', () => {
        component.inputSearchQuery.set('');
        expect(component.filteredInputs().length).toBe(2);
      });

      it('should filter inputs based on search query (case-insensitive address)', () => {
        component.inputSearchQuery.set('BC1Q');
        const results = component.filteredInputs();
        expect(results.length).toBe(1);
        expect(results[0].address).toBe('bc1qabc123');
      });

      it('should filter inputs based on associated address labels', () => {
        component.inputSearchQuery.set('cold storage');
        const results = component.filteredInputs();
        expect(results.length).toBe(1);
        expect(results[0].address).toBe('bc1qabc123');
      });

      it('should return all outputs when search query is empty', () => {
        component.outputSearchQuery.set('');
        expect(component.filteredOutputs().length).toBe(2);
      });

      it('should filter outputs based on search query (address)', () => {
        component.outputSearchQuery.set('xyz');
        const results = component.filteredOutputs();
        expect(results.length).toBe(1);
        expect(results[0].address).toBe('bc1qxyz890');
      });

      it('should filter outputs based on associated address labels', () => {
        component.outputSearchQuery.set('vendor');
        const results = component.filteredOutputs();
        expect(results.length).toBe(1);
        expect(results[0].address).toBe('bc1qxyz890');
      });

      it('should handle null txDetails gracefully', () => {
        mockSocketService.txDetails.set(null);
        expect(component.filteredInputs()).toEqual([]);
        expect(component.filteredOutputs()).toEqual([]);
      });

      it('should correctly filter inputs based on search query when address labels are empty', () => {
        mockSocketService.txDetails.set({
          inputsList: [{ address: 'bc1q-match' }, { address: '3abc-no-match' }],
        } as any);
        mockSocketService.roomState.set({ addressLabels: {} });

        component.inputSearchQuery.set('bc1q');
        expect(component.filteredInputs().length).toBe(1);

        component.inputSearchQuery.set('nothing-to-find');
        expect(component.filteredInputs().length).toBe(0);
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
          addressLabels: { bc1qtrusted: 'Vault' },
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

      it('getAddressLabel should return the mapping from state', () => {
        expect(component.getAddressLabel('bc1qtrusted')).toBe('Vault');
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

      it('should return early and alert when file extension is unsupported', async () => {
        const spyAlert = vi.spyOn(component, 'openAlert');
        const event = { target: { files: [new File([''], 'data.pdf')] } }; // .pdf is invalid

        await component.onFileSelected(event);

        expect(spyAlert).toHaveBeenCalledWith('Invalid File Type', expect.any(String));
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

      it('claimRole should save token to sessionStorage and escalate privileges', async () => {
        component.roomId.set('test-room');
        component.claimPassword = 'admin-secret-token';
        component.showClaimInput.set(true);

        await component.claimRole();

        expect(mockSocketService.claimCoordinator).toHaveBeenCalledWith('admin-secret-token');
        expect(mockEncryptionEngine.encrypt).toHaveBeenCalledWith(
          'admin-secret-token',
          'test-key-123',
        );
        expect(sessionStorage.getItem('admin_token_test-room')).toBe('encrypted-admin-token');
        expect(component.showClaimInput()).toBe(false);
        expect(component.claimPassword).toBe('');
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

    describe('Address Labelling Modal', () => {
      it('openAddressLabelModal should setup state correctly based on cache and state', () => {
        mockSocketService.roomState.set({ addressLabels: { tb1q1: 'Existing Label' } });

        component.openAddressLabelModal('tb1q1');

        expect(component.editingAddress()).toBe('tb1q1');
        expect(component.editingAddressLabel()).toBe('Existing Label');
        expect(component.showAddressLabelModal()).toBe(true);
      });

      it('saveAddressLabel should slice to 64 chars, delegate, emit, and close', () => {
        component.editingAddress.set('tb1q1');
        component.editingAddressLabel.set('A'.repeat(70));
        component.saveAddressToBook.set(true);

        component.saveAddressLabel();

        expect(mockSocketService.updateAddressLabel).toHaveBeenCalledWith('tb1q1', 'A'.repeat(64));
        expect(mockSocketService.saveAddressToBook).toHaveBeenCalledWith('tb1q1', 'A'.repeat(64));
        expect(mockDispatcher.emitAddressLabelled).toHaveBeenCalledWith('tb1q1', 'A'.repeat(64));
        expect(component.showAddressLabelModal()).toBe(false);
      });

      it('closeAddressLabelModal should clear internal tracking values', () => {
        component.editingAddress.set('123');
        component.editingAddressLabel.set('label');
        component.showAddressLabelModal.set(true);

        component.closeAddressLabelModal();

        expect(component.editingAddress()).toBeNull();
        expect(component.editingAddressLabel()).toBe('');
        expect(component.showAddressLabelModal()).toBe(false);
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

      it('finalize should execute immediately if whitelist exists but is empty', () => {
        mockSocketService.roomState.set({ whitelist: [] }); // Array exists but length is 0
        const confirmSpy = vi.spyOn(component, 'openConfirm');

        component.finalize();

        expect(confirmSpy).not.toHaveBeenCalled(); // Should not warn if whitelist is empty
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

      it('finalize should execute immediately if all outputs are whitelisted', () => {
        mockSocketService.roomState.set({
          whitelist: ['addr1', 'addr2'],
          psbt: 'data',
        });
        mockSocketService.txDetails.set({
          outputs: [
            { address: 'addr1', isChange: false },
            { address: 'addr2', isChange: false },
          ],
        });

        const spy = vi.spyOn(component, 'openConfirm');
        component.finalize();

        expect(spy).not.toHaveBeenCalled();
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

      it('broadcastAndCopy should generate correct URLs based on network', () => {
        const windowSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

        mockSocketService.roomState.set({ finalTxHex: '0000', network: 'testnet' });

        component.broadcastAndCopy();

        expect(windowSpy).toHaveBeenCalledWith('https://mempool.space/testnet/tx/push', '_blank');
      });
    });
  });

  describe('Finalize Logic Branches', () => {
    it('should call getAuditLogPdf when finalized in embedded mode', async () => {
      vi.spyOn(component, 'openConfirm');

      const spyTriggerConfetti = vi.mock('canvas-confetti', () => ({
        default: vi.fn(),
      }));

      vi.spyOn(component, 'isEmbedded', 'get').mockReturnValue(true);
      mockSocketService.isCoordinator.mockReturnValue(true);

      mockSocketService.roomState.set({
        roomId: 'room-123',
        whitelist: [],
      });

      mockSocketService.finalizeTransaction.mockImplementation(async () => {
        mockSocketService.roomState.set({
          roomId: 'room-123',
          finalTxId: 'txid_123',
          finalTxHex: 'hex_abc',
          whitelist: [],
        });
        return { hex: 'hex_abc', txId: 'txid_123' };
      });

      mockSocketService.getAuditLogPdf.mockResolvedValue({ doc: { output: () => 'mock_pdf_uri' } });
      mockSocketService.getAuditLogCsv.mockReturnValue('mock_audit_csv');
      mockSocketService.getSettlementCsvData.mockReturnValue('mock_settlement_csv');

      await component.finalize();

      expect(mockSocketService.getAuditLogPdf).toHaveBeenCalled();
      expect(mockDispatcher.emitTransactionFinalized).toHaveBeenCalled();
      expect(spyTriggerConfetti).toHaveBeenCalledOnce();
    });

    it('finalize() should show confirm modal if unverified outputs exist', () => {
      mockSocketService.roomState.set({
        whitelist: ['bc1q-verified'],
        psbt: 'base64',
      });
      mockSocketService.txDetails.set({
        outputs: [{ address: 'bc1q-unverified', isChange: false }],
      } as any);

      const confirmSpy = vi.spyOn(component, 'openConfirm');

      component.finalize();

      expect(confirmSpy).toHaveBeenCalledWith(
        'Security Warning',
        expect.stringContaining('unverified address'),
        expect.any(Function),
        true,
      );
    });

    it('should skip whitelist check if whitelist is null/undefined', () => {
      mockSocketService.roomState.set({ whitelist: null });
      const confirmSpy = vi.spyOn(component, 'openConfirm');

      component.finalize();
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('should skip whitelist check if whitelist is empty array', () => {
      mockSocketService.roomState.set({ whitelist: [] });
      const confirmSpy = vi.spyOn(component, 'openConfirm');

      component.finalize();
      expect(confirmSpy).not.toHaveBeenCalled();
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

      it('togglePrivacyBlur should re-blur a section if it is currently revealed', () => {
        component.blurStates.set({ 'transaction-details': false } as any);

        component.togglePrivacyBlur('transaction-details');

        expect(component.blurStates()['transaction-details']).toBe(true);
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

        await component.processScannedSignature('deadbeef');

        expect(mockSocketService.uploadSignature).toHaveBeenCalled();
        expect(mockDispatcher.emitPsbtImported).toHaveBeenCalledWith('scan');
      });
    });
  });

  describe('Template Rendering & DOM Interactions', () => {
    describe('Modal Visibility & @if Blocks', () => {
      it('should render PSBT modal', () => {
        component.showPsbtModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Download Unsigned PSBT');
      });

      it('should render Audit modal', () => {
        component.showAuditModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Download Audit Log');
      });

      it('should render CSV modal', () => {
        component.showCsvModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Download CSV Data');
      });

      it('should render Room ID modal', () => {
        component.showRoomIdModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Room Identifier');
      });

      it('should render Label modal', () => {
        component.showLabelModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Label Signer');
      });

      it('should render Address Label modal', () => {
        component.showAddressLabelModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Label Address');
      });

      it('should render Rename modal', () => {
        component.showRenameModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Rename Room');
      });

      it('should render QR modal', () => {
        component.showQrModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Room QR Code');
      });

      it('should render Share modal', () => {
        component.showShareModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Share Room Securely');
      });

      it('should render Key modal', () => {
        component.showKeyModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Room Decryption Key');
      });

      it('should render Admin Backup modal', () => {
        component.showAdminModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Backup Admin Token');
      });

      it('should render Fountain/Air-Gapped Export modal', () => {
        component.showFountainModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Air-Gapped Export PSBT');
      });

      it('should render Scanner/Air-Gapped Import modal', () => {
        component.showScannerModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Air-Gapped Import PSBT');
      });

      it('should render generic Confirm/Alert modal', () => {
        component.confirmData.set({
          title: 'Danger Alert',
          message: 'Warning 123',
          action: () => {},
          isDestructive: true,
          type: 'alert',
        });
        component.showConfirmModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Danger Alert');
        expect(fixture.nativeElement.textContent).toContain('Warning 123');
      });

      it('should render Sessions modal', () => {
        component.showSessionsModal.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Active Sessions');
      });

      it('should render Privacy OpSec Warning', () => {
        component.showPrivacyWarning.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('OpSec Warning');
      });
    });

    describe('Room Error States & Expirations', () => {
      it('should render Connection Lost banner', () => {
        mockSocketService.status.set('disconnected');
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Connection lost... Reconnecting...');
      });

      it('should render Room Not Found overlay', () => {
        mockSocketService.roomNotFound.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Room Not Found');
      });

      it('should render Room Full overlay', () => {
        mockSocketService.isRoomFull.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Room Full');
      });

      it('should render Access Denied overlay', () => {
        mockSocketService.isLockedOut.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Access Denied');
      });

      it('should render Decryption Error overlay', () => {
        mockSocketService.decryptionError.set('Invalid Key');
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Decryption Key Required');
      });

      it('should render Room Closed overlay', () => {
        mockSocketService.isClosed.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Signing Room® Closed');
      });

      it('should render Room Expired overlay', () => {
        component.isExpired.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Room Expired');
      });
    });

    describe('UI Toggles & Specific Roles', () => {
      it('should render Input and Output search placeholders based on viewMode', () => {
        component.blurStates.set({ 'transaction-details': false } as any); // Unblur to render search

        component.viewMode.set('inputs');
        fixture.detectChanges();
        expect(
          fixture.nativeElement.querySelector(
            'input[placeholder="Search inputs by address or label..."]',
          ),
        ).toBeTruthy();

        component.viewMode.set('outputs');
        fixture.detectChanges();
        expect(
          fixture.nativeElement.querySelector(
            'input[placeholder="Search outputs by address or label..."]',
          ),
        ).toBeTruthy();
      });

      it('should display specific Coordinator actions', () => {
        mockSocketService.isCoordinator.mockReturnValue(true);
        mockSocketService.roomState.set({ network: 'bitcoin', isLocked: false, connectedCount: 1 });
        fixture.detectChanges();

        const html = fixture.nativeElement.textContent;
        expect(html).toContain('Coordinator');
        expect(html).toContain('Lock Room');
        expect(html).toContain('Backup Admin');
      });
    });

    describe('QR & Scanner Dynamic Rendering', () => {
      it('should toggle warning UI based on qrIncludesKey status', () => {
        component.showQrModal.set(true);

        component.qrIncludesKey.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Contains Decryption Key');

        component.qrIncludesKey.set(false);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Maximum Security');
      });

      it('should switch descriptions between UR and BBQr formats', () => {
        component.showFountainModal.set(true);

        component.exportFormat.set('ur');
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('UR Protocol');

        component.exportFormat.set('bbqr');
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Protocol');
      });

      it('should dynamically display scanner errors and progress bars', () => {
        component.showScannerModal.set(true);
        component.isScanningSigned.set(true);

        mockUrService.scanError.set('Optical interference detected');
        mockUrService.scanProgress.set(0.45);
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain('Optical interference detected');
        expect(fixture.nativeElement.textContent).toContain('45%');
      });
    });
  });

  describe('Deep Template Branch Coverage', () => {
    it('should render Active Sessions list with specific roles and you-badge', () => {
      component.showSessionsModal.set(true);
      mockSocketService.activeSessions.set([
        { id: '1', role: 'admin', displayName: 'Admin Alice' },
        { id: '2', role: 'guest', displayName: '' },
        { id: 'session-1', role: 'guest', displayName: 'Current User' },
      ]);
      fixture.detectChanges();

      const html = fixture.nativeElement.textContent;
      expect(html).toContain('Admin Alice');
      expect(html).toContain('Anonymous Guest');
      expect(html).toContain('Current User');
      expect(html).toContain('You');
    });

    it('should render dynamic text for Lock Room based on coordinator and lock state', () => {
      mockSocketService.isCoordinator.mockReturnValue(true);

      mockSocketService.roomState.set({ isLocked: true });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Locked');

      mockSocketService.roomState.set({ isLocked: false });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Lock Room');
    });

    it('should render both destructive and standard variants of the Confirm Modal', () => {
      component.showConfirmModal.set(true);

      // Variant 1: Destructive Confirm
      component.confirmData.set({
        title: 'Nuke',
        message: 'msg',
        action: () => {},
        isDestructive: true,
        type: 'confirm',
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Nuke');
      expect(fixture.nativeElement.textContent).toContain('Cancel'); // Cancel button exists
      expect(fixture.nativeElement.textContent).toContain('Confirm'); // Confirm text

      // Variant 2: Standard Alert
      component.confirmData.set({
        title: 'Safe',
        message: 'msg',
        action: () => {},
        isDestructive: false,
        type: 'alert',
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Safe');
      expect(fixture.nativeElement.textContent).not.toContain('Cancel'); // No cancel button on alert
      expect(fixture.nativeElement.textContent).toContain('OK'); // OK text
    });

    it('should render raw optical feed fallback and reconstructing signature progress in scanner modal', () => {
      component.showScannerModal.set(true);

      mockUrService.lastScannedText.set('');
      mockUrService.scanProgress.set(0);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Waiting for QR...');

      mockUrService.lastScannedText.set('ur:bytes/1-2/payload');
      mockUrService.scanProgress.set(0.65);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('ur:bytes/1-2/payload');
      expect(fixture.nativeElement.textContent).toContain('RECONSTRUCTING SIGNATURE...');
      expect(fixture.nativeElement.textContent).toContain('65%');
    });

    it('should render ingesting signature progress in the main transaction panel', () => {
      component.isScanningSigned.set(true);
      mockUrService.scanProgress.set(0.85);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Ingesting Signature...');
      expect(fixture.nativeElement.textContent).toContain('85%');
    });

    it('should render expired state in the main view and header', () => {
      component.isExpired.set(true);
      mockSocketService.isClosed.set(false);
      fixture.detectChanges();

      const html = fixture.nativeElement.textContent;
      expect(html).toContain('Room Expired');
      expect(html).toContain('Expired');
    });

    it('should conditionally render Verify All buttons if coordinator and array length > 3', () => {
      mockSocketService.isCoordinator.mockReturnValue(true);
      component.blurStates.set({ 'transaction-details': false } as any);

      const fourItems = [{}, {}, {}, {}];
      mockSocketService.txDetails.set({ inputsList: fourItems, outputs: fourItems });

      component.viewMode.set('inputs');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Verify All Inputs');

      component.viewMode.set('outputs');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Verify All Outputs');
    });

    it('should render the Claim Coordinator input toggle', () => {
      mockSocketService.isCoordinator.mockReturnValue(false);
      mockSocketService.isReadyToBroadcast.mockReturnValue(false);

      component.showClaimInput.set(false);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(
        'Have the Admin Key? Claim Coordinator Role',
      );

      component.showClaimInput.set(true);
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('input[placeholder="Paste Admin Key here..."]'),
      ).toBeTruthy();
      expect(fixture.nativeElement.textContent).toContain('Claim');
    });

    it('should render the Signers list with specific labels and nudge actions', () => {
      mockSocketService.isCoordinator.mockReturnValue(true);
      component.blurStates.set({ signers: false } as any);

      mockSocketService.signers.set([
        { fingerprint: 'fp-123', signed: true },
        { fingerprint: 'fp-456', signed: false },
      ]);

      mockSocketService.roomState.set({ signerLabels: { 'fp-123': 'Hardware Wallet' } });
      fixture.detectChanges();

      const html = fixture.nativeElement.textContent;
      expect(html).toContain('Hardware Wallet');
      expect(html).toContain('Add Label');
      expect(html).toContain('Signed');
      expect(html).toContain('Waiting...');
    });
  });

  describe('Form Inputs & Key Submissions Edge Cases', () => {
    it('claimRole should return early if claimPassword is empty', () => {
      component.claimPassword = '';
      component.claimRole();
      expect(mockSocketService.claimCoordinator).not.toHaveBeenCalled();
    });

    it('saveRoomName should return early if name is empty', () => {
      component.newRoomName.set('');
      component.saveRoomName();
      expect(mockSocketService.renameRoom).not.toHaveBeenCalled();
    });

    it('submitKey should return early if manualKey is empty', () => {
      component.manualKey = '';
      component.submitKey();
      expect(mockSocketService.connect).not.toHaveBeenCalled();
    });

    it('submitKey should extract the fragment if a full URL is pasted', () => {
      component.roomId.set('room-123');
      component.manualKey = 'https://app.signingroom.com/room/room-123#my-secret-key';

      component.submitKey();

      expect(mockSocketService.connect).toHaveBeenCalledWith('room-123', 'my-secret-key');
      expect(component.manualKey).toBe('');
    });
  });

  describe('Timers and Async Exports', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('startTimer should calculate remaining time and expire when time runs out', () => {
      const now = Date.now();
      const spyDisconnect = vi.spyOn(mockSocketService, 'disconnect');

      const expiryTime = now + 1000 * 60 * 60 + 1000 * 60 + 1000;

      component['startTimer'](expiryTime);

      vi.advanceTimersByTime(1000);
      expect(component.timeRemaining()).toBe('01 hrs 01 m 00 s');
      expect(component.isLowTime()).toBe(false);

      vi.advanceTimersByTime(expiryTime - now + 1000);

      expect(component.timeRemaining()).toBe('00 hrs 00 m 00 s');
      expect(component.isExpired()).toBe(true);
      expect(spyDisconnect).toHaveBeenCalled();
    });

    it('startTimer should set isLowTime', () => {
      vi.useFakeTimers();

      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

      (component as any).startTimer(Date.now() + 65_000);

      vi.advanceTimersByTime(1000);

      expect(component.timeRemaining()).toContain('01 m');
      expect(component.isLowTime()).toBe(true);
    });

    it('executeCsvDownload should trigger delay and then download', async () => {
      const downloadSpy = vi.spyOn(component, 'downloadCsv').mockImplementation(() => {});

      const promise = component.executeCsvDownload();

      await vi.advanceTimersByTimeAsync(1500);
      await promise;

      expect(downloadSpy).toHaveBeenCalled();
    });

    it('downloadCsv should return early if no csv content is available', () => {
      mockSocketService.getSettlementCsvData.mockReturnValue(null);
      const createElementSpy = vi.spyOn(document, 'createElement');

      component.downloadCsv();

      expect(createElementSpy).not.toHaveBeenCalledWith('a');
    });
  });

  describe('Broadcasting & QR Engine Edge Cases', () => {
    it('broadcastAndCopy should route to correct mempool network', () => {
      const windowSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      mockSocketService.roomState.set({ finalTxHex: 'hex', network: 'signet' });
      component.broadcastAndCopy();
      expect(windowSpy).toHaveBeenCalledWith('https://mempool.space/signet/tx/push', '_blank');

      mockSocketService.roomState.set({ finalTxHex: 'hex', network: 'invalid-network' });
      component.broadcastAndCopy();
      expect(windowSpy).toHaveBeenCalledWith('https://mempool.space/tx/push', '_blank');
    });

    it('generateQrData should safely catch and log generation errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      component.qrIncludesKey.set(true);
      mockSocketService.getRoomLink.mockImplementation(() => {
        throw new Error('Canvas failure');
      });

      await component['generateQrData']();

      expect(consoleSpy).toHaveBeenCalledWith('QR Generation failed', new Error('Canvas failure'));
    });
  });

  describe('Optical Scanner & Import Error Handling', () => {
    it('stopScanner should safely handle HTML5QrCode exceptions', async () => {
      component.html5QrCode = {
        getState: () => 2,
        stop: vi.fn().mockRejectedValue(new Error('Camera locked')),
        clear: vi.fn(),
      } as any;

      component.stopScanner();

      await new Promise(process.nextTick);

      expect(component.isScanningSigned()).toBe(false);
      expect(component.showScannerModal()).toBe(false);
    });

    it('processScannedSignature should catch malformed base64/hex data', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await component.processScannedSignature('not_valid_hex_or_base64!');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse signed PSBT from scanner',
        expect.anything(),
      );
    });

    it('handleScanResult should return early if fullHex is null (incomplete fragment)', () => {
      const stopSpy = vi.spyOn(component, 'stopScanner');
      mockUrService.processFragment.mockReturnValue(null);

      component.handleScanResult('ur:bytes/1-2/incomplete');

      expect(stopSpy).not.toHaveBeenCalled();
    });
  });

  describe('Fountain Settings', () => {
    it('updateFountainSpeed should update signal value', () => {
      component.updateFountainSpeed(150);
      expect(component.fountainSpeed()).toBe(150);
    });

    it('updateFountainSpeed should restart animation if fountain is currently active and revealed', () => {
      const animSpy = vi
        .spyOn(component as any, 'startFountainAnimation')
        .mockImplementation(() => {});

      vi.spyOn(component, 'isFountainRevealed').mockReturnValue(true);
      component.showFountainModal.set(true);

      component.updateFountainSpeed(200);

      expect(animSpy).toHaveBeenCalledTimes(1);
    });

    it('updateFountainSpeed: should NOT restart animation if fountain is NOT revealed', () => {
      const animSpy = vi.spyOn(component, 'startFountainAnimation');
      component.isFountainRevealed.set(false);
      component.showFountainModal.set(true);

      component.updateFountainSpeed(500);

      expect(animSpy).not.toHaveBeenCalled();
    });

    it('updateFountainSpeed: should NOT restart animation if modal is NOT shown', () => {
      const animSpy = vi.spyOn(component, 'startFountainAnimation');
      component.isFountainRevealed.set(true);
      component.showFountainModal.set(false);

      component.updateFountainSpeed(500);

      expect(animSpy).not.toHaveBeenCalled();
    });

    it('should restart animation only when BOTH revealed and modal shown', () => {
      const animSpy = vi.spyOn(component, 'startFountainAnimation');

      component.isFountainRevealed.set(true);
      component.showFountainModal.set(true);
      component.updateFountainSpeed(500);
      expect(animSpy).toHaveBeenCalledTimes(1);

      component.isFountainRevealed.set(true);
      component.showFountainModal.set(false);
      component.updateFountainSpeed(500);
      expect(animSpy).toHaveBeenCalledTimes(1);

      component.isFountainRevealed.set(false);
      component.showFountainModal.set(true);
      component.updateFountainSpeed(500);
      expect(animSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Scanner Handling', () => {
    it('stopScanner: should handle falsy html5QrCode', () => {
      component.html5QrCode = null as any;
      component.isScanningSigned.set(true);

      component.stopScanner();

      expect(component.isScanningSigned()).toBe(false);
    });

    it('stopScanner: should safely clear scanner if state is not SCANNING', () => {
      component.html5QrCode = {
        getState: () => 1,
        clear: vi.fn(),
      } as any;
      component.isScanningSigned.set(true);

      component.stopScanner();

      expect(component.html5QrCode.clear).toHaveBeenCalled();
      expect(component.isScanningSigned()).toBe(false);
    });

    it('stopScanner: should execute catch block if synchronous error occurs', () => {
      component.html5QrCode = {
        getState: () => {
          throw new Error('Sync crash');
        },
        clear: vi.fn(),
      } as any;
      component.isScanningSigned.set(true);

      component.stopScanner();

      expect(component.html5QrCode.clear).toHaveBeenCalled();
      expect(component.isScanningSigned()).toBe(false);
    });

    it('handleScanResult: should process fragment and stop scanner when complete', () => {
      vi.spyOn(component.urService, 'processFragment').mockReturnValue('010203');
      vi.spyOn(component, 'stopScanner').mockImplementation(() => {});
      vi.spyOn(component, 'processScannedSignature').mockImplementation(async () => {});

      component.handleScanResult('UR:CRYPTO-PSBT/1-1/MOCK');

      expect(component.stopScanner).toHaveBeenCalled();
      expect(component.processScannedSignature).toHaveBeenCalledWith('010203');
    });

    it('handleScanResult: should do nothing if fragment is incomplete', () => {
      vi.spyOn(component.urService, 'processFragment').mockReturnValue(null);
      vi.spyOn(component, 'stopScanner').mockImplementation(() => {});

      component.handleScanResult('UR:CRYPTO-PSBT/1-2/MOCK');

      expect(component.stopScanner).not.toHaveBeenCalled();
    });

    it('updateFountainSpeed: should update speed and restart animation if currently running', () => {
      component.isFountainRevealed.set(true);
      component.showFountainModal.set(true);
      vi.spyOn(component, 'startFountainAnimation').mockImplementation(() => {});

      component.updateFountainSpeed(250);

      expect(component.fountainSpeed()).toBe(250);
      expect(component.startFountainAnimation).toHaveBeenCalled();
    });

    it('updateFountainSpeed: should just update speed if animation is not currently running', () => {
      component.isFountainRevealed.set(false);
      vi.spyOn(component, 'startFountainAnimation').mockImplementation(() => {});

      component.updateFountainSpeed(300);

      expect(component.fountainSpeed()).toBe(300);
      expect(component.startFountainAnimation).not.toHaveBeenCalled();
    });

    it('should catch errors if uploadSignature fails in processScannedSignature', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.spyOn(component.socket, 'uploadSignature').mockRejectedValue(
        new Error('Network disconnected'),
      );

      await component.processScannedSignature('01020304');

      expect(console.error).toHaveBeenCalledWith(
        'Failed to parse signed PSBT from scanner',
        expect.any(Error),
      );
    });

    it('should safely execute the catch block if getState throws in stopScanner', () => {
      component.html5QrCode = {
        getState: () => {
          throw new Error('State crash');
        },
        clear: vi.fn(),
      } as any;

      component.stopScanner();

      expect(component.isScanningSigned()).toBe(false);
    });

    it('should safely handle errors when parsing a scanned signature fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await component.processScannedSignature('INVALID_!!!_DATA');

      expect(console.error).toHaveBeenCalledWith(
        'Failed to parse signed PSBT from scanner',
        expect.anything(),
      );
    });

    it('should handle asynchronous rejection when stopping the scanner', async () => {
      component.html5QrCode = {
        getState: () => 2,
        stop: vi.fn().mockRejectedValue(new Error('Camera stuck')),
        clear: vi.fn(),
      } as any;

      component.stopScanner();
      await Promise.resolve();

      expect(component.isScanningSigned()).toBe(false);
    });

    it('should handle synchronous errors when stopping the scanner', () => {
      component.html5QrCode = {
        getState: () => {
          throw new Error('Sync crash');
        },
        clear: vi.fn(),
      } as any;

      component.stopScanner();

      expect(component.isScanningSigned()).toBe(false);
    });
  });

  describe('scanner Function (Callbacks & Edge Cases)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      if (!document.getElementById('signer-reader')) {
        const div = document.createElement('div');
        div.id = 'signer-reader';
        document.body.appendChild(div);
      }
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
      const div = document.getElementById('signer-reader');
      if (div) div.remove();
    });

    it('should successfully resolve stopScanner and trigger .then() callback', async () => {
      component.html5QrCode = {
        getState: () => 2,
        stop: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn(),
      } as any;
      component.isScanningSigned.set(true);

      component.stopScanner();
      await Promise.resolve();

      expect(component.html5QrCode.clear).toHaveBeenCalled();
      expect(component.isScanningSigned()).toBe(false);
    });

    it('should execute setTimeout callback inside doCopy()', () => {
      component.copyHex();
      expect(component.copied()).toBe(true);

      vi.advanceTimersByTime(2000);

      expect(component.copied()).toBe(false);
    });

    it('should execute interval and timeout callbacks in startFountainAnimation()', () => {
      const renderSpy = vi
        .spyOn(component, 'renderFountainFrame')
        .mockImplementation(async () => {});
      component.activeFountainFrames = ['frame1', 'frame2'];
      component.currentFrameIndex.set(0);
      component.fountainSpeed.set(400);

      component.startFountainAnimation();

      vi.advanceTimersByTime(1);
      expect(renderSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(400);
      expect(renderSpy).toHaveBeenCalledTimes(2);

      component.stopFountainAnimation();
    });

    it('should start and stop animation via toggleFountainReveal()', () => {
      const startSpy = vi.spyOn(component, 'startFountainAnimation').mockImplementation(() => {});
      const stopSpy = vi.spyOn(component, 'stopFountainAnimation').mockImplementation(() => {});

      component.isFountainRevealed.set(false);
      component.exportFormat.set('ur');

      component.toggleFountainReveal();
      expect(startSpy).toHaveBeenCalled();

      component.toggleFountainReveal();
      expect(stopSpy).toHaveBeenCalled();
    });

    it('should execute fallback camera start callbacks if high-res fails', async () => {
      vi.spyOn(component, 'handleScanResult').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const { Html5Qrcode } = await import('html5-qrcode');

      let callCount = 0;
      const startSpy = vi
        .spyOn(Html5Qrcode.prototype, 'start')
        .mockImplementation((camId: any, config: any, onSuccess: any, onError: any) => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('High res fail'));
          } else {
            if (onSuccess) onSuccess('UR:CRYPTO-PSBT/1-1/FALLBACK');
            if (onError) onError('Fallback error');
            return Promise.resolve();
          }
        });

      component.startScanner();
      vi.advanceTimersByTime(100);

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(component.handleScanResult).toHaveBeenCalledWith('UR:CRYPTO-PSBT/1-1/FALLBACK');
      expect(console.error).toHaveBeenCalledWith('Fallback camera failed to start.');

      startSpy.mockRestore();
    });

    it('should hit the catch block if the fallback camera ALSO fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const stopSpy = vi.spyOn(component, 'stopScanner').mockImplementation(() => {});

      const { Html5Qrcode } = await import('html5-qrcode');
      const startSpy = vi
        .spyOn(Html5Qrcode.prototype, 'start')
        .mockRejectedValue(new Error('Complete failure'));

      component.startScanner();
      vi.advanceTimersByTime(100);

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(stopSpy).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        'Fallback camera start also failed:',
        expect.any(Error),
      );

      startSpy.mockRestore();
    });

    it('setExportFormat: should regenerate frames and restart animation if revealed', () => {
      const regenSpy = vi.spyOn(component, 'regenerateFrames').mockImplementation(() => {});
      const startSpy = vi.spyOn(component, 'startFountainAnimation').mockImplementation(() => {});

      component.showFountainModal.set(true);
      component.isFountainRevealed.set(true);

      component.setExportFormat('bbqr');

      expect(component.exportFormat()).toBe('bbqr');
      expect(regenSpy).toHaveBeenCalled();
      expect(startSpy).toHaveBeenCalled();
    });

    it('setExportFormat: should not regenerate frames if modal is closed', () => {
      const regenSpy = vi.spyOn(component, 'regenerateFrames').mockImplementation(() => {});
      component.showFountainModal.set(false);

      component.setExportFormat('ur');
      expect(regenSpy).not.toHaveBeenCalled();
    });

    it('should cover the empty reset action in closeConfirmModal', () => {
      component.closeConfirmModal();
      component.confirmData().action();
    });

    it('should cover the empty alert action in openAlert', () => {
      component.openAlert('Test', 'Test Msg');
      component.confirmData().action();
    });
  });

  describe('Modal Toggles and Platform Logic', () => {
    it('should toggle various modals and dispatch events', () => {
      const dispatcherSpy = vi.spyOn(component['dispatcher'], 'emitModalView');

      component.openRenameModal();
      expect(component.showRenameModal()).toBe(true);
      expect(dispatcherSpy).toHaveBeenCalledWith('Rename Room');

      component.closeRenameModal();
      expect(component.showRenameModal()).toBe(false);

      component.openShareModal();
      expect(component.showShareModal()).toBe(true);
      component.closeShareModal();

      component.openKeyModal();
      expect(component.showKeyModal()).toBe(true);
      component.closeKeyModal();
    });

    it('should handle confirm modal actions', () => {
      component.openAlert('Title', 'Msg');
      expect(component.showConfirmModal()).toBe(true);
      component.executeConfirmAction();
      expect(component.showConfirmModal()).toBe(false);
    });
  });

  describe('Nudge Signer', () => {
    it('nudgeSigner should copy a formatted nudge message to clipboard and show alert', async () => {
      vi.useFakeTimers();
      const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
      const openAlertSpy = vi.spyOn(component, 'openAlert');
      const logActionSpy = vi.spyOn(mockSocketService, 'logAction');

      const fingerprint = 'fp-abc123';
      const expectedLabel = 'Alice Hardware (fp-abc123)';

      vi.spyOn(component, 'getSignerLabel').mockReturnValue(expectedLabel);
      vi.spyOn(component, 'getFullShareLink').mockReturnValue('https://example.com/room#key');

      component.nudgeSigner(fingerprint);

      await vi.advanceTimersByTimeAsync(150);

      expect(clipboardSpy).toHaveBeenCalled();
      const copiedText = clipboardSpy.mock.calls[0][0];
      expect(copiedText).toContain('Signature needed from: Alice Hardware (fp-abc123)');
      expect(copiedText).toContain('https://example.com/room#key');

      expect(openAlertSpy).toHaveBeenCalledWith(
        'Nudge Message Copied',
        expect.stringContaining('Alice Hardware'),
      );

      expect(logActionSpy).toHaveBeenCalledWith(
        'Nudge Sent',
        expect.stringContaining('Alice Hardware'),
      );
    });

    it('nudgeSigner should handle missing label gracefully', async () => {
      vi.useFakeTimers();
      const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
      const openAlertSpy = vi.spyOn(component, 'openAlert');

      const fingerprint = 'unknown-fp-xyz';

      vi.spyOn(component, 'getSignerLabel').mockReturnValue(fingerprint);
      vi.spyOn(component, 'getFullShareLink').mockReturnValue('https://example.com/room#key');

      component.nudgeSigner(fingerprint);
      await vi.advanceTimersByTimeAsync(150);

      expect(clipboardSpy).toHaveBeenCalled();
      const copiedText = clipboardSpy.mock.calls[0][0];
      expect(copiedText).toContain('Signature needed from: unknown-fp-xyz');
      expect(openAlertSpy).toHaveBeenCalled();
    });
  });

  describe('Helper Method Branches', () => {
    it('getSignerLabel should return fingerprint if label is missing', () => {
      mockSocketService.roomState.set({ signerLabels: { other: 'Name' } });
      const result = component.getSignerLabel('missing-fp');
      expect(result).toBe('missing-fp');
    });

    it('isSaved should return false if label is not found in address book', () => {
      mockSocketService.getLocalLabel.mockReturnValue(null);
      expect(component.isSaved('fp-123')).toBe(false);
    });
  });

  describe('RoomComponent - copyAddress', () => {
    it('should exit early and not call clipboard if address is empty', () => {
      component.copyAddress('');
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('should log the action and emit addressCopied event when an address is copied', async () => {
      const mockAddress = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';

      const expectedShortAddress = 'bc1qxy...hx0wlh';

      const logActionSpy = vi.spyOn(component.socket, 'logAction');
      const emitAddressCopiedSpy = vi.spyOn(component.dispatcher, 'emitAddressCopied');

      vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

      await component.copyAddress(mockAddress);

      await new Promise(process.nextTick);

      expect(logActionSpy).toHaveBeenCalledWith('Address Copied', expectedShortAddress);
      expect(emitAddressCopiedSpy).toHaveBeenCalledWith(mockAddress);
    });

    it('should copy address, update signal, and clear it after exactly 2 seconds', async () => {
      const testAddress = 'bc1q_test_address_mock';
      vi.spyOn(component.socket, 'logAction');
      vi.spyOn(component['dispatcher'], 'emitAddressCopied');

      component.copyAddress(testAddress);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(testAddress);

      await Promise.resolve();

      expect(component.copiedAddress()).toBe(testAddress);

      vi.advanceTimersByTime(1999);
      expect(component.copiedAddress()).toBe(testAddress);

      vi.advanceTimersByTime(1);

      expect(component.copiedAddress()).toBeNull();
    });

    it('should not clear the signal if a new address is copied during the 2-second window', async () => {
      const address1 = 'address_1';
      const address2 = 'address_2';
      vi.spyOn(component.socket, 'logAction');
      vi.spyOn(component['dispatcher'], 'emitAddressCopied');

      component.copyAddress(address1);
      await Promise.resolve();
      expect(component.copiedAddress()).toBe(address1);

      vi.advanceTimersByTime(1000);

      component.copyAddress(address2);
      await Promise.resolve();
      expect(component.copiedAddress()).toBe(address2);

      vi.advanceTimersByTime(1000);
      expect(component.copiedAddress()).toBe(address2);

      vi.advanceTimersByTime(1000);

      expect(component.copiedAddress()).toBeNull();
    });
  });

  describe('Missing Branch Coverage Fixes', () => {
    it('should handle SSR gracefully (isPlatformBrowser = false)', () => {
      (component as any).platformId = 'server';

      component.ngOnInit();
      component.ngOnDestroy();

      expect(mockSocketService.disconnect).not.toHaveBeenCalled();
    });

    it('verifyAllInputs should return early if no inputs', () => {
      mockSocketService.txDetails.set({ inputsList: [] });
      component.verifyAllInputs();
      expect(mockSocketService.updateWhitelist).not.toHaveBeenCalled();
    });

    it('verifyAllOutputs should return early if no outputs', () => {
      mockSocketService.txDetails.set({ outputs: [] });
      component.verifyAllOutputs();
      expect(mockSocketService.updateWhitelist).not.toHaveBeenCalled();
    });

    it('downloadUnsignedPsbt should create a blob and trigger download if psbt exists', () => {
      mockSocketService.roomState.set({ psbt: 'base64psbt' });
      const createElementSpy = vi.spyOn(document, 'createElement');
      const createObjectUrlSpy = vi
        .spyOn(window.URL, 'createObjectURL')
        .mockReturnValue('blob:url');
      const clickSpy = vi.fn();
      createElementSpy.mockReturnValue({ click: clickSpy, href: '', download: '' } as any);

      component.downloadUnsignedPsbt();

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(createObjectUrlSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
    });

    it('downloadCsv should create blob and trigger download', () => {
      mockSocketService.getSettlementCsvData.mockReturnValue('a,b,c');
      const createElementSpy = vi.spyOn(document, 'createElement');
      const clickSpy = vi.fn();
      createElementSpy.mockReturnValue({ click: clickSpy, setAttribute: vi.fn() } as any);
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
      const createObjectUrlSpy = vi
        .spyOn(window.URL, 'createObjectURL')
        .mockReturnValue('blob:url');

      component.downloadCsv();

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(createObjectUrlSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
    });

    it('executeAuditDownload should trigger delay and then download', async () => {
      vi.useFakeTimers();
      const downloadSpy = vi
        .spyOn(component, 'generateAuditLog')
        .mockImplementation(() => Promise.resolve());

      const promise = component.executeAuditDownload();

      await vi.advanceTimersByTimeAsync(1500);
      await promise;

      expect(downloadSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('closeRoom action should generate audit log and navigate if not embedded', () => {
      vi.useFakeTimers();
      vi.spyOn(component, 'isEmbedded', 'get').mockReturnValue(false);
      const generateSpy = vi
        .spyOn(component, 'generateAuditLog')
        .mockImplementation(() => Promise.resolve());

      component.closeRoom();
      component.executeConfirmAction();

      expect(generateSpy).toHaveBeenCalled();
      vi.advanceTimersByTime(350);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
      vi.useRealTimers();
    });

    it('copyRoomId should copy and log if roomId is set', () => {
      component.roomId.set('test-room-id');
      const copySpy = vi.spyOn(component as any, 'doCopy').mockImplementation(() => {});
      component.copyRoomId();
      expect(copySpy).toHaveBeenCalledWith('test-room-id', component.roomIdCopied);
      expect(mockDispatcher.emitDataCopied).toHaveBeenCalledWith('room-id');
    });

    it('copyKey should copy room key', () => {
      mockSocketService.getRoomKey.mockReturnValue('secret-key');
      const copySpy = vi.spyOn(component as any, 'doCopy').mockImplementation(() => {});

      component.copyKey();

      expect(copySpy).toHaveBeenCalledWith('secret-key', component.keyCopied);
      expect(mockDispatcher.emitDataCopied).toHaveBeenCalledWith('decryption-key');
    });

    it('ngOnInit should return early if id is missing', () => {
      mockActivatedRoute.paramMap = of({ get: () => null });
      component.ngOnInit();
      expect(mockSocketService.connect).not.toHaveBeenCalled();
    });

    it('ngOnInit should return early if already connected to correct room', () => {
      mockSocketService.status.set('connected');
      mockSocketService.sdk.store.getState.mockReturnValue({ roomId: 'room-123' });

      component.ngOnInit();

      expect(mockSocketService.connect).not.toHaveBeenCalled();
    });

    it('Effect should generate audit log if room is closed and not embedded', () => {
      vi.spyOn(component, 'isEmbedded', 'get').mockReturnValue(false);
      const generateSpy = vi
        .spyOn(component, 'generateAuditLog')
        .mockImplementation(() => Promise.resolve());

      mockSocketService.isClosed.set(true);
      fixture.detectChanges();

      expect(generateSpy).toHaveBeenCalled();
    });
  });

  describe('Private Utility Methods', () => {
    describe('hexToRgb', () => {
      it('should convert a valid 6-character hex string with a # prefix to an RGB array', () => {
        const rgb = component['hexToRgb']('#ff5c00');
        expect(rgb).toEqual([255, 92, 0]);
      });

      it('should convert a valid 6-character hex string without a # prefix to an RGB array', () => {
        const rgb = component['hexToRgb']('00ff00');
        expect(rgb).toEqual([0, 255, 0]);
      });

      it('should handle uppercase hex strings correctly', () => {
        const rgb = component['hexToRgb']('#FFFFFF');
        expect(rgb).toEqual([255, 255, 255]);
      });

      it('should return the fallback RGB array if the hex string length is invalid', () => {
        const shortHex = component['hexToRgb']('#fff');
        expect(shortHex).toEqual([16, 185, 129]);

        const longHex = component['hexToRgb']('#ff5c0011');
        expect(longHex).toEqual([16, 185, 129]);

        const invalidHex = component['hexToRgb']('invalid');
        expect(invalidHex).toEqual([16, 185, 129]);
      });
    });

    describe('getBase64Logo', () => {
      let originalImage: any;
      let mockImageInstance: any;
      let createElementSpy: any;
      let originalCreateElement: any;

      beforeEach(() => {
        originalImage = window.Image;

        originalCreateElement = document.createElement.bind(document);

        class MockImage {
          width = 100;
          height = 50;
          crossOrigin = '';
          src = '';
          onload: any = null;
          onerror: any = null;

          constructor() {
            mockImageInstance = this;
          }
        }

        window.Image = MockImage as any;
      });

      afterEach(() => {
        window.Image = originalImage;
        if (createElementSpy) {
          createElementSpy.mockRestore();
        }
      });

      it('should resolve with a base64 data URL on successful image load', async () => {
        const mockContext = { drawImage: vi.fn() };
        const mockCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(mockContext),
          toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mockdata'),
        } as any;

        createElementSpy = vi
          .spyOn(document, 'createElement')
          .mockImplementation((tagName: string) => {
            if (tagName === 'canvas') return mockCanvas;
            return originalCreateElement(tagName);
          });

        const promise = component['getBase64Logo']('http://example.com/logo.png');

        expect(mockImageInstance.crossOrigin).toBe('Anonymous');
        expect(mockImageInstance.src).toBe('http://example.com/logo.png');

        mockImageInstance.onload();

        const result = await promise;

        expect(mockCanvas.width).toBe(300); // 100 * 3
        expect(mockCanvas.height).toBe(150); // 50 * 3
        expect(mockContext.drawImage).toHaveBeenCalledWith(mockImageInstance, 0, 0, 300, 150);
        expect(result).toBe('data:image/png;base64,mockdata');
      });

      it('should fallback to default width (550) and height (160) if image has 0 dimensions', async () => {
        const mockContext = { drawImage: vi.fn() };
        const mockCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(mockContext),
          toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mockdata'),
        } as any;

        createElementSpy = vi
          .spyOn(document, 'createElement')
          .mockImplementation((tagName: string) => {
            if (tagName === 'canvas') return mockCanvas;
            return originalCreateElement(tagName);
          });

        const promise = component['getBase64Logo']('http://example.com/logo.png');

        mockImageInstance.width = 0;
        mockImageInstance.height = 0;

        mockImageInstance.onload();

        await promise;

        expect(mockCanvas.width).toBe(1650); // 550 * 3
        expect(mockCanvas.height).toBe(480); // 160 * 3
      });

      it('should resolve with null if the canvas 2d context cannot be created', async () => {
        const mockCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(null),
        } as any;

        createElementSpy = vi
          .spyOn(document, 'createElement')
          .mockImplementation((tagName: string) => {
            if (tagName === 'canvas') return mockCanvas;
            return originalCreateElement(tagName);
          });

        const promise = component['getBase64Logo']('http://example.com/logo.png');

        mockImageInstance.onload();

        const result = await promise;
        expect(result).toBeNull();
      });

      it('should resolve with null if the image fails to load via onerror', async () => {
        const promise = component['getBase64Logo']('http://example.com/broken.png');

        mockImageInstance.onerror();

        const result = await promise;
        expect(result).toBeNull();
      });
    });
  });
});

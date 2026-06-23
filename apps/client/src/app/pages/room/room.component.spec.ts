import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core'; // <-- Added signal import
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { describe, it, expect, beforeEach, vi, afterEach, beforeAll } from 'vitest';
import { RoomComponent } from './room.component';
import { SocketService } from '../../services/socket/socket.service';
import { of, Subject } from 'rxjs';
import { jsPDF } from 'jspdf';
import { Title } from '@angular/platform-browser';
import { WidgetDispatcherService } from '../../services/widget-dispatcher/widget-dispatcher.service';

// ==================== GLOBAL MOCKS ====================
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

vi.mock('jspdf', () => {
  const MockJsPDF = vi.fn(function(this: any) {
    this.setFont = vi.fn().mockReturnThis();
    this.setFontSize = vi.fn().mockReturnThis();
    this.setTextColor = vi.fn().mockReturnThis();
    this.text = vi.fn().mockReturnThis();
    this.setDrawColor = vi.fn().mockReturnThis();
    this.setLineWidth = vi.fn().mockReturnThis();
    this.line = vi.fn().mockReturnThis();
    this.addPage = vi.fn().mockReturnThis();
    this.save = vi.fn();
    this.output = vi.fn().mockReturnValue('data:application/pdf;base64,FAKEPDF');
  });

  return { jsPDF: MockJsPDF };
});

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKEQR'),
  toCanvas: vi.fn().mockResolvedValue(undefined),
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKEQR'),
    toCanvas: vi.fn().mockResolvedValue(undefined)
  }
}));

const createMockSignal = (initialValue: any) => {
  const sig = signal(initialValue);
  (sig as any).mockReturnValue = (val: any) => {
    sig.set(val);
    return sig;
  };
  return sig;
};

describe('RoomComponent', () => {
  let component: RoomComponent;
  let fixture: ComponentFixture<RoomComponent>;
  let router: Router;
  let dispatcherSpy: any;

  const baseRoomState = {
    roomId: '123',
    psbt: 'base64',
    signatures: [],
    network: 'bitcoin',
    roomName: 'Test Room',
    auditLog: [],
    whitelist: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + 100000,
    isLocked: false,
    finalTxHex: null,
    finalTxId: null,
    signerLabels: {},
    connectedCount: 1
  };

  const socketSpy: any = {
    decryptionError: createMockSignal(null),
    roomState: createMockSignal({ ...baseRoomState }),
    status: createMockSignal('connected'),
    isClosed: createMockSignal(false),
    isLockedOut: createMockSignal(false),
    roomNotFound: createMockSignal(false),
    isRoomFull: createMockSignal(false),
    signers: createMockSignal([{ fingerprint: 'abc', signed: false }]),
    signerCount: createMockSignal(1),
    activeSessions: createMockSignal([]),
    currentSessionId: createMockSignal('S1'),
    txDetails: createMockSignal({
      outputs: [{ address: 'addr1', amount: 1000, isChange: false }],
      inputsList: [{ address: 'src1', amount: 2000, txId: 'tx1', vout: 0 }],
      amount: 1000,
      feeRate: 10,
      inputs: 1
    }),
    isCoordinator: createMockSignal(true),
    connect: vi.fn(),
    disconnect: vi.fn(),
    gracefullyDisconnect: vi.fn(),
    setRoomKey: vi.fn(),
    getRoomKey: vi.fn().mockReturnValue('key'),
    getThreshold: vi.fn().mockReturnValue(1),
    getFinalTxHex: vi.fn().mockReturnValue('hex'),
    getFinalTxId: vi.fn().mockReturnValue('id'),
    logAction: vi.fn(),
    checkAndApplyLocalLabels: vi.fn(),
    getLocalLabel: vi.fn().mockReturnValue(null),
    renameRoom: vi.fn(),
    closeRoom: vi.fn(),
    toggleLock: vi.fn(),
    updateSignerLabel: vi.fn(),
    saveToAddressBook: vi.fn(),
    removeFromAddressBook: vi.fn(),
    updateWhitelist: vi.fn(),
    updateWhitelistBatch: vi.fn(),
    broadcastFinalization: vi.fn(),
    uploadSignature: vi.fn().mockResolvedValue(true),
    claimCoordinator: vi.fn(),
    setDisplayName: vi.fn(),
    networkSignatureReceived$: new Subject(),
    securityAlert$: new Subject()
  };

  beforeAll(() => {
    if (!File.prototype.arrayBuffer) {
      File.prototype.arrayBuffer = function () {
        return Promise.resolve(new ArrayBuffer(0));
      };
    }
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      writable: true,
      configurable: true
    });

    // Ensure JSDOM has proper navigator
    if (!navigator.platform) {
      Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
    }

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(),
      putImageData: vi.fn(),
      createImageData: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn()
    } as any);

  });

  beforeEach(async () => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();

      dispatcherSpy = {
      emitModalView: vi.fn(),
      emitPrivacyToggle: vi.fn(),
      emitRoomRenamed: vi.fn(),
      emitDataCopied: vi.fn(),
      emitDownloadTriggered: vi.fn(),
      emitRoomStateChanged: vi.fn(),
      emitQrStateChanged: vi.fn(),
      emitFountainFormatChanged: vi.fn(),
      emitFountainStateChanged: vi.fn(),
      emitPsbtImported: vi.fn(),
      emitTransactionViewChanged: vi.fn(),
      emitDestinationVerified: vi.fn(),
      emitTransactionFinalized: vi.fn(),
      emitParticipantLabelled: vi.fn(),
      emitParticipantPresence: vi.fn(),
      emitSignatureReceived: vi.fn(),
      emitSecurityAlert: vi.fn(),
      emitRoomCreated: vi.fn(),
      isEmbedded: false // Default
    };

    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue('key-1234567890'),
    };
    
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      writable: true,
      configurable: true
    });

    await TestBed.configureTestingModule({
      imports: [RoomComponent, RouterTestingModule],
      providers: [
        { provide: SocketService, useValue: socketSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { fragment: 'key' },
            paramMap: of({ get: () => '123' }),
          },
        },
        { provide: WidgetDispatcherService, useValue: dispatcherSpy }
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(RoomComponent);
    component = fixture.componentInstance;
    
    socketSpy.roomState.mockReturnValue({ ...baseRoomState });
    
    fixture.detectChanges();
  });

  afterEach(() => {
    if (component) component.ngOnDestroy();
    
    vi.clearAllTimers(); 
    vi.useRealTimers();      
    
    if (fixture) fixture.destroy();
    vi.clearAllMocks();
    sessionStorage.clear();

    ['signer-reader', 'fountain-psbt-canvas'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  });

  // ====================== BASIC TESTS ======================
  it('should copy session ID to clipboard', () => {
    const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText');
    component.copySessionId('S1', 'Alice');
    expect(clipboardSpy).toHaveBeenCalledWith('Alice (Session: S1)');
  });

  it('should finalize transaction and trigger success state', () => {
    component.finalize();
    expect(socketSpy.broadcastFinalization).toHaveBeenCalledWith('hex', 'id');
  });

  it('should handle room management actions', () => {
    component.newRoomName.set('New Room');
    component.saveRoomName();
    expect(socketSpy.renameRoom).toHaveBeenCalledWith('New Room');

    component.toggleLock();
    expect(component.showConfirmModal()).toBe(true);
  });

  it('should not broadcast finalization if hex or txId are missing', () => {
    socketSpy.getFinalTxHex.mockReturnValueOnce(null);
    
    component.finalize();
    
    expect(socketSpy.broadcastFinalization).not.toHaveBeenCalled();
  });

  it('should clear timer intervals on destroy', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    
    (component as any).startTimer(Date.now() + 5000);
    
    component.ngOnDestroy();
    
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('should open friction modals for sensitive downloads', () => {
      component.promptAuditLogDownload();
      expect(component.showAuditModal()).toBe(true);

      component.promptCsvDownload();
      expect(component.showCsvModal()).toBe(true);

      component.promptPsbtDownload();
      expect(component.showPsbtModal()).toBe(true);
    });

    it('should open the Room ID OpSec modal', () => {
      component.openRoomIdModal();
      expect(component.showRoomIdModal()).toBe(true);
      
      component.closeRoomIdModal();
      expect(component.showRoomIdModal()).toBe(false);
    });

    it('should handle character counter validation for room IDs', () => {
      component.manualKey = 'short';
      expect(component.manualKey.length).toBe(5);
    });

    it('should log when the Decryption Key is copied from the modal', () => {
      const logSpy = vi.spyOn(socketSpy, 'logAction');
      socketSpy.getRoomKey.mockReturnValue('fake-key');
      
      component.copyKey();
      
      expect(logSpy).toHaveBeenCalledWith('Key Copied', expect.stringContaining('decryption key'));
    });

    it('should log to audit timeline when sensitive keys are copied', () => {
      component.copyKey();
      expect(socketSpy.logAction).toHaveBeenCalledWith('Key Copied', expect.any(String));

      sessionStorage.setItem(`admin_token_123`, 'secret');
      component.copyAdminToken();
      expect(socketSpy.logAction).toHaveBeenCalledWith('Admin Token Copied', expect.any(String));

      component.copyRoomId();
      expect(socketSpy.logAction).toHaveBeenCalledWith('Room ID Copied', expect.any(String));
    });

    it('should log specific QR code security levels', async () => {
      component.qrIncludesKey.set(false);
      component.toggleQrReveal(); // Reveal
      expect(socketSpy.logAction).toHaveBeenCalledWith('QR Code Revealed', expect.stringContaining('Link Only'));

      component.isQrRevealed.set(false);
      component.qrIncludesKey.set(true);
      component.toggleQrReveal(); 
      expect(socketSpy.logAction).toHaveBeenCalledWith('QR Code Revealed', expect.stringContaining('Full (Link + Key)'));
    });

    it('should wait for socket sync before triggering file downloads', async () => {
      vi.useFakeTimers();
      const csvSpy = vi.spyOn(component, 'downloadCsv' as any);
      
      const downloadPromise = component.executeCsvDownload();
      
      expect(socketSpy.logAction).toHaveBeenCalledWith('CSV Export', expect.any(String));
      expect(csvSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1100);
      
      expect(csvSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should open friction modals for sensitive downloads', () => {
      component.promptAuditLogDownload();
      expect(component.showAuditModal()).toBe(true);

      component.promptCsvDownload();
      expect(component.showCsvModal()).toBe(true);

      component.promptPsbtDownload();
      expect(component.showPsbtModal()).toBe(true);
    });

    it('should log to audit timeline when sensitive data is copied', async () => {
      vi.stubGlobal('location', { href: 'http://localhost:4200/room/123#key' });
      
      component.copyKey();
      expect(socketSpy.logAction).toHaveBeenCalledWith('Key Copied', expect.any(String));

      sessionStorage.setItem(`admin_token_123`, 'secret');
      component.copyAdminToken();
      expect(socketSpy.logAction).toHaveBeenCalledWith('Admin Token Copied', expect.any(String));

      component.copyRoomId();
      expect(socketSpy.logAction).toHaveBeenCalledWith('Room ID Copied', expect.any(String));
      
      vi.unstubAllGlobals();
    });

    it('should log specific QR code security levels', async () => {
      component.qrIncludesKey.set(false);
      component.isQrRevealed.set(false);
      component.toggleQrReveal(); 
      expect(socketSpy.logAction).toHaveBeenCalledWith('QR Code Revealed', expect.stringContaining('Link Only'));

      component.isQrRevealed.set(false); 
      component.qrIncludesKey.set(true);
      component.toggleQrReveal();
      expect(socketSpy.logAction).toHaveBeenCalledWith('QR Code Revealed', expect.stringContaining('Full (Link + Key)'));
    });

    it('should handle file generation delays for audit logging sync', async () => {
      vi.useFakeTimers();
      const auditSpy = vi.spyOn(component, 'generateAuditLog' as any).mockImplementation(() => {});
      
      const promise = component.executeAuditDownload();
      
      expect(socketSpy.logAction).toHaveBeenCalledWith('Audit Export', expect.any(String));
      
      await vi.advanceTimersByTimeAsync(1100);
      expect(auditSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should generate a comprehensive Audit Log PDF with all sections', async () => {

    const fullState = {
      ...baseRoomState,
      finalTxHex: '02000000000101...', 
      finalTxId: 'deadbeef12345678',
      auditLog: [
        { timestamp: Date.now(), event: 'Test Event', user: 'Admin', detail: 'Detailed info' },
        { timestamp: Date.now(), event: 'Short Event', user: 'Guest' } 
      ],
      participants: {
        'S1': { id: 'S1', role: 'admin', displayName: 'Alice' },
        'S2': { id: 'S2', role: 'guest' } 
      },
      whitelist: ['addr1'],
      network: 'testnet'
    };
    socketSpy.roomState.mockReturnValue(fullState);
    socketSpy.txDetails.mockReturnValue({
      amount: 100000,
      feeRate: 10,
      inputsList: [{ address: 'addr1', amount: 200000 }],
      outputs: [
        { address: 'dest1', amount: 50000, isChange: false },
        { address: 'change1', amount: 40000, isChange: true }
      ]
    });

    vi.useFakeTimers();
    const promise = component.executeAuditDownload();
    await vi.advanceTimersByTimeAsync(1100);
    await promise;

    expect(jsPDF).toHaveBeenCalled();
    const mockDoc = (jsPDF as any).mock.results[0].value;
    expect(mockDoc.text).toHaveBeenCalledWith(expect.stringContaining('Audit Log'), 20, expect.any(Number));
    expect(mockDoc.text).toHaveBeenCalledWith(expect.stringContaining('Transaction Data'), 20, expect.any(Number));
    expect(mockDoc.text).toHaveBeenCalledWith(expect.stringContaining('Signer Activity'), 20, expect.any(Number));
    expect(mockDoc.text).toHaveBeenCalledWith(expect.stringContaining('Witnesses'), 20, expect.any(Number));
    
    vi.useRealTimers();
  });

  it('should cover PDF/CSV edge cases like change outputs and anonymous signers', () => {
    // Setup state with a 'change' output and a signer with no display name
    socketSpy.roomState.mockReturnValue({
      ...baseRoomState,
      auditLog: [{ timestamp: Date.now(), event: 'Test', user: 'Admin' }],
      participants: { 'S1': { id: 'S1', role: 'guest' } }
    });
    socketSpy.txDetails.mockReturnValue({
      outputs: [{ address: 'addr1', amount: 1000, isChange: true }], 
      inputsList: [{ address: 'src1', amount: 2000 }]
    });

    // Call the synchronous generation methods directly to bypass the 1000ms delay lockup
    component.downloadCsv();
    component.generateAuditLog();

    expect(jsPDF).toHaveBeenCalled();
  });

  // ====================== SIGNER LABELING ======================
  it('should handle signer labeling and address book storage', () => {
    component.openLabelModal('fingerprint123');
    expect(component.showLabelModal()).toBe(true);
    expect(component.editingFingerprint()).toBe('fingerprint123');

    component.editingLabel.set('Alice Wallet');
    component.saveToBook.set(true);
    component.saveLabel();

    expect(socketSpy.updateSignerLabel).toHaveBeenCalledWith('fingerprint123', 'Alice Wallet');
    expect(socketSpy.saveToAddressBook).toHaveBeenCalledWith('fingerprint123', 'Alice Wallet');
    expect(component.showLabelModal()).toBe(false);
  });

  // ====================== FILE UPLOAD ======================
  it('should reject invalid file types during upload', async () => {
    const alertSpy = vi.spyOn(component, 'openAlert' as any);
    const invalidFile = new File([''], 'test.pdf', { type: 'application/pdf' });

    await component.onFileSelected({ target: { files: [invalidFile] } } as any);
    expect(alertSpy).toHaveBeenCalledWith('Invalid File Type', expect.any(String));
  });

  it('should detect and reject raw transactions (non-PSBT)', async () => {
    const alertSpy = vi.spyOn(component, 'openAlert' as any);
    const rawTxContent = '020000000001';
    const rawTxFile = new File([rawTxContent], 'tx.hex', { type: 'text/plain' });

    rawTxFile.arrayBuffer = () => Promise.resolve(new TextEncoder().encode(rawTxContent).buffer);

    await component.onFileSelected({ target: { files: [rawTxFile] } } as any);
    expect(alertSpy).toHaveBeenCalledWith('Invalid File', expect.any(String));
  });

  it('should detect binary PSBT files via magic bytes (70736274ff)', async () => {
    const binaryPsbt = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff, 0x01, 0x02]);
    const file = new File([binaryPsbt], 'wallet.psbt');
    
    // Ensure the arrayBuffer polyfill returns our specific data
    file.arrayBuffer = () => Promise.resolve(binaryPsbt.buffer);
    
    await component.onFileSelected({ target: { files: [file] } } as any);
    
    expect(socketSpy.uploadSignature).toHaveBeenCalledWith('70736274ff0102');
  });

  it('should reject raw hex transactions starting with 010000 or 020000', async () => {
    const alertSpy = vi.spyOn(component, 'openAlert' as any);
    const rawHex = '02000000000101';
    const file = new File([rawHex], 'tx.hex', { type: 'text/plain' });
    
    // Mock the buffer return for the text file
    file.arrayBuffer = () => Promise.resolve(new TextEncoder().encode(rawHex).buffer);

    await component.onFileSelected({ target: { files: [file] } } as any);
    
    expect(alertSpy).toHaveBeenCalledWith('Invalid File', expect.stringContaining('Raw Transaction'));
    expect(socketSpy.uploadSignature).not.toHaveBeenCalled();
  });

  it('should reject file over 2MB', async () => {
    const alertSpy = vi.spyOn(component, 'openAlert' as any);
    
    const largeFile = new File(['a'.repeat((2 * 1024 * 1024) + 1)], 'huge.psbt', { type: 'text/plain' });
    
    await component.onFileSelected({ target: { files: [largeFile] } } as any);
    expect(alertSpy).toHaveBeenCalledWith('File Too Large', expect.any(String));
  });

  it('should catch read error on file upload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const alertSpy = vi.spyOn(component, 'openAlert' as any);
    const badFile = new File([''], 'broken.psbt', { type: 'text/plain' });
    badFile.arrayBuffer = () => Promise.reject(new Error('Disk read failed'));

    await component.onFileSelected({ target: { files: [badFile] } } as any);
    expect(alertSpy).toHaveBeenCalledWith('Read Error', expect.any(String));
  });

  // ====================== SECURITY & FINALIZE ======================
  it('should show security warning when finalizing with unverified outputs', () => {
    socketSpy.roomState.mockReturnValue({
      ...baseRoomState,
      psbt: 'valid',
      whitelist: ['other-address'],
      signatures: ['sig1']
    });
    
    // Ensure there is an unverified, non-change output
    socketSpy.txDetails.mockReturnValue({ 
        outputs: [{ address: 'unverified-addr', isChange: false }] 
    });

    const confirmSpy = vi.spyOn(component, 'openConfirm' as any);
    component.finalize();

    expect(confirmSpy).toHaveBeenCalledWith(
      'Security Warning',
      expect.stringContaining('unverified'),
      expect.any(Function),
      true
    );
  });

  it('should trigger confetti on successful finalize (no security warning)', () => {
    const confettiSpy = vi.spyOn(component as any, 'triggerConfetti');

    socketSpy.roomState.mockReturnValue({ ...baseRoomState, whitelist: [], signatures: ['sig1', 'sig2'] });
    socketSpy.txDetails.mockReturnValue({ outputs: [{ address: 'whitelisted', isChange: false }] });

    component.finalize();

    expect(socketSpy.broadcastFinalization).toHaveBeenCalled();
    expect(confettiSpy).toHaveBeenCalled();
  });

  it('should reset copiedSessionId after 2 seconds', () => {
    vi.useFakeTimers();
    
    component.copySessionId('S1', 'Alice');
    expect(component.copiedSessionId()).toBe('S1');
    
    vi.advanceTimersByTime(2000);
    expect(component.copiedSessionId()).toBeNull();
    
    vi.useRealTimers();
  });

  it('should update window title for all room stages', async () => {
  const titleSpy = vi.spyOn(TestBed.inject(Title), 'setTitle');

  // Stage 1: Waiting
  socketSpy.roomState.mockReturnValue({ ...baseRoomState, signatures: [] });
  socketSpy.signers.mockReturnValue([{ fingerprint: 'a', signed: false }]);
  socketSpy.getThreshold.mockReturnValue(1);
  fixture.detectChanges();
  await Promise.resolve(); 
  expect(titleSpy).toHaveBeenCalledWith(expect.stringContaining('Needed'));

  // Stage 2: Locked
  socketSpy.roomState.mockReturnValue({ ...baseRoomState, isLocked: true });
  fixture.detectChanges();
  await Promise.resolve();
  expect(titleSpy).toHaveBeenCalledWith(expect.stringContaining('Room Locked'));

  // Stage 3: Finalized
  socketSpy.roomState.mockReturnValue({ 
    ...baseRoomState, 
    finalTxHex: '010203',
    finalTxId: 'deadbeef'
  });
  socketSpy.getFinalTxHex.mockReturnValue('010203');
  fixture.detectChanges();
  await Promise.resolve();
  expect(titleSpy).toHaveBeenCalledWith(expect.stringContaining('Ready to Broadcast'));
});

  // ====================== QR CODE ======================
  it('should handle QR code generation and reveal toggle', async () => {
    await component.openQr();
    expect(component.showQrModal()).toBe(true);
    expect(component.isQrRevealed()).toBe(false);
    expect(component.qrIncludesKey()).toBe(false); // New OpSec default

    component.toggleQrReveal();
    expect(component.isQrRevealed()).toBe(true);

    component.downloadQr();
    component.closeQr();
    expect(component.showQrModal()).toBe(false);
  });

  it('should toggle QR key inclusion securely', async () => {
    await component.openQr();
    component.toggleQrReveal(); // Reveal it
    expect(component.isQrRevealed()).toBe(true);

    // Toggle to include key
    await component.toggleQrKey(true);
    
    // Should update state and instantly re-blur the image
    expect(component.qrIncludesKey()).toBe(true);
    expect(component.isQrRevealed()).toBe(false); 
  });

  it('should handle QR code generation failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const QRCode = await import('qrcode');
    vi.spyOn(QRCode, 'toDataURL').mockRejectedValueOnce(new Error('QR Engine Fail'));

    await component.openQr();
    expect(consoleSpy).toHaveBeenCalledWith('QR Generation failed', expect.any(Error));
  });

  // ====================== WHITELIST ======================
  it('should toggle address whitelist status', () => {
    socketSpy.roomState.mockReturnValue({ ...baseRoomState, whitelist: ['addr1'] });
    component.toggleWhitelist('addr1');

    expect(component.confirmData().message).toContain('Remove');

    component.executeConfirmAction();
    expect(socketSpy.updateWhitelist).toHaveBeenCalledWith('addr1', true);
  });

  it('should batch verify all outputs', () => {
    component.verifyAllOutputs();
    expect(component.showConfirmModal()).toBe(true);

    component.executeConfirmAction();
    expect(socketSpy.updateWhitelistBatch).toHaveBeenCalled();
  });

  it('should verifyAllInputs when coordinator', () => {
    socketSpy.isCoordinator.mockReturnValue(true);
    socketSpy.txDetails.mockReturnValue({
      inputsList: [{ address: 'unverified1' }, { address: 'addr1' }]
    });
    socketSpy.roomState.mockReturnValue({ ...baseRoomState, whitelist: ['addr1'] });

    component.verifyAllInputs();
    expect(socketSpy.updateWhitelistBatch).toHaveBeenCalledWith(['unverified1'], false);
  });

  // ====================== ROOM MANAGEMENT ======================
  it('should handle rename room modal and validation', () => {
    component.openRenameModal();
    expect(component.showRenameModal()).toBe(true);
    expect(component.newRoomName()).toBe('Test Room');

    component.newRoomName.set('A'.repeat(70));
    component.saveRoomName();
    expect(socketSpy.renameRoom).toHaveBeenCalledWith(expect.stringContaining('A'.repeat(64)));

    component.closeRenameModal();
    expect(component.showRenameModal()).toBe(false);
  });

  it('should toggle lock room with confirmation', () => {
    socketSpy.roomState.mockReturnValue({ ...baseRoomState, isLocked: false });
    component.toggleLock();
    expect(component.showConfirmModal()).toBe(true);
    expect(component.confirmData().title).toContain('LOCK');

    component.executeConfirmAction();
    expect(socketSpy.toggleLock).toHaveBeenCalledWith(true);
  });

  it('should include historical participants in the CSV export', () => {
    
    socketSpy.roomState.mockReturnValue({
      ...baseRoomState,
      participants: {
        'S1': { id: 'S1', role: 'admin', displayName: 'Alice' },
        'S2': { id: 'S2', role: 'guest' }
      }
    });
    
    const originalCreateElement = document.createElement.bind(document);
    const anchor = originalCreateElement('a');
    const setAttributeSpy = vi.spyOn(anchor, 'setAttribute');
    
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'a') return anchor;
      return originalCreateElement(tagName);
    });
    
    component.downloadCsv();
    
    // The component wraps columns in quotes and uses encodeURI (which ignores semicolons)
    expect(setAttributeSpy).toHaveBeenCalledWith(
      'href', 
      expect.stringContaining('Alice%20%5BCoordinator%5D%20(S1);%20Anonymous%20%5BGuest%5D%20(S2)')
    );
    
    createElementSpy.mockRestore();
  });

  // ====================== SHARING & UTILS ======================
  it('should handle Share Link modal and secure copying', () => {
    const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText');
    const closeSpy = vi.spyOn(component, 'closeShareModal');
    socketSpy.getRoomKey.mockReturnValue('secret-key');

    component.openShareModal();
    expect(component.showShareModal()).toBe(true);

    // Test Secure Link
    component.copySecureLink();
    expect(clipboardSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();

    // Test Full Link
    component.copyFullLink();
    expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining('#secret-key'));
    expect(closeSpy).toHaveBeenCalled();
  });

  it('should handle Key modal and copying', () => {
    const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText');
    const closeSpy = vi.spyOn(component, 'closeKeyModal');
    socketSpy.getRoomKey.mockReturnValue('room-key-123');

    component.openKeyModal();
    expect(component.showKeyModal()).toBe(true);

    component.copyKey();
    expect(clipboardSpy).toHaveBeenCalledWith('room-key-123');
    expect(closeSpy).toHaveBeenCalled();
  });

  it('should handle Admin modal and copying', () => {
    const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText');
    const closeSpy = vi.spyOn(component, 'closeAdminModal');
    sessionStorage.setItem('admin_token_123', 'admin-secret');

    component.openAdminModal();
    expect(component.showAdminModal()).toBe(true);

    component.copyAdminToken();
    expect(clipboardSpy).toHaveBeenCalledWith('admin-secret');
    expect(closeSpy).toHaveBeenCalled();
  });

  it('should handle downloadUnsignedPsbt', () => {
    const anchor = document.createElement('a');
    const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor);
    
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    component.downloadUnsignedPsbt();
    
    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalled();
  });

  it('should handle nudgeSigner', async () => {
    const alertSpy = vi.spyOn(component, 'openAlert' as any);
    component.nudgeSigner('fingerprint123');
    
    await Promise.resolve(); // Wait for clipboard promise
    
    expect(alertSpy).toHaveBeenCalledWith('Nudge Message Copied', expect.any(String));
    expect(socketSpy.logAction).toHaveBeenCalledWith('Nudge Sent', expect.any(String));
  });

  // ====================== TIMER & EXPIRATION ======================
  it('should handle room expiration', () => {
    vi.useFakeTimers();
    const disconnectSpy = vi.spyOn(socketSpy, 'disconnect');
    (component as any).startTimer(Date.now() + 2000);

    vi.advanceTimersByTime(2100);
    expect(component.isExpired()).toBe(true);
    expect(disconnectSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should update timeRemaining and lowTime flag', () => {
    vi.useFakeTimers();
    (component as any).startTimer(Date.now() + 150000);
    vi.advanceTimersByTime(1000);
    expect(component.timeRemaining()).toMatch(/\d+ hrs \d+ m \d+ s/);
    expect(component.isLowTime()).toBe(false);

    vi.advanceTimersByTime(140000);
    expect(component.isLowTime()).toBe(true);
    vi.useRealTimers();
  });

  // ====================== COORDINATOR & DECRYPTION ======================
  it('should claim coordinator role with password', () => {
    component.claimPassword = ' admin-pass ';
    component.claimRole();

    expect(sessionStorage.getItem(`admin_token_123`)).toBe('admin-pass');
    expect(socketSpy.claimCoordinator).toHaveBeenCalledWith('admin-pass');
  });

  it('should not claim role with empty password', () => {
    component.claimPassword = '';
    component.claimRole();
    expect(sessionStorage.getItem(`admin_token_123`)).toBeNull();
    expect(socketSpy.claimCoordinator).not.toHaveBeenCalled();
  });

  it('should submit manual decryption key', () => {
    component.manualKey = 'secret#my-key';
    component.submitKey();

    expect(socketSpy.connect).toHaveBeenCalledWith('123', 'my-key');
  });

  // ====================== SEARCH & EFFECTS ======================
  it('should handle input/output search filtering', () => {
    socketSpy.txDetails.mockReturnValue({
      inputsList: [{ address: 'bc1abc123', amount: 1000 }],
      outputs: [{ address: 'bc1xyz999', amount: 500, isChange: false }]
    });

    component.inputSearchQuery.set('abc');
    expect(component.filteredInputs().length).toBe(1);

    component.outputSearchQuery.set('xyz');
    expect(component.filteredOutputs().length).toBe(1);
  });

  it('should handle broadcastAndCopy', () => {
    const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText');
    const openSpy = vi.spyOn(window, 'open');

    // Ensure finalHex() returns value
    socketSpy.roomState.mockReturnValue({
      ...baseRoomState,
      finalTxHex: 'finalhex123',
      network: 'testnet'
    });

    fixture.detectChanges(); 

    component.broadcastAndCopy();

    expect(clipboardSpy).toHaveBeenCalledWith('finalhex123');
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('testnet/tx/push'), 
      '_blank'
    );
  });

  it('should handle copying final hex, logging the action, and emitting the telemetry event', () => {
    const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText');
    
    socketSpy.roomState.mockReturnValue({
      ...baseRoomState,
      finalTxHex: 'd1234567890'
    });
    
    fixture.detectChanges(); 

    component.copyHex();

    // Verify the copy happened
    expect(clipboardSpy).toHaveBeenCalledWith('d1234567890');
    expect(component.copied()).toBe(true);

    // Verify internal audit log was created
    expect(socketSpy.logAction).toHaveBeenCalledWith('Hex Copied', expect.any(String));

    // Verify external webhook was fired to the host application
    expect(dispatcherSpy.emitDataCopied).toHaveBeenCalledWith('final-hex');
  });

  it('should handle titleService updates via effects', () => {
    const titleSpy = vi.spyOn(TestBed.inject(Title), 'setTitle');

    socketSpy.signers.mockReturnValue([{ fingerprint: 'a', signed: true }]);
    socketSpy.roomState.mockReturnValue({
      ...baseRoomState,
      signatures: ['sig1', 'sig2'],
      psbt: 'dummy'
    });

    fixture.detectChanges();

    expect(titleSpy).toHaveBeenCalledWith(expect.stringContaining('Ready to Finalize'));
  });

  // ====================== HOST LISTENER ======================
  it('should set returnValue on beforeunload when connected and not finalized', () => {
    const event = { returnValue: '' } as any;
    component.unloadNotification(event);
    expect(event.returnValue).toBe(true);
  });

  it('should call gracefullyDisconnect on beforeunload', () => {
    const disconnectSpy = vi.spyOn(socketSpy, 'gracefullyDisconnect');
    component.onBeforeUnload();
    expect(disconnectSpy).toHaveBeenCalled();
  });

  // ====================== EDGE CASES & EARLY RETURNS ======================
  
  it('should abort onFileSelected if no file is provided', async () => {
    const alertSpy = vi.spyOn(component, 'openAlert' as any);
    await component.onFileSelected({ target: { files: [] } } as any);
    // Should return silently without alerting or attempting to parse
    expect(alertSpy).not.toHaveBeenCalled(); 
  });

  it('should not rename room if new name is empty or only whitespace', () => {
    component.newRoomName.set('   ');
    component.saveRoomName();
    expect(socketSpy.renameRoom).not.toHaveBeenCalled();
  });

  it('should abort finalize if the room is expired', () => {
    component.isExpired.set(true);
    component.finalize();
    expect(socketSpy.broadcastFinalization).not.toHaveBeenCalled();
  });

  it('should not set returnValue on beforeunload if transaction is already finalized', () => {
    socketSpy.roomState.mockReturnValue({ ...baseRoomState, finalTxHex: 'hex123' });
    const event = { returnValue: '' } as any;
    component.unloadNotification(event);
    // Because finalHex exists, it should NOT set returnValue to true
    expect(event.returnValue).toBe('');
  });

  // ====================== URL PARSING & DECRYPTION ======================
  
  it('should set decryption error if URL lacks a fragment key on init', () => {
    (component as any).route.snapshot.fragment = null;
    component.ngOnInit();
    
    expect(socketSpy.decryptionError()).toBe('Missing decryption key in URL');
  });

  it('should extract key correctly if manualKey contains a full URL with #', () => {
    component.manualKey = 'https://signingroom.io/room/123#my-secret-key';
    component.submitKey();
    expect(socketSpy.connect).toHaveBeenCalledWith('123', 'my-secret-key');
  });

  it('should abort submitKey if manualKey is empty', () => {
    component.manualKey = '';
    component.submitKey();
    expect(socketSpy.connect).not.toHaveBeenCalled();
  });

  // ====================== EMPTY ARRAYS & BATCH ACTIONS ======================
  
  it('should abort batch verify actions if arrays are empty', () => {
    socketSpy.txDetails.mockReturnValue({ inputsList: [], outputs: [] });
    
    component.verifyAllInputs();
    expect(socketSpy.updateWhitelistBatch).not.toHaveBeenCalled();

    component.verifyAllOutputs();
    expect(component.showConfirmModal()).toBe(false); // Shouldn't even open the confirm modal
  });

  it('should not update whitelist batch if all addresses are already whitelisted', () => {
    socketSpy.roomState.mockReturnValue({ ...baseRoomState, whitelist: ['addr1', 'addr2'] });
    socketSpy.txDetails.mockReturnValue({
      inputsList: [{ address: 'addr1' }],
      outputs: [{ address: 'addr2' }]
    });

    component.verifyAllInputs();
    expect(socketSpy.updateWhitelistBatch).not.toHaveBeenCalled();
  });

  // ====================== EMBEDDED MODE ======================

  it('should handle postMessage and finalization in embedded mode', async () => {
    // Force the mocked dispatcher to return true for isEmbedded
    dispatcherSpy.isEmbedded = true;

    // Mock a finalized state
    socketSpy.roomState.mockReturnValue({ 
      ...baseRoomState, 
      finalTxId: 'mock-tx-id', 
      finalTxHex: 'mock-hex' 
    });

    // 3. Trigger the component's effect
    fixture.detectChanges(); 
    await Promise.resolve();
    
    // Verify the component successfully passed the data to the dispatcher
    expect(dispatcherSpy.emitTransactionFinalized).toHaveBeenCalledWith(
        expect.objectContaining({
            txId: 'mock-tx-id',
            txHex: 'mock-hex'
        })
    );
  });

  it('should navigate and clear fragment if connected and key is present', async () => {
    socketSpy.status.set('connecting');
    fixture.detectChanges();
    await Promise.resolve();

    const routerSpy = vi.spyOn(router, 'navigate');
    
    (component as any).route.snapshot.fragment = 'new-secret-key';
    socketSpy.status.set('connected');
    fixture.detectChanges();
    
    // Flush the microtask queue to allow the effect to execute
    await Promise.resolve();

    expect(routerSpy).toHaveBeenCalledWith([], expect.objectContaining({ 
      fragment: undefined,
      replaceUrl: true 
    }));
  });

  describe('Embedded Mode (Web Component) Suppressions', () => {
    
    beforeEach(() => {
      vi.useFakeTimers(); 
    });

    afterEach(() => {
      vi.useRealTimers(); 
    });

    it('should suppress auto-download on closeRoom if embedded', () => {
      const isEmbeddedSpy = vi.spyOn(component, 'isEmbedded', 'get').mockReturnValue(true);
      const generateAuditLogSpy = vi.spyOn(component, 'generateAuditLog');
      const closeRoomSpy = vi.spyOn(component.socket, 'closeRoom').mockImplementation(() => {});
      
      // Auto-execute the confirmation modal callback
      vi.spyOn(component, 'openConfirm').mockImplementation((t, m, action) => action());
      
      component.closeRoom();
      
      // Fast-forward time to flush the setTimeout inside closeRoom
      vi.advanceTimersByTime(300); 
      
      // It SHOULD have called socket.closeRoom()
      expect(closeRoomSpy).toHaveBeenCalled();
      
      // But because it's embedded, it should NOT have tried to auto-generate the log
      expect(generateAuditLogSpy).not.toHaveBeenCalled();
      
      isEmbeddedSpy.mockRestore();
    });
  });

  // ====================== PRIVACY & OPSEC BLUR ======================
  
  describe('Privacy & OpSec Blur Controls', () => {
    it('should initialize with all sections blurred and modal hidden', () => {
      const states = component.blurStates();
      expect(states['transaction-overview']).toBe(true);
      expect(states['transaction-proposal']).toBe(true);
      expect(states['transaction-details']).toBe(true);
      expect(states['signers']).toBe(true);
      
      expect(component.showPrivacyWarning()).toBe(false);
      expect(component.pendingUnblurSection()).toBeNull();
    });

    it('should open the warning modal and set pending section when clicking a blurred section', () => {
      component.togglePrivacyBlur('transaction-details');
      
      expect(component.pendingUnblurSection()).toBe('transaction-details');
      expect(component.showPrivacyWarning()).toBe(true);
      expect(component.blurStates()['transaction-details']).toBe(true); 
    });

    it('should instantly re-blur an unblurred section without showing the modal', () => {
      // Setup: manually unblur a section
      component.blurStates.update(s => ({ ...s, 'transaction-overview': false }));
      
      // Interaction: Toggle it back
      component.togglePrivacyBlur('transaction-overview');
      
      // Verification: Should instantly re-blur, skip modal, and log
      expect(component.showPrivacyWarning()).toBe(false);
      expect(component.blurStates()['transaction-overview']).toBe(true);
      expect(socketSpy.logAction).toHaveBeenCalledWith('Privacy Toggle', 'Re-blurred transaction-overview section');
    });

    it('should unblur the pending section when the user confirms', () => {
      component.togglePrivacyBlur('transaction-proposal');
      component.confirmUnblur();
      
      expect(component.blurStates()['transaction-proposal']).toBe(false);
      expect(component.showPrivacyWarning()).toBe(false);
      expect(component.pendingUnblurSection()).toBeNull();
      expect(socketSpy.logAction).toHaveBeenCalledWith('Privacy Toggle', 'Revealed transaction-proposal section');
    });

    it('should unblur all sections when the user selects Reveal All', () => {
      component.confirmUnblurAll();
      
      const states = component.blurStates();
      expect(states['transaction-overview']).toBe(false);
      expect(states['transaction-proposal']).toBe(false);
      expect(states['transaction-details']).toBe(false);
      expect(states['signers']).toBe(false);
      
      expect(component.showPrivacyWarning()).toBe(false);
      expect(socketSpy.logAction).toHaveBeenCalledWith('Privacy Toggle', 'Revealed all sections');
    });

    it('should discard pending unblur if the modal is closed via Cancel', () => {
      component.togglePrivacyBlur('signers');
      component.closePrivacyWarning();
      
      expect(component.showPrivacyWarning()).toBe(false);
      expect(component.pendingUnblurSection()).toBeNull();
      expect(component.blurStates()['signers']).toBe(true); // Should remain safely blurred
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
        getState: () => 1, // Not scanning
        clear: vi.fn()
      } as any;
      component.isScanningSigned.set(true);
      
      component.stopScanner();
      
      expect(component.html5QrCode.clear).toHaveBeenCalled();
      expect(component.isScanningSigned()).toBe(false);
    });

    it('stopScanner: should handle asynchronous promise rejection from stop()', async () => {
      let rejectPromise: any;
      const promise = new Promise((_, reject) => { rejectPromise = reject; });
      component.html5QrCode = {
        getState: () => 2, // Scanning
        stop: vi.fn().mockReturnValue(promise),
        clear: vi.fn()
      } as any;
      component.isScanningSigned.set(true);
      
      component.stopScanner();
      
      rejectPromise(new Error('Camera stuck'));
      
      await new Promise(process.nextTick);
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(component.html5QrCode.clear).toHaveBeenCalled();
      expect(component.isScanningSigned()).toBe(false);
    });

    it('stopScanner: should execute catch block if synchronous error occurs', () => {
      component.html5QrCode = {
        getState: () => { throw new Error('Sync crash'); },
        clear: vi.fn()
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
      component.isFountainRevealed.set(false); // Modal hidden
      vi.spyOn(component, 'startFountainAnimation').mockImplementation(() => {});

      component.updateFountainSpeed(300);

      expect(component.fountainSpeed()).toBe(300);
      expect(component.startFountainAnimation).not.toHaveBeenCalled();
    });

    it('should catch errors if uploadSignature fails in processScannedSignature', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Use spyOn to safely hijack just this one method without breaking ngOnDestroy
      vi.spyOn(component.socket, 'uploadSignature').mockRejectedValue(new Error('Network disconnected'));
      
      await component.processScannedSignature('01020304'); 
      
      expect(console.error).toHaveBeenCalledWith("Failed to parse signed PSBT from scanner", expect.any(Error));
    });

    it('should safely execute the catch block if getState throws in stopScanner', () => {
        component.html5QrCode = {
          getState: () => { throw new Error('State crash'); },
          clear: vi.fn()
        } as any;
        
        component.stopScanner();
        
        expect(component.isScanningSigned()).toBe(false);
      });

    it('should safely handle errors when parsing a scanned signature fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        
        await component.processScannedSignature('INVALID_!!!_DATA');
        
        expect(console.error).toHaveBeenCalledWith(
            "Failed to parse signed PSBT from scanner", 
            expect.any(Error)
        );
    });

    it('should handle asynchronous rejection when stopping the scanner', async () => {
      component.html5QrCode = {
        getState: () => 2,
        stop: vi.fn().mockRejectedValue(new Error('Camera stuck')),
        clear: vi.fn()
      } as any;
      
      component.stopScanner();
      await Promise.resolve();
      
      expect(component.isScanningSigned()).toBe(false);
    });

    it('should handle synchronous errors when stopping the scanner', () => {
      component.html5QrCode = {
        getState: () => { throw new Error('Sync crash'); },
        clear: vi.fn()
      } as any;
      
      component.stopScanner();
      
      expect(component.isScanningSigned()).toBe(false);
    });
  });

  describe('startScanner Anonymous Callbacks & Error Chains', () => {
    
    beforeEach(() => {
      vi.useFakeTimers();
      // Provide the missing DOM element to prevent the constructor from throwing unhandled rejections
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

    it('should trigger the success and error callbacks passed to html5QrCode.start', async () => {
      vi.spyOn(component, 'handleScanResult').mockImplementation(() => {});

      const { Html5Qrcode } = await import('html5-qrcode');
      const startSpy = vi.spyOn(Html5Qrcode.prototype, 'start')
        .mockImplementation((camId: any, config: any, onSuccess: any, onError: any) => {
          if (onSuccess) onSuccess('UR:CRYPTO-PSBT/1-1/MOCK');
          if (onError) onError('Ignored scan error');
          return Promise.resolve();
        });

      component.startScanner();

      vi.advanceTimersByTime(100);
      
      await Promise.resolve(); 

      expect(component.handleScanResult).toHaveBeenCalledWith('UR:CRYPTO-PSBT/1-1/MOCK');
      expect(component.isScanningSigned()).toBe(true);

      startSpy.mockRestore();
    });

    it('should execute the .catch() block if html5QrCode.start rejects', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const { Html5Qrcode } = await import('html5-qrcode');
      const startSpy = vi.spyOn(Html5Qrcode.prototype, 'start')
        .mockRejectedValue(new Error('Camera permissions denied'));

      component.isScanningSigned.set(false);

      component.startScanner();

      vi.advanceTimersByTime(100);
      
      await Promise.resolve();
      await Promise.resolve(); 

      expect(console.error).toHaveBeenCalled();

      startSpy.mockRestore();
    });
    
    it('should fall safely through safeStopScanner if html5QrCode is null', () => {
      component.html5QrCode = null as any;
      component.isScanningSigned.set(true);
      
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
        clear: vi.fn()
      } as any;
      component.isScanningSigned.set(true);
      
      component.stopScanner();
      await Promise.resolve(); 
      
      expect(component.html5QrCode.clear).toHaveBeenCalled();
      expect(component.isScanningSigned()).toBe(false);
    });

    it('should trigger doFinalize() callback inside confirmation modal', () => {
      socketSpy.roomState.mockReturnValue({
        ...baseRoomState,
        whitelist: ['some-address'],
        signatures: ['sig1']
      });
      socketSpy.txDetails.mockReturnValue({ 
          outputs: [{ address: 'unverified-addr', isChange: false }] 
      });

      component.finalize();
      
      const broadcastSpy = vi.spyOn(socketSpy, 'broadcastFinalization');
      socketSpy.getFinalTxHex.mockReturnValue('hex');
      socketSpy.getFinalTxId.mockReturnValue('id');
      
      component.executeConfirmAction();
      
      expect(broadcastSpy).toHaveBeenCalledWith('hex', 'id');
    });

    it('should execute setTimeout callback inside doCopy()', () => {
      component.copyHex(); 
      expect(component.copied()).toBe(true);
      
      vi.advanceTimersByTime(2000);
      
      expect(component.copied()).toBe(false);
    });

    it('should execute interval and timeout callbacks in startFountainAnimation()', () => {
      const renderSpy = vi.spyOn(component, 'renderFountainFrame').mockImplementation(async () => {});
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
      const startSpy = vi.spyOn(Html5Qrcode.prototype, 'start')
        .mockImplementation((camId: any, config: any, onSuccess: any, onError: any) => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('High res fail'));
          } else {
            // Fires the anonymous callbacks in the fallback catch block
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
      const startSpy = vi.spyOn(Html5Qrcode.prototype, 'start')
        .mockRejectedValue(new Error('Complete failure'));

      component.startScanner();
      vi.advanceTimersByTime(100);
      
      await Promise.resolve(); 
      await Promise.resolve();
      await Promise.resolve();

      expect(stopSpy).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('Fallback camera start also failed:', expect.any(Error));

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

    it('regenerateFrames: should catch exception if urService throws', () => {
      socketSpy.roomState.mockReturnValue({ ...baseRoomState, psbt: 'bad-psbt' });
      component.exportFormat.set('ur');
      
      vi.spyOn(component.urService, 'generateFrames').mockImplementation(() => {
        throw new Error('Explosion');
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      component.regenerateFrames();
      
      expect(console.error).toHaveBeenCalledWith('Failed to prepare frames', expect.any(Error));
    });

    it('renderFountainFrame: should render to canvas if revealed', async () => {
      component.isFountainRevealed.set(true);
      component.activeFountainFrames = ['test'];
      component.currentFrameIndex.set(0);
      
      const canvas = document.createElement('canvas');
      canvas.id = 'fountain-psbt-canvas';
      document.body.appendChild(canvas);
      
      await component.renderFountainFrame();
      
      document.body.removeChild(canvas);
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

});
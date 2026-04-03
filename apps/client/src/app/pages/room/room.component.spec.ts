import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core'; // <-- Added signal import
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { describe, it, expect, beforeEach, vi, afterEach, beforeAll } from 'vitest';
import { RoomComponent } from './room.component';
import { SocketService } from '../../services/socket/socket.service';
import { of } from 'rxjs';
import { jsPDF } from 'jspdf';
import { Title } from '@angular/platform-browser';

// ==================== GLOBAL MOCKS ====================
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(() => ({
    setFont: vi.fn(), setFontSize: vi.fn(), setTextColor: vi.fn(),
    text: vi.fn(), setDrawColor: vi.fn(), setLineWidth: vi.fn(),
    line: vi.fn(), addPage: vi.fn(), save: vi.fn()
  }))
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKEQR'),
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKEQR')
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
    setDisplayName: vi.fn()
  };

  beforeAll(() => {
    if (!File.prototype.arrayBuffer) {
      File.prototype.arrayBuffer = function () {
        return Promise.resolve(new ArrayBuffer(0));
      };
    }
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();   // ← Important for stability

    socketSpy.roomState.mockReturnValue({ ...baseRoomState });

    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
      });
    }

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
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(RoomComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    if (fixture) fixture.destroy();
    vi.clearAllMocks();
    sessionStorage.clear();
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

  it('should generate audit log and CSV', () => {
    const csvSpy = vi.spyOn(document, 'createElement');
    component.downloadCsv();
    expect(csvSpy).toHaveBeenCalledWith('a');

    component.generateAuditLog();
    expect(jsPDF).toHaveBeenCalled();
  });

  it('should handle room management actions', () => {
    component.newRoomName.set('New Room');
    component.saveRoomName();
    expect(socketSpy.renameRoom).toHaveBeenCalledWith('New Room');

    component.toggleLock();
    expect(component.showConfirmModal()).toBe(true);
  });

  it('should abort downloadCsv if roomState or txDetails are missing', () => {
    socketSpy.roomState.mockReturnValue(null);
    const csvSpy = vi.spyOn(document, 'createElement');
    
    component.downloadCsv();
    
    expect(csvSpy).not.toHaveBeenCalled();
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

it('should reject file over 2MB', async () => {
    const alertSpy = vi.spyOn(component, 'openAlert' as any);
    
    const largeFile = new File(['a'.repeat((2 * 1024 * 1024) + 1)], 'huge.psbt', { type: 'text/plain' });
    
    await component.onFileSelected({ target: { files: [largeFile] } } as any);
    expect(alertSpy).toHaveBeenCalledWith('File Too Large', expect.any(String));
  });

  it('should catch read error on file upload', async () => {
    const alertSpy = vi.spyOn(component, 'openAlert' as any);
    const badFile = new File([''], 'broken.psbt', { type: 'text/plain' });
    
    badFile.arrayBuffer = vi.fn().mockRejectedValue(new Error('Disk read failed'));

    await component.onFileSelected({ target: { files: [badFile] } } as any);
    expect(alertSpy).toHaveBeenCalledWith('Read Error', expect.any(String));
    expect(component.isUploading()).toBe(false);
  });

  // ====================== SECURITY & FINALIZE ======================
  it('should show security warning when finalizing with unverified outputs', () => {
    socketSpy.roomState.mockReturnValue({
      ...baseRoomState,
      psbt: 'valid',
      whitelist: ['other-address'],
      signatures: ['sig1']
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

 it('should close room with audit log and navigation', () => {
    vi.useFakeTimers(); // Enable Vitest's fake timers
    const routerSpy = vi.spyOn(router, 'navigate');
    component.closeRoom();

    component.executeConfirmAction();
    
    vi.advanceTimersByTime(300);
    
    expect(socketSpy.closeRoom).toHaveBeenCalled();
    expect(routerSpy).toHaveBeenCalledWith(['/']);
    vi.useRealTimers();
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

    socketSpy.roomState.mockReturnValue({
      ...baseRoomState,
      finalTxHex: 'finalhex123',
      network: 'testnet'
    });

    component.broadcastAndCopy();

    expect(clipboardSpy).toHaveBeenCalledWith('finalhex123');
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('testnet/tx/push'), '_blank');
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

  it('should abort downloadQr if qrDataUrl is null', () => {
    component.qrDataUrl.set(null);
    const createElementSpy = vi.spyOn(document, 'createElement');
    component.downloadQr();
    expect(createElementSpy).not.toHaveBeenCalled();
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

  it('should handle empty arrays in generateAuditLog gracefully', () => {
    socketSpy.roomState.mockReturnValue({ 
      ...baseRoomState, 
      auditLog: [], 
      participants: {},
      whitelist: []
    });
    socketSpy.txDetails.mockReturnValue({ inputsList: [], outputs: [] });
    
    component.generateAuditLog();
    
    // As long as jsPDF is called and doesn't crash, the empty branches were handled successfully
    expect(jsPDF).toHaveBeenCalled(); 
  });
});
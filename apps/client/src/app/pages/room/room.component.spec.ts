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

// Helper to create a real signal that behaves like a vi.fn() mock
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

  // Replaced vi.fn() signal properties with real reactive signals
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
    // Suppresses the JSDOM "Not implemented: navigation" warnings in stderr
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
    sessionStorage.clear(); // ADD THIS
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
    
    // Should exit early before creating the download anchor
    expect(csvSpy).not.toHaveBeenCalled();
  });

  it('should not broadcast finalization if hex or txId are missing', () => {
    socketSpy.getFinalTxHex.mockReturnValueOnce(null);
    
    component.finalize();
    
    expect(socketSpy.broadcastFinalization).not.toHaveBeenCalled();
  });

  it('should clear timer intervals on destroy', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    
    // Force a timer to start
    (component as any).startTimer(Date.now() + 5000);
    
    // Trigger the destroy lifecycle
    component.ngOnDestroy();
    
    // Ensure the cleanup function was called
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

  // Supply the actual buffer for this file so TextDecoder reads it properly
  rawTxFile.arrayBuffer = () => Promise.resolve(new TextEncoder().encode(rawTxContent).buffer);

  await component.onFileSelected({ target: { files: [rawTxFile] } } as any);
  expect(alertSpy).toHaveBeenCalledWith('Invalid File', expect.any(String));
});

it('should reject file over 2MB', async () => {
    const alertSpy = vi.spyOn(component, 'openAlert' as any);
    
    // Create a dummy file slightly larger than 2MB
    const largeFile = new File(['a'.repeat((2 * 1024 * 1024) + 1)], 'huge.psbt', { type: 'text/plain' });
    
    await component.onFileSelected({ target: { files: [largeFile] } } as any);
    expect(alertSpy).toHaveBeenCalledWith('File Too Large', expect.any(String));
  });

  it('should catch read error on file upload', async () => {
    const alertSpy = vi.spyOn(component, 'openAlert' as any);
    const badFile = new File([''], 'broken.psbt', { type: 'text/plain' });
    
    // Force the arrayBuffer method to throw an error to hit the catch block
    badFile.arrayBuffer = vi.fn().mockRejectedValue(new Error('Disk read failed'));

    await component.onFileSelected({ target: { files: [badFile] } } as any);
    expect(alertSpy).toHaveBeenCalledWith('Read Error', expect.any(String));
    expect(component.isUploading()).toBe(false); // Ensure the finally block ran
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
    expect(component.copiedSessionId()).toBe('S1'); // Should be set immediately
    
    vi.advanceTimersByTime(2000);
    expect(component.copiedSessionId()).toBeNull(); // Should reset after 2s
    
    vi.useRealTimers();
  });

  // ====================== QR CODE ======================
  it('should handle QR code generation and reveal toggle', async () => {
    await component.openQr();
    expect(component.showQrModal()).toBe(true);
    expect(component.isQrRevealed()).toBe(false);

    component.toggleQrReveal();
    expect(component.isQrRevealed()).toBe(true);

    component.downloadQr();
    component.closeQr();
    expect(component.showQrModal()).toBe(false);
  });

  it('should handle QR code generation failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Import QRCode and force it to reject
    const QRCode = await import('qrcode');
    vi.spyOn(QRCode, 'toDataURL').mockRejectedValueOnce(new Error('QR Engine Fail'));

    await component.openQr();
    
    // Should catch the error and log it without breaking the UI
    expect(consoleSpy).toHaveBeenCalledWith('QR Generation failed', expect.any(Error));
  });

  it('should copy admin token if it exists in session storage', () => {
    const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText');
    sessionStorage.setItem('admin_token_123', 'admin-secret');
    
    component.copyAdminToken();
    
    expect(clipboardSpy).toHaveBeenCalledWith('admin-secret');
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
    
    vi.advanceTimersByTime(300); // Advance time by 300ms
    
    expect(socketSpy.closeRoom).toHaveBeenCalled();
    expect(routerSpy).toHaveBeenCalledWith(['/']);
    vi.useRealTimers(); // Clean up
  });

  // ====================== SHARING & UTILS ======================
  it('should copy invite link and key', () => {
    const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText');

    component.copyInvite();
    expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining('#key'));

    component.copyKey();
    expect(clipboardSpy).toHaveBeenCalledWith('key');
  });

  it('should handle downloadUnsignedPsbt', () => {
  // 1. Create a real DOM element so we don't break Angular's renderer
  const anchor = document.createElement('a');
  const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {});
  
  // 2. Use mockReturnValueOnce to avoid polluting other tests
  const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor);
  
  // 3. Polyfill URL methods for jsdom before spying
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
  const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  component.downloadUnsignedPsbt();
  
  expect(createElementSpy).toHaveBeenCalledWith('a');
  expect(clickSpy).toHaveBeenCalled(); // Verify the download was triggered
  expect(revokeSpy).toHaveBeenCalled();
});

  it('should handle nudgeSigner', async () => {
    const alertSpy = vi.spyOn(component, 'openAlert' as any);
    component.nudgeSigner('fingerprint123');
    
    await Promise.resolve(); // Wait for the clipboard promise to resolve
    
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
});
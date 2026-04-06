import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core'; 
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
    connectedCount: 1,
    participants: {}
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
    logAction: vi.fn().mockResolvedValue(true),
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
    
    // Safely stub window.location so Link copying tests don't crash
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:4200/room/123#key' },
      writable: true
    });
    vi.stubGlobal('window', { ...window, open: vi.fn() });

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();

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
    if (component) {
      component.ngOnDestroy(); 
    }
    
    if (fixture) {
      fixture.destroy();
    }

    vi.clearAllTimers(); 
    vi.useRealTimers();      
    
    vi.clearAllMocks();
    sessionStorage.clear();
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
});
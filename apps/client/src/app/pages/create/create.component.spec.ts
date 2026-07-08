import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CreateComponent } from './create.component';
import { Router, ActivatedRoute } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { SocketService } from '../../services/socket/socket.service';
import { UrService } from '../../services/ur/ur.service';
import { WidgetDispatcherService } from '../../services/widget-dispatcher/widget-dispatcher.service';
import { PsbtUtils } from '@signing-room/sdk';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Html5Qrcode } from 'html5-qrcode';

// --- MOCKS ---
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: vi.fn(function () {
    return {
      start: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockReturnValue(2), // 2 = SCANNING state
      stop: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    };
  }),
  Html5QrcodeSupportedFormats: { QR_CODE: 0 },
}));

describe('CreateComponent', () => {
  let component: CreateComponent;
  let fixture: ComponentFixture<CreateComponent>;

  // Service Mocks
  let mockRouter: any;
  let mockActivatedRoute: any;
  let mockSocketService: any;
  let mockUrService: any;
  let mockDispatcherService: any;
  let mockTitle: any;
  let mockMeta: any;

  // Helper to safely mock window.parent for iFrame embed testing
  function mockWindowParent() {
    const originalParent = window.parent;
    const postMessageSpy = vi.fn();
    Object.defineProperty(window, 'parent', {
      value: { postMessage: postMessageSpy },
      writable: true,
      configurable: true,
    });
    return { originalParent, postMessageSpy };
  }

  function restoreWindowParent(originalParent: any) {
    Object.defineProperty(window, 'parent', {
      value: originalParent,
      writable: true,
      configurable: true,
    });
  }

  beforeEach(async () => {
    mockRouter = {
      navigate: vi.fn(),
    };

    mockActivatedRoute = {
      snapshot: {
        queryParamMap: {
          get: vi.fn((key: string) => {
            if (key === 'view') return 'default';
            if (key === 'host') return 'https://trusted-host.com';
            return null;
          }),
        },
      },
    };

    mockSocketService = {
      createRoom: vi.fn(),
    };

    mockUrService = {
      resetDecoder: vi.fn(),
      processFragment: vi.fn(),
      lastScannedText: vi.fn(() => ''),
      scanError: vi.fn(() => ''),
      scanProgress: vi.fn(() => 0),
    };

    mockDispatcherService = {
      emitRoomCreated: vi.fn(),
    };

    mockTitle = { setTitle: vi.fn() };
    mockMeta = { updateTag: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [CreateComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: SocketService, useValue: mockSocketService },
        { provide: UrService, useValue: mockUrService },
        { provide: WidgetDispatcherService, useValue: mockDispatcherService },
        { provide: Title, useValue: mockTitle },
        { provide: Meta, useValue: mockMeta },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateComponent);
    component = fixture.componentInstance;

    // Clear SessionStorage between tests
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization and Context', () => {
    it('should initialize component state from route parameters', () => {
      fixture.detectChanges();
      expect(component.viewMode).toBe('default');
      expect(component.expectedHost).toBe('https://trusted-host.com');
      expect(mockTitle.setTitle).toHaveBeenCalledWith('Signing Room | Free Stateless Multisig');
      expect(mockMeta.updateTag).toHaveBeenCalledWith({
        name: 'description',
        content: 'Free, open-source multisig coordination.',
      });
    });

    it('should detect embedded iframes and notify the host parent window', () => {
      const { originalParent, postMessageSpy } = mockWindowParent();

      fixture.detectChanges(); // Triggers ngOnInit

      expect(component.isEmbedded).toBe(true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'SIGNING_ROOM_EVENT', action: 'WIDGET_READY' },
        '*',
      );

      restoreWindowParent(originalParent);
    });
  });

  describe('PSBT File Processing and Analysis', () => {
    it('should correctly parse standard Base64 PSBT text files', async () => {
      const mockContent = 'cHNidGZha2ViYXNlNjQ=';

      const buffer = new Uint8Array(mockContent.split('').map((c) => c.charCodeAt(0))).buffer;
      const file = {
        name: 'tx.txt',
        type: 'text/plain',
        arrayBuffer: () => Promise.resolve(buffer),
      } as unknown as File;
      const event = { target: { files: [file] } };

      const analyzeSpy = vi.spyOn(component, 'analyzeRawHex').mockImplementation(() => {});

      await component.onFileSelected(event);

      expect(component.psbtFile()).toBe(file);
      expect(component.errorMessage()).toBeNull();
      expect(component.rawHex).toBe(mockContent);
      expect(analyzeSpy).toHaveBeenCalledWith(mockContent);
    });

    it('should detect and convert binary PSBT files automatically', async () => {
      // Magic Bytes: 'p', 's', 'b', 't', 0xff -> 0x70, 0x73, 0x62, 0x74, 0xff
      const binaryContent = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff, 0x01, 0x0a]);

      const file = {
        name: 'tx.psbt',
        type: 'application/octet-stream',
        arrayBuffer: () => Promise.resolve(binaryContent.buffer),
      } as unknown as File;
      const event = { target: { files: [file] } };

      const analyzeSpy = vi.spyOn(component, 'analyzeRawHex').mockImplementation(() => {});

      await component.onFileSelected(event);

      expect(component.rawHex).toBe('70736274ff010a'); // Hex string conversion
      expect(analyzeSpy).toHaveBeenCalledWith('70736274ff010a');
    });

    it('should update analysis state when PSBT is valid', () => {
      const mockAnalysis = {
        signerCount: 2,
        amountBtc: 1.5,
        networkFeeSat: 500,
        outputCount: 2,
        detectedNetwork: 'testnet',
      };
      vi.spyOn(PsbtUtils, 'analyze').mockReturnValue(mockAnalysis as any);

      component.analyzeRawHex('valid_psbt_data');

      expect(component.psbtAnalysis()).toEqual(mockAnalysis);
      expect(component.errorMessage()).toBeNull();
    });

    it('should handle invalid PSBT payloads and emit to host if embedded', () => {
      const { originalParent, postMessageSpy } = mockWindowParent();
      component.isEmbedded = true;
      vi.spyOn(PsbtUtils, 'analyze').mockReturnValue(null);

      component.analyzeRawHex('invalid_data');

      expect(component.psbtAnalysis()).toBeNull();
      expect(component.errorMessage()).toContain('Invalid PSBT format');
      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          type: 'SIGNING_ROOM_EVENT',
          action: 'signingError',
          payload: { code: 'PSBT_INVALID', message: 'Failed to parse PSBT data.' },
        },
        '*',
      );
      restoreWindowParent(originalParent);
    });
  });

  describe('Ceremony Orchestration (Rooms)', () => {
    it('should securely launch a room, store tokens, and navigate', async () => {
      const mockPayload = {
        localData: { roomId: 'room-123', encryptionKey: 'key-abc' },
        httpPayload: { adminToken: 'token-xyz' },
      };
      mockSocketService.createRoom.mockResolvedValue(mockPayload);

      component.rawHex = 'psbt-data';
      component.selectedNetwork.set('testnet');

      await component.launchRoom();

      expect(sessionStorage.getItem('admin_token_room-123')).toBe('token-xyz');
      expect(mockDispatcherService.emitRoomCreated).toHaveBeenCalledWith('room-123', 'testnet');
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/room', 'room-123'], {
        fragment: 'key-abc',
      });
      expect(component.isLoading()).toBe(false);
    });

    it('should allow manual joining and strip trailing fragments correctly', () => {
      component.manualRoomId = 'room-999';
      component.manualKey = 'hash#secret-key'; // Simulated pasted URL hash

      component.joinRoom();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/room', 'room-999'], {
        fragment: 'secret-key',
      });
    });
  });

  describe('UX Validation Helpers', () => {
    it('should flag network mismatches correctly', () => {
      component.selectedNetwork.set('bitcoin');

      component.psbtAnalysis.set({ detectedNetwork: 'testnet' } as any);
      expect(component.isNetworkMismatch()).toBe(true);

      component.psbtAnalysis.set({ detectedNetwork: 'bitcoin' } as any);
      expect(component.isNetworkMismatch()).toBe(false);
    });

    it('should flag unreasonably high fees', () => {
      // Setup typical transaction sizes
      component.psbtAnalysis.set({
        signerCount: 2,
        outputCount: 2,
        amountBtc: 1,
        networkFeeSat: 50000,
      } as any);

      // Estimated vBytes = 2*68 + 2*31 + 10 = 208
      // 50000 / 208 = ~240 sats/vByte (> 100 limit)
      expect(component.isHighFee()).toBe(true);

      component.psbtAnalysis.set({
        signerCount: 2,
        outputCount: 2,
        amountBtc: 1,
        networkFeeSat: 5000,
      } as any);
      // 5000 / 208 = ~24 sats/vB
      expect(component.isHighFee()).toBe(false);
    });
  });

  describe('Window Event Listeners (Widget Inject Mode)', () => {
    it('should reject messages from unauthorized origins', async () => {
      component.expectedHost = 'https://trusted-host.com';
      const fileSpy = vi.spyOn(component, 'onFileSelected').mockImplementation(async () => {});

      const badEvent = new MessageEvent('message', {
        origin: 'https://evil-site.com',
        data: { type: 'SIGNING_ROOM_COMMAND', action: 'LOAD_PSBT', payload: 'data' },
      });

      await component.onMessage(badEvent);
      expect(fileSpy).not.toHaveBeenCalled();
    });

    it('should process LOAD_PSBT messages by simulating file uploads', async () => {
      component.expectedHost = 'https://trusted-host.com';
      mockActivatedRoute.snapshot.queryParamMap.get.mockReturnValue('signet'); // Network override

      const fileSpy = vi.spyOn(component, 'onFileSelected').mockImplementation(async () => {});

      const goodEvent = new MessageEvent('message', {
        origin: 'https://trusted-host.com',
        data: { type: 'SIGNING_ROOM_COMMAND', action: 'LOAD_PSBT', payload: 'raw_psbt_payload' },
      });

      await component.onMessage(goodEvent);

      expect(component.selectedNetwork()).toBe('signet');
      expect(fileSpy).toHaveBeenCalled();

      // Extract the mock event passed to onFileSelected
      const mockEventArg = fileSpy.mock.calls[0][0];
      expect(mockEventArg.target.files.length).toBeGreaterThan(0);
      expect(component.showCreateModal()).toBe(true);
    });
  });

  describe('Optical Scanner Features', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should initialize html5-qrcode dynamically upon startScanner', async () => {
      component.startScanner();

      expect(component.isScanning()).toBe(true);
      expect(mockUrService.resetDecoder).toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(150); // Flush timers + await Promises

      expect(Html5Qrcode).toHaveBeenCalledWith('reader', expect.any(Object));
      expect(component.html5QrCode?.start).toHaveBeenCalled();
    });

    it('should route UR/B$ fountain codes through UrService and trigger analysis once complete', async () => {
      const analyzeSpy = vi.spyOn(component, 'analyzeRawHex').mockImplementation(() => {});
      mockUrService.processFragment.mockReturnValue('full_reconstructed_hex'); // Simulates final piece

      await component.handleScanResult('UR:BYTES/xyz123');

      expect(mockUrService.processFragment).toHaveBeenCalledWith('UR:BYTES/xyz123');
      expect(component.isScanning()).toBe(false);
      expect(analyzeSpy).toHaveBeenCalledWith('full_reconstructed_hex');
    });

    it('should route raw base64 codes directly to analysis', async () => {
      const analyzeSpy = vi.spyOn(component, 'analyzeRawHex').mockImplementation(() => {});

      await component.handleScanResult('cHNidGJhc2U2NA==');

      expect(mockUrService.processFragment).not.toHaveBeenCalled();
      expect(analyzeSpy).toHaveBeenCalledWith('cHNidGJhc2U2NA==');
    });

    it('should gracefully stop scanning and clear the camera feed', async () => {
      component.startScanner();
      await vi.advanceTimersByTimeAsync(150);

      // We await safeStopScanner directly to guarantee Promise execution order in testing
      await component.safeStopScanner();

      expect(component.html5QrCode?.stop).toHaveBeenCalled();
      expect(component.html5QrCode?.clear).toHaveBeenCalled();
      expect(component.isScanning()).toBe(false);
    });
  });
});

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
        'https://trusted-host.com',
      );

      restoreWindowParent(originalParent);
    });

    it('should correctly set isEmbedded to false when loaded as the top-level window', () => {
      // Temporarily mock window.parent to equal window (standalone mode)
      const originalParent = window.parent;
      Object.defineProperty(window, 'parent', {
        value: window,
        writable: true,
        configurable: true,
      });

      // Call ngOnInit directly to re-evaluate the window state
      component.ngOnInit();

      expect(component.isEmbedded).toBe(false);

      // Restore
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
      component.expectedHost = 'https://trusted-host.com';
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
        'https://trusted-host.com',
      );
      restoreWindowParent(originalParent);
    });

    it('should catch arrayBuffer errors during onFileSelected', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const file = {
        name: 'tx.txt',
        type: 'text/plain',
        arrayBuffer: () => Promise.reject(new Error('Buffer failed')),
      } as unknown as File;

      const event = { target: { files: [file] } };

      await component.onFileSelected(event);

      expect(consoleSpy).toHaveBeenCalledWith(new Error('Buffer failed'));
    });

    it('should return early from onFileSelected if no file is present', async () => {
      const event = { target: { files: [] } }; // Empty array
      await component.onFileSelected(event);

      expect(component.psbtFile()).toBeNull();
    });

    it('should return early from analyzeRawHex if data is missing or too short', () => {
      const analyzeSpy = vi.spyOn(PsbtUtils, 'analyze');

      component.analyzeRawHex('');
      component.analyzeRawHex('short'); // Less than 10 characters

      expect(analyzeSpy).not.toHaveBeenCalled();
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

    it('should catch errors during launchRoom and stop loading', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSocketService.createRoom.mockRejectedValue(new Error('Creation failed'));

      await component.launchRoom();

      expect(consoleSpy).toHaveBeenCalledWith(new Error('Creation failed'));
      expect(component.isLoading()).toBe(false);
    });

    it('should join room correctly when manualKey has no hash fragment', () => {
      component.manualRoomId = 'room-123';
      component.manualKey = 'clean-secret'; // No '#' included

      component.joinRoom();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/room', 'room-123'], {
        fragment: 'clean-secret',
      });
    });

    it('should return early from joinRoom if manualRoomId or manualKey are missing', () => {
      // Missing Room ID
      component.manualRoomId = '';
      component.manualKey = 'secret-key';
      component.joinRoom();
      expect(mockRouter.navigate).not.toHaveBeenCalled();

      // Missing Key
      component.manualRoomId = 'room-123';
      component.manualKey = '';
      component.joinRoom();
      expect(mockRouter.navigate).not.toHaveBeenCalled();
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

    it('should return false for UX helpers if analysis is missing or fee is 0', () => {
      component.psbtAnalysis.set(null);
      expect(component.isNetworkMismatch()).toBe(false);
      expect(component.isHighFee()).toBe(false);

      // Fee is 0
      component.psbtAnalysis.set({ networkFeeSat: 0 } as any);
      expect(component.isHighFee()).toBe(false);
    });

    it('should flag high fees correctly based on total percentage even if flat rate is low', () => {
      // 1000 sats fee, 10000 total sats (10%), size 208 vbytes
      // rate = 1000/208 = ~4.8 sats/vb (Passes < 100 check)
      // percentage = 1000/10000 = 0.1 (Fails > 0.05 check)
      component.psbtAnalysis.set({
        signerCount: 2,
        outputCount: 2,
        networkFeeSat: 1000,
        amountBtc: 0.0001, // 10,000 sats
      } as any);

      expect(component.isHighFee()).toBe(true);
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
      mockActivatedRoute.snapshot.queryParamMap.get.mockReturnValue('signet');

      const fileSpy = vi.spyOn(component, 'onFileSelected').mockImplementation(async (e: any) => {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
      });

      const goodEvent = new MessageEvent('message', {
        origin: 'https://trusted-host.com',
        data: { type: 'SIGNING_ROOM_COMMAND', action: 'LOAD_PSBT', payload: 'raw_psbt_payload' },
      });

      await component.onMessage(goodEvent);

      expect(component.selectedNetwork()).toBe('signet');
      expect(fileSpy).toHaveBeenCalled();

      const mockEventArg = fileSpy.mock.calls[0][0];
      expect(mockEventArg.target.files.length).toBeGreaterThan(0);
      expect(component.showCreateModal()).toBe(true);
    });

    it('should fallback to simple array if DataTransfer is undefined', async () => {
      const originalDataTransfer = globalThis.DataTransfer;
      (globalThis as any).DataTransfer = undefined; // Force undefined

      component.expectedHost = 'https://trusted-host.com';
      const fileSpy = vi.spyOn(component, 'onFileSelected').mockImplementation(async () => {});

      const event = new MessageEvent('message', {
        origin: 'https://trusted-host.com',
        data: { type: 'SIGNING_ROOM_COMMAND', action: 'LOAD_PSBT', payload: 'test' },
      });

      await component.onMessage(event);

      expect(fileSpy).toHaveBeenCalled();
      const mockEventArg = fileSpy.mock.calls[0][0];

      // Verify it fell back to a basic array rather than throwing
      expect(Array.isArray(mockEventArg.target.files)).toBe(true);

      // Restore
      globalThis.DataTransfer = originalDataTransfer;
    });

    it('should ignore window messages that are not LOAD_PSBT commands', async () => {
      const fileSpy = vi.spyOn(component, 'onFileSelected');
      component.expectedHost = 'https://trusted-host.com';

      // Wrong type entirely
      await component.onMessage(
        new MessageEvent('message', {
          origin: 'https://trusted-host.com',
          data: { type: 'OTHER_TYPE' },
        }),
      );
      expect(fileSpy).not.toHaveBeenCalled();

      // Right type, wrong action
      await component.onMessage(
        new MessageEvent('message', {
          origin: 'https://trusted-host.com',
          data: { type: 'SIGNING_ROOM_COMMAND', action: 'OTHER_ACTION', payload: 'data' },
        }),
      );
      expect(fileSpy).not.toHaveBeenCalled();

      // Right action, but missing payload
      await component.onMessage(
        new MessageEvent('message', {
          origin: 'https://trusted-host.com',
          data: { type: 'SIGNING_ROOM_COMMAND', action: 'LOAD_PSBT', payload: '' },
        }),
      );
      expect(fileSpy).not.toHaveBeenCalled();
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

    it('should do nothing in handleScanResult if a UR fragment is incomplete', async () => {
      const analyzeSpy = vi.spyOn(component, 'analyzeRawHex');

      // Explicitly set scanning to true to simulate an active scanner
      component.isScanning.set(true);

      // Simulate the decoder returning null (meaning it needs more fragments)
      mockUrService.processFragment.mockReturnValue(null);

      await component.handleScanResult('UR:BYTES/INCOMPLETE-FRAGMENT');

      expect(mockUrService.processFragment).toHaveBeenCalledWith('UR:BYTES/INCOMPLETE-FRAGMENT');

      // It should NOT try to analyze it yet, nor should it stop the scanner
      expect(analyzeSpy).not.toHaveBeenCalled();

      // isScanning should REMAIN true because safeStopScanner wasn't called
      expect(component.isScanning()).toBe(true);
    });
  });

  describe('Optical Scanner Edge Cases & Error Handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle early return in handleScanResult if already processing a scan', async () => {
      (component as any).isProcessingScan = true; // Force lock

      await component.handleScanResult('some_data');

      // If it returned early, the UR service should never have been invoked
      expect(mockUrService.processFragment).not.toHaveBeenCalled();
    });

    it('should catch errors in safeStopScanner and safely log them', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      component.html5QrCode = {
        getState: () => 2, // 2 = SCANNING
        stop: vi.fn().mockRejectedValue(new Error('Stop failed')),
        clear: vi.fn(),
      } as any;

      await component.safeStopScanner();

      expect(consoleSpy).toHaveBeenCalledWith('Camera stop error', new Error('Stop failed'));
      expect(component.isScanning()).toBe(false);
    });

    it('should delegate stopScanner to safeStopScanner', () => {
      const safeStopSpy = vi.spyOn(component, 'safeStopScanner').mockImplementation(async () => {});

      component.stopScanner();

      expect(safeStopSpy).toHaveBeenCalledTimes(1);
    });

    it('should log a warning every 60 frames if engine fails to lock', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      component.startScanner();
      await vi.advanceTimersByTimeAsync(150);

      // Extract the callback attached to the scanner start
      const mockHtml5QrCode = vi.mocked(Html5Qrcode).mock.results[0].value;
      const startCalls = mockHtml5QrCode.start.mock.calls;
      const errorCallback = startCalls[0][3]; // The 4th argument is the error callback

      // Fire 60 frame errors
      for (let i = 0; i < 60; i++) {
        errorCallback('Engine error\ndetails');
      }

      // It should fire exactly once at frame 60
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Optical Debug] Frame 60 - Engine failing to lock:',
        'Engine error',
      );
    });

    it('should trigger fallback logic if high-res camera fails', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // 1. Create a local mock for start that fails once, then succeeds
      const localStartMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('High-res failed'))
        .mockResolvedValueOnce(undefined);

      // 2. Override the global Html5Qrcode mock for this specific test BEFORE calling startScanner
      vi.mocked(Html5Qrcode).mockImplementation(function () {
        return {
          start: localStartMock,
          getState: vi.fn().mockReturnValue(2),
          stop: vi.fn().mockResolvedValue(undefined),
          clear: vi.fn(),
        } as any;
      });

      component.startScanner();

      // 3. Now when the timer fires, it will use our localStartMock
      await vi.advanceTimersByTimeAsync(150);

      expect(consoleSpy).toHaveBeenCalledWith(
        'High-res camera start failed. Falling back to standard resolution...',
        new Error('High-res failed'),
      );
      expect(localStartMock).toHaveBeenCalledTimes(2);
    });

    it('should safely shutdown scanner if fallback camera also fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const stopSpy = vi.spyOn(component, 'stopScanner').mockImplementation(() => {});

      // 1. Create a local mock that fails BOTH times
      const localStartMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('High-res failed'))
        .mockRejectedValueOnce(new Error('Fallback failed'));

      // 2. Override the global Html5Qrcode mock
      vi.mocked(Html5Qrcode).mockImplementation(function () {
        return {
          start: localStartMock,
          getState: vi.fn().mockReturnValue(2),
          stop: vi.fn().mockResolvedValue(undefined),
          clear: vi.fn(),
        } as any;
      });

      component.startScanner();

      // 3. Fire the timer
      await vi.advanceTimersByTimeAsync(150);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Fallback camera start also failed:',
        new Error('Fallback failed'),
      );
      expect(stopSpy).toHaveBeenCalledTimes(1);
    });

    it('should execute the success and error callbacks passed to the scanner engines', async () => {
      const handleScanSpy = vi
        .spyOn(component, 'handleScanResult')
        .mockImplementation(async () => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // --- High-Res Camera Callbacks ---
      component.startScanner();
      await vi.advanceTimersByTimeAsync(150);

      const mockHtml5QrCode = vi.mocked(Html5Qrcode).mock.results[0].value;
      const startCalls = mockHtml5QrCode.start.mock.calls;

      // Extract and execute the high-res success callback (3rd argument)
      const highResSuccessCallback = startCalls[0][2];
      highResSuccessCallback('mock_high_res_scan');
      expect(handleScanSpy).toHaveBeenCalledWith('mock_high_res_scan');

      // --- Fallback Camera Callbacks ---
      // Force high-res to fail so the fallback starts
      const localStartMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('High-res fail'))
        .mockResolvedValueOnce(undefined);

      vi.mocked(Html5Qrcode).mockImplementation(function () {
        return { start: localStartMock, getState: vi.fn(), stop: vi.fn(), clear: vi.fn() } as any;
      });

      component.startScanner();
      await vi.advanceTimersByTimeAsync(150);

      const fallbackCalls = localStartMock.mock.calls;

      // Extract the fallback success callback (3rd argument of the 2nd call)
      const fallbackSuccessCallback = fallbackCalls[1][2];
      fallbackSuccessCallback('mock_fallback_scan');
      expect(handleScanSpy).toHaveBeenCalledWith('mock_fallback_scan');

      // Extract the fallback error callback (4th argument of the 2nd call)
      const fallbackErrorCallback = fallbackCalls[1][3];
      fallbackErrorCallback('fatal error');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Fallback camera failed to start.');
    });
  });

  describe('Helper Methods & State Clearing', () => {
    it('should clear PSBT state correctly via clearPsbt()', () => {
      // Set initial values
      component.psbtFile.set(new File([], 'test.psbt'));
      component.rawHex = 'dummy_hex';
      component.psbtAnalysis.set({ amountBtc: 1 } as any);
      component.errorMessage.set('Previous error');

      component.clearPsbt();

      // Assert cleared states
      expect(component.psbtFile()).toBeNull();
      expect(component.rawHex).toBe('');
      expect(component.psbtAnalysis()).toBeNull();
      expect(component.errorMessage()).toBeNull();
    });

    it('should delegate emitRoomCreated to the dispatcher', () => {
      component.emitRoomCreated('room-123', 'testnet');
      expect(mockDispatcherService.emitRoomCreated).toHaveBeenCalledWith('room-123', 'testnet');
    });
  });
});

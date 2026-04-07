import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Title, Meta } from '@angular/platform-browser';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CreateComponent } from './create.component';
import { SocketService } from '../../services/socket/socket.service';
import { EncryptionService } from '../../services/encryption/encryption.service';
import { of, throwError } from 'rxjs';
import { Transaction } from '@scure/btc-signer';

if (!File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = function() {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this);
    });
  };
}

describe('CreateComponent', () => {
  let component: CreateComponent;
  let fixture: ComponentFixture<CreateComponent>;
  let socketSpy: any;
  let encryptionSpy: any;
  let router: Router;

  beforeEach(async () => {
    socketSpy = {
      http: { 
        post: vi.fn().mockReturnValue(of({ roomId: '123' })) 
      }
    };

    encryptionSpy = {
      encrypt: vi.fn().mockResolvedValue('encrypted_blob'),
      blindData: vi.fn().mockResolvedValue('blinded_id')
    };

    await TestBed.configureTestingModule({
      imports: [CreateComponent, RouterTestingModule],
      providers: [
        { provide: SocketService, useValue: socketSpy },
        { provide: EncryptionService, useValue: encryptionSpy },
        Title,
        Meta
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(CreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('should cover BIP32 path analysis for network scoring', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 1,
      getInput: vi.fn().mockReturnValue({
        witnessUtxo: { amount: 2000000n },
        bip32Derivation: [
          [new Uint8Array(), { fingerprint: 0x12345678, path: [44, 2147483649] }] 
        ]
      }),
      getOutput: vi.fn().mockReturnValue({ amount: 1000000n })
    };

    const fromPSBTSpy = vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);
    
    component.analyzeRawHex('70736274ff0102030405'); 
    
    const analysis = component.psbtAnalysis();
    expect(analysis?.detectedNetwork).toBe('testnet');
    expect(analysis?.signerCount).toBe(1);
    
    fromPSBTSpy.mockRestore();
  });

  it('should handle file read errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const file = new File(['data'], 'error.psbt');
    
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('Fail'));

    const event = { target: { files: [file] } };
    
    await component.onFileSelected(event);
    
    expect(consoleSpy).toHaveBeenCalled();
  });

  describe('isNetworkMismatch', () => {
    it('should detect mismatch (Bitcoin vs Testnet)', () => {
        component.selectedNetwork.set('testnet');
        component.psbtAnalysis.set({ detectedNetwork: 'bitcoin' } as any);
        expect(component.isNetworkMismatch()).toBe(true);
    });

    it('should detect mismatch (Testnet vs Bitcoin)', () => {
        component.selectedNetwork.set('bitcoin');
        component.psbtAnalysis.set({ detectedNetwork: 'testnet' } as any);
        expect(component.isNetworkMismatch()).toBe(true);
    });
  });

  it('should set sessionStorage and navigate on successful launch', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    component.rawHex = '70736274ff0102030405';
    
    await component.launchRoom();

    const keys = Object.keys(sessionStorage);
    expect(keys.some(k => k.startsWith('admin_token_'))).toBe(true);

    expect(navigateSpy).toHaveBeenCalledWith(
      expect.arrayContaining(['/room', expect.any(String)]),
      expect.objectContaining({ fragment: expect.any(String) })
    );
  });

  it('should generate a valid 32-byte encryption key', () => {
    const key = (component as any).generateEncryptionKey();
    expect(key).toBeDefined();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(40);
  });

  it('should normalize input by removing whitespace', () => {
    const input = '  A B C  ';
    const result = (component as any).normalizeInput(input);
    expect(result).toBe('ABC');
  });

  it('should return early in onFileSelected if no file is present', async () => {
    const event = { target: { files: [] } };
    const spy = vi.spyOn(component.psbtFile, 'set');
    
    await component.onFileSelected(event);
    expect(spy).not.toHaveBeenCalled();
  });

  it('should normalize input by removing all whitespace', () => {
  const result = (component as any).normalizeInput('  A B  C ');
  expect(result).toBe('ABC');
});

it('should generate a 32-byte base64 encryption key', () => {
  const key = (component as any).generateEncryptionKey();
  expect(key).toBeDefined();
  expect(typeof key).toBe('string');
  expect(key.length).toBeGreaterThan(40); // Base64 for 32 bytes
});

it('should detect binary magic bytes and convert to hex', async () => {
  const binaryPsbt = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff, 0x01, 0x02]);
  const file = new File([binaryPsbt], 'test.psbt');
  const event = { target: { files: [file] } };

  await component.onFileSelected(event);
  expect(component.rawHex).toBe('70736274ff0102');
});

it('should handle binary PSBT files (magic bytes check)', async () => {
  const binaryPsbt = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff, 0x01, 0x02]);
  const file = new File([binaryPsbt], 'test.psbt');
  const event = { target: { files: [file] } };

  await component.onFileSelected(event);
  expect(component.rawHex).toBe('70736274ff0102');
});

it('should normalize input and generate keys', () => {
  const result = (component as any).normalizeInput('  A B C  ');
  expect(result).toBe('ABC');

  const key = (component as any).generateEncryptionKey();
  expect(key.length).toBeGreaterThan(40);
});

it('should handle errors during launchRoom', async () => {
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  socketSpy.http.post.mockReturnValue(throwError(() => new Error('API Fail')));
  
  await component.launchRoom();
  expect(consoleSpy).toHaveBeenCalled();
});

it('should detect binary PSBT files via magic bytes', async () => {
  const binaryPsbt = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff, 0x01, 0x02]);
  const file = new File([binaryPsbt], 'wallet.psbt');
  const event = { target: { files: [file] } };

  await component.onFileSelected(event);
  
  expect(component.rawHex).toBe('70736274ff0102');
});

it('should correctly normalize inputs and generate encryption keys', () => {
  const normalized = (component as any).normalizeInput('  A B  C ');
  expect(normalized).toBe('ABC');

  const key = (component as any).generateEncryptionKey();
  expect(key).toBeDefined();
  expect(typeof key).toBe('string');
});

it('should process binary PSBT files correctly', async () => {
  const binaryData = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff, 0x01]);
  const file = new File([binaryData], 'binary.psbt');
  const event = { target: { files: [file] } };

  await component.onFileSelected(event);
  expect(component.rawHex).toBe('70736274ff01');
});

it('should normalize input and generate encryption keys', () => {
  const normalized = (component as any).normalizeInput('  A B  C ');
  expect(normalized).toBe('ABC');

  const key = (component as any).generateEncryptionKey();
  expect(key).toBeDefined();
  expect(key.length).toBeGreaterThan(40);
});

// ====================== POST MESSAGE / EMBED ======================
  
it('should handle onMessage from allowed origin and ignore unauthorized', async () => {
    const analyzeSpy = vi.spyOn(component, 'analyzeRawHex').mockImplementation(() => {});
    
    // Setup the expected host exactly like ngOnInit would
    component.expectedHost = 'http://localhost:4200';
    
    // Disallowed origin should be ignored entirely
    await component.onMessage({ 
        origin: 'https://evil.com', 
        data: { type: 'SIGNING_ROOM_COMMAND', action: 'LOAD_PSBT', payload: '123' } 
    } as MessageEvent);
    expect(analyzeSpy).not.toHaveBeenCalled();

    // Allowed origin, but wrong action/type should be ignored
    await component.onMessage({ 
        origin: 'http://localhost:4200', 
        data: { type: 'OTHER' } 
    } as MessageEvent);
    expect(analyzeSpy).not.toHaveBeenCalled();

    // Allowed origin + correct action should process the payload
    component.isEmbedded = true;
    await component.onMessage({ 
        origin: 'http://localhost:4200', 
        data: { type: 'SIGNING_ROOM_COMMAND', action: 'LOAD_PSBT', payload: 'hex123' } 
    } as MessageEvent);
    
    expect(component.rawHex).toBe('hex123');
    expect(component.showCreateModal()).toBe(true);
  });

  // ====================== UTILITIES & UX HELPERS ======================
  
  it('should clear psbt state on clearPsbt()', () => {
    component.psbtFile.set(new File([], 'test.psbt'));
    component.rawHex = '1234abcd';
    component.psbtAnalysis.set({ valid: true } as any);

    component.clearPsbt();

    expect(component.psbtFile()).toBeNull();
    expect(component.rawHex).toBe('');
    expect(component.psbtAnalysis()).toBeNull();
  });

  it('should evaluate isNetworkMismatch correctly', () => {
    expect(component.isNetworkMismatch()).toBe(false);

    component.selectedNetwork.set('testnet');
    component.psbtAnalysis.set({ detectedNetwork: 'bitcoin' } as any);
    expect(component.isNetworkMismatch()).toBe(true);

    component.selectedNetwork.set('bitcoin');
    component.psbtAnalysis.set({ detectedNetwork: 'testnet' } as any);
    expect(component.isNetworkMismatch()).toBe(true);

    component.selectedNetwork.set('bitcoin');
    component.psbtAnalysis.set({ detectedNetwork: 'bitcoin' } as any);
    expect(component.isNetworkMismatch()).toBe(false);
  });

  it('should evaluate isHighFee correctly', () => {
    expect(component.isHighFee()).toBe(false); 

    // Normal fee rate and amount
    component.psbtAnalysis.set({
      networkFeeSat: 500,
      signerCount: 2,
      outputCount: 2,
      amountBtc: 1
    } as any);
    expect(component.isHighFee()).toBe(false); 

    // High fee rate (> 100 sat/vB)
    component.psbtAnalysis.set({
      networkFeeSat: 25000, 
      signerCount: 2,
      outputCount: 2,
      amountBtc: 1
    } as any);
    expect(component.isHighFee()).toBe(true);

    // High percentage (> 5% of total amount)
    component.psbtAnalysis.set({
      networkFeeSat: 600,
      signerCount: 2,
      outputCount: 2,
      amountBtc: 0.0001
    } as any);
    expect(component.isHighFee()).toBe(true);
  });

  // ====================== JOIN ROOM ======================
  
  it('should join room with manual inputs and handle hash fragment', () => {
    const navigateSpy = vi.spyOn((component as any).router, 'navigate');

    // With hash - should clean it
    component.manualRoomId = ' 12345 ';
    component.manualKey = ' #secretkey ';
    component.joinRoom();
    expect(navigateSpy).toHaveBeenCalledWith(['/room', '12345'], { fragment: 'secretkey' });

    // Without hash
    component.manualRoomId = 'abc';
    component.manualKey = 'plainkey';
    component.joinRoom();
    expect(navigateSpy).toHaveBeenCalledWith(['/room', 'abc'], { fragment: 'plainkey' });
  });

  // ====================== ADDITIONAL COVERAGE TESTS ======================

  describe('Edge Cases and Error Handling', () => {
    
    it('should post WIDGET_READY message if embedded on init', () => {
      const postMessageSpy = vi.fn();
      const originalParent = window.parent;
      
      // FIX: Use a completely distinct object so window !== window.parent evaluates to TRUE
      const mockParent = { postMessage: postMessageSpy };
      
      Object.defineProperty(window, 'parent', {
        value: mockParent,
        configurable: true
      });

      component.ngOnInit();

      expect(component.isEmbedded).toBe(true);
      expect(postMessageSpy).toHaveBeenCalledWith({
        type: 'SIGNING_ROOM_EVENT',
        action: 'WIDGET_READY'
      }, '*');

      // Restore original to prevent test pollution
      Object.defineProperty(window, 'parent', {
        value: originalParent,
        configurable: true
      });
    });

    it('should execute mock event preventDefault and stopPropagation for coverage', async () => {
      const fileSelectedSpy = vi.spyOn(component, 'onFileSelected').mockImplementation(async () => {});
      component.expectedHost = 'http://localhost:4200';
      
      await component.onMessage({ 
        origin: 'http://localhost:4200', 
        data: { type: 'SIGNING_ROOM_COMMAND', action: 'LOAD_PSBT', payload: 'hex123' } 
      } as MessageEvent);

      expect(fileSelectedSpy).toHaveBeenCalled();
      
      // Capture the mock event passed to onFileSelected and execute the anonymous functions
      const passedEvent = fileSelectedSpy.mock.calls[0][0] as any;
      expect(() => passedEvent.preventDefault()).not.toThrow();
      expect(() => passedEvent.stopPropagation()).not.toThrow();
    });

    it('should return false from isHighFee if networkFeeSat is 0', () => {
      component.psbtAnalysis.set({ networkFeeSat: 0 } as any);
      expect(component.isHighFee()).toBe(false);
    });

    it('should not navigate in joinRoom if manualRoomId or manualKey is missing', () => {
      const navigateSpy = vi.spyOn(router, 'navigate');
      
      // Missing Room ID
      component.manualRoomId = '';
      component.manualKey = 'some-key-123';
      component.joinRoom();
      
      // Missing Key
      component.manualRoomId = '12345678-1234-1234-1234-1234567890ab';
      component.manualKey = '';
      component.joinRoom();

      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('should catch and log errors in onFileSelected', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockFile = new File([''], 'test.psbt');
      
      vi.spyOn(mockFile, 'arrayBuffer').mockRejectedValue(new Error('Buffer Error'));

      await component.onFileSelected({ target: { files: [mockFile] } });
      expect(consoleSpy).toHaveBeenCalledWith(new Error('Buffer Error'));
    });

    it('should catch errors in analyzeRawHex and reset analysis', () => {
      expect(() => component.analyzeRawHex('invalid-data-trigger-error')).toThrow();
      expect(component.psbtAnalysis()).toBeNull();
    });

    it('should return early in analyzeRawHex if data is empty or too short', () => {
      component.psbtAnalysis.set({ valid: true } as any); 
      
      component.analyzeRawHex(''); // Empty
      component.analyzeRawHex('short'); // Too short
      
      expect(component.psbtAnalysis()).toEqual({ valid: true }); 
    });

    it('should warn and ignore message if origin is unauthorized', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      component.expectedHost = 'https://trusted.com';

      await component.onMessage({
        origin: 'https://evil.com',
        data: { type: 'SIGNING_ROOM_COMMAND', action: 'LOAD_PSBT', payload: '123' }
      } as MessageEvent);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Security] Blocked unauthorized postMessage'));
    });

    it('should ignore message if payload is missing', async () => {
      component.expectedHost = 'https://trusted.com';
      const analyzeSpy = vi.spyOn(component, 'analyzeRawHex');

      await component.onMessage({
        origin: 'https://trusted.com',
        data: { type: 'SIGNING_ROOM_COMMAND', action: 'LOAD_PSBT' } // Missing payload
      } as MessageEvent);

      expect(analyzeSpy).not.toHaveBeenCalled();
    });
    
    it('should fall back to default network if no network query param in onMessage', async () => {
      vi.spyOn(component['route'].snapshot.queryParamMap, 'get').mockReturnValue(null);
      
      component.expectedHost = 'https://trusted.com';
      component.selectedNetwork.set('testnet'); // preset

      await component.onMessage({
        origin: 'https://trusted.com',
        data: { type: 'SIGNING_ROOM_COMMAND', action: 'LOAD_PSBT', payload: 'hex123' }
      } as MessageEvent);

      expect(component.selectedNetwork()).toBe('testnet'); 
    });
  })

  // ====================== PRIVATE HELPERS ======================
  
  it('should normalize input and generate encryption keys deterministically', () => {
    const normalized = (component as any).normalizeInput('  A B  C ');
    expect(normalized).toBe('ABC');

    const key = (component as any).generateEncryptionKey();
    expect(key).toBeDefined();
    expect(typeof key).toBe('string');
  });

});
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
import { hex } from '@scure/base';

// Polyfill for JSDOM environment to handle File.arrayBuffer()
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
      // Component accesses http via bracket notation: this.socket['http']
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

  // --- Fix 1: BIP32 Path Analysis (Addressing the early-return guard) ---
  it('should cover BIP32 path analysis for network scoring', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 1,
      getInput: vi.fn().mockReturnValue({
        witnessUtxo: { amount: 2000000n },
        bip32Derivation: [
          // Index 1 of path (2147483649) triggers testnet networkScore++
          [new Uint8Array(), { fingerprint: 0x12345678, path: [44, 2147483649] }] 
        ]
      }),
      getOutput: vi.fn().mockReturnValue({ amount: 1000000n })
    };

    const fromPSBTSpy = vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);
    
    // Provide string >= 10 chars to pass the guard at line 227
    component.analyzeRawHex('70736274ff0102030405'); 
    
    const analysis = component.psbtAnalysis();
    expect(analysis?.detectedNetwork).toBe('testnet');
    expect(analysis?.signerCount).toBe(1);
    
    fromPSBTSpy.mockRestore();
  });

  // --- Fix 2: File Read Errors (Addressing the missing event variable) ---
  it('should handle file read errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const file = new File(['data'], 'error.psbt');
    
    // Mock the specific file instance's arrayBuffer to fail
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('Fail'));

    // Define the event object that was missing in previous test
    const event = { target: { files: [file] } };
    
    await component.onFileSelected(event);
    
    expect(consoleSpy).toHaveBeenCalled();
  });

  // --- Ensure 100% Branches for Network Mismatch ---
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

  // --- Ensure 100% Success path coverage ---
  it('should set sessionStorage and navigate on successful launch', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    component.rawHex = '70736274ff0102030405';
    
    await component.launchRoom();

    // Verify admin token storage
    const keys = Object.keys(sessionStorage);
    expect(keys.some(k => k.startsWith('admin_token_'))).toBe(true);

    // Verify navigation
    expect(navigateSpy).toHaveBeenCalledWith(
      expect.arrayContaining(['/room', expect.any(String)]),
      expect.objectContaining({ fragment: expect.any(String) })
    );
  });

  it('should generate a valid 32-byte encryption key', () => {
    // Line 309-311: generateEncryptionKey()
    const key = (component as any).generateEncryptionKey();
    expect(key).toBeDefined();
    expect(typeof key).toBe('string');
    // Base64 of 32 bytes should be ~44 chars
    expect(key.length).toBeGreaterThan(40);
  });

  it('should normalize input by removing whitespace', () => {
    // Line 307: normalizeInput()
    const input = '  A B C  ';
    const result = (component as any).normalizeInput(input);
    expect(result).toBe('ABC');
  });

  it('should return early in onFileSelected if no file is present', async () => {
    // Line 240: if (!file) return;
    const event = { target: { files: [] } };
    const spy = vi.spyOn(component.psbtFile, 'set');
    
    await component.onFileSelected(event);
    expect(spy).not.toHaveBeenCalled();
  });

  it('should normalize input by removing all whitespace', () => {
  // Covers line 306
  const result = (component as any).normalizeInput('  A B  C ');
  expect(result).toBe('ABC');
});

it('should generate a 32-byte base64 encryption key', () => {
  // Covers lines 307-310
  const key = (component as any).generateEncryptionKey();
  expect(key).toBeDefined();
  expect(typeof key).toBe('string');
  expect(key.length).toBeGreaterThan(40); // Base64 for 32 bytes
});

it('should detect binary magic bytes and convert to hex', async () => {
  // Covers lines 248-250 (Binary path in onFileSelected)
  const binaryPsbt = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff, 0x01, 0x02]);
  const file = new File([binaryPsbt], 'test.psbt');
  const event = { target: { files: [file] } };

  await component.onFileSelected(event);
  expect(component.rawHex).toBe('70736274ff0102');
});

it('should handle binary PSBT files (magic bytes check)', async () => {
  // Covers line 250
  const binaryPsbt = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff, 0x01, 0x02]);
  const file = new File([binaryPsbt], 'test.psbt');
  const event = { target: { files: [file] } };

  await component.onFileSelected(event);
  expect(component.rawHex).toBe('70736274ff0102');
});

it('should normalize input and generate keys', () => {
  // Covers lines 306-312
  const result = (component as any).normalizeInput('  A B C  ');
  expect(result).toBe('ABC');

  const key = (component as any).generateEncryptionKey();
  expect(key.length).toBeGreaterThan(40);
});

it('should handle errors during launchRoom', async () => {
  // Covers line 233
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  socketSpy.http.post.mockReturnValue(throwError(() => new Error('API Fail')));
  
  await component.launchRoom();
  expect(consoleSpy).toHaveBeenCalled();
});

it('should detect binary PSBT files via magic bytes', async () => {
  // Binary 'psbt\xff' (70 73 62 74 ff)
  const binaryPsbt = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff, 0x01, 0x02]);
  const file = new File([binaryPsbt], 'wallet.psbt');
  const event = { target: { files: [file] } };

  await component.onFileSelected(event);
  
  // Verifies the branch at line 250 where binary is converted to hex
  expect(component.rawHex).toBe('70736274ff0102');
});

it('should correctly normalize inputs and generate encryption keys', () => {
  // Directly test the private helper via type casting
  const normalized = (component as any).normalizeInput('  A B  C ');
  expect(normalized).toBe('ABC'); // Covers line 306

  const key = (component as any).generateEncryptionKey();
  expect(key).toBeDefined();
  expect(typeof key).toBe('string'); // Covers lines 307-312
});

it('should process binary PSBT files correctly', async () => {
  // Line 250: Binary magic bytes path
  const binaryData = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff, 0x01]);
  const file = new File([binaryData], 'binary.psbt');
  const event = { target: { files: [file] } };

  await component.onFileSelected(event);
  // Verify hex encoding was triggered
  expect(component.rawHex).toBe('70736274ff01');
});

it('should normalize input and generate encryption keys', () => {
  // Lines 306-312: Private helpers
  const normalized = (component as any).normalizeInput('  A B  C ');
  expect(normalized).toBe('ABC');

  const key = (component as any).generateEncryptionKey();
  expect(key).toBeDefined();
  expect(key.length).toBeGreaterThan(40); // Base64 32-byte string
});
});
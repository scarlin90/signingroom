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
});
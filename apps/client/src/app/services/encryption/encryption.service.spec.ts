import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EncryptionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should generate a key string', async () => {
    const key = await service.generateKey();
    expect(key).toBeTypeOf('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('should encrypt and decrypt a message correctly', async () => {
    const key = await service.generateKey();
    const original = 'Hello World';
    
    const encrypted = await service.encrypt(original, key);
    expect(encrypted).not.toBe(original);
    
    const decrypted = await service.decrypt(encrypted, key);
    expect(decrypted).toBe(original);
  });

  it('should fail to decrypt with wrong key', async () => {
    const key1 = await service.generateKey();
    const key2 = await service.generateKey();
    const encrypted = await service.encrypt('Secret', key1);

    await expect(service.decrypt(encrypted, key2)).rejects.toThrow();
  });
});
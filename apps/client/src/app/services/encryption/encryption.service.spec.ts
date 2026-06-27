import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EncryptionService } from './encryption.service';
import { EncryptionEngine } from '@signing-room/core';

describe('EncryptionService (Angular Wrapper)', () => {
  let service: EncryptionService;
  let engine: EncryptionEngine;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EncryptionService]
    });
    service = TestBed.inject(EncryptionService);
    engine = (service as any).engine;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should delegate generateKey to the engine', async () => {
    const spy = vi.spyOn(engine, 'generateKey').mockResolvedValue('mock-key');
    const result = await service.generateKey();
    expect(spy).toHaveBeenCalled();
    expect(result).toBe('mock-key');
  });

  it('should delegate encrypt to the engine', async () => {
    const spy = vi.spyOn(engine, 'encrypt').mockResolvedValue('encrypted-val');
    const result = await service.encrypt('data', 'key');
    expect(spy).toHaveBeenCalledWith('data', 'key');
    expect(result).toBe('encrypted-val');
  });

  it('should delegate decrypt to the engine', async () => {
    const spy = vi.spyOn(engine, 'decrypt').mockResolvedValue('decrypted-val');
    const result = await service.decrypt('encrypted-data', 'key');
    expect(spy).toHaveBeenCalledWith('encrypted-data', 'key');
    expect(result).toBe('decrypted-val');
  });

  it('should delegate blindData to the engine', async () => {
    const spy = vi.spyOn(engine, 'blindData').mockResolvedValue('blind-val');
    const result = await service.blindData('data', 'key');
    expect(spy).toHaveBeenCalledWith('data', 'key');
    expect(result).toBe('blind-val');
  });
});
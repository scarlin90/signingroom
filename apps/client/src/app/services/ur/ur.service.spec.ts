import { TestBed } from '@angular/core/testing';
import { UrService } from './ur.service';
import { vi } from 'vitest';

describe('UrService', () => {
  let service: UrService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UrService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('processFragment', () => {
    it('should coerce lowercase UR fragments to uppercase before decoding', () => {
      vi.spyOn(service['decoder'], 'receivePart').mockImplementation(() => {});

      const lowerFragment = 'ur:crypto-psbt/1-1/lp...';
      service.processFragment(lowerFragment);

      expect(service['decoder'].receivePart).toHaveBeenCalledWith(lowerFragment.toUpperCase());
    });

    it('should bypass UR decoder and return BBQr directly', () => {
      const bbqrFragment = 'B$1234567890';
      const result = service.processFragment(bbqrFragment);

      expect(result).toBeDefined();
    });

    it('should strip the CBOR wrapper to expose raw PSBT magic bytes on successful decode', () => {
      vi.spyOn(service['decoder'], 'receivePart').mockImplementation(() => {});

      const mockCborBuffer = new Uint8Array([
        0x59, 0x01, 0x2c, 0x70, 0x73, 0x62, 0x74, 0xff, 0x01, 0x02,
      ]).buffer;

      vi.spyOn(service['decoder'], 'isComplete').mockReturnValue(true);
      vi.spyOn(service['decoder'], 'isSuccess').mockReturnValue(true);
      vi.spyOn(service['decoder'], 'resultUR').mockReturnValue({ cbor: mockCborBuffer } as any);
      vi.spyOn(service, 'resetDecoder');

      const result = service.processFragment('UR:CRYPTO-PSBT/1-1/MOCK');

      expect(result).toBe('70736274ff0102');
      expect(service.resetDecoder).toHaveBeenCalled();
    });

    it('should set an error state if the UR checksum fails', () => {
      vi.spyOn(service['decoder'], 'receivePart').mockImplementation(() => {});

      vi.spyOn(service['decoder'], 'isComplete').mockReturnValue(true);
      vi.spyOn(service['decoder'], 'isSuccess').mockReturnValue(false);
      vi.spyOn(service, 'resetDecoder');

      service.processFragment('UR:CRYPTO-PSBT/1-1/BADCHECKSUM');

      expect(service.scanError()).toBe('UR checksum failed. Please rescan.');
      expect(service.resetDecoder).toHaveBeenCalled();
    });

    it('should catch catastrophic outer errors gracefully', () => {
      // Passing null will crash upper.toUpperCase() and trigger the catch block
      const result = service.processFragment(null as any);

      expect(service.scanError()).toBe('Invalid QR data received.');
      expect(result).toBeNull();
    });

    it('should handle UR decoding payload extraction failures safely', () => {
      vi.spyOn(service['decoder'], 'receivePart').mockImplementation(() => {});
      vi.spyOn(service['decoder'], 'isComplete').mockReturnValue(true);
      vi.spyOn(service['decoder'], 'isSuccess').mockReturnValue(true);

      vi.spyOn(service['decoder'], 'resultUR').mockImplementation(() => {
        throw new Error('Extraction Boom');
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = service.processFragment('UR:CRYPTO-PSBT/1-1/MOCK');

      expect(result).toBeNull();
      expect(service.scanError()).toBe('UR decoded but payload extraction failed');
    });
  });

  describe('generateFrames (Export)', () => {
    it('should generate UR frames from a valid PSBT base64 string', () => {
      const mockPsbtBase64 = 'cHNidP8BAg==';
      const frames = service.generateFrames(mockPsbtBase64, 50);

      expect(Array.isArray(frames)).toBe(true);
      expect(frames.length).toBeGreaterThan(0);
      expect(frames[0].toUpperCase().startsWith('UR:CRYPTO-PSBT')).toBe(true);
    });
  });

  describe('BBQr Processing (B$)', () => {
    it('should correctly identify and route a single-part BBQr code', () => {
      // B$HP0100 -> Hex encoding (H), Padding (P), 01 total part, 00 index
      const result = service.processFragment('B$HP0100MOCKHEXDATA');

      // Since it succeeds, resetDecoder() is called, which brings progress back to 0
      expect(service.scanProgress()).toBe(0);
      expect(result).toBe('MOCKHEXDATA');
    });

    it('should accumulate multi-part BBQr frames and return null while incomplete', () => {
      // 02 total parts, 00 index (1st part)
      const result = service.processFragment('B$HP0200MOCKPART1');

      expect(result).toBeNull();
      expect(service.scanProgress()).toBe(0.5);
    });

    it('should handle duplicate BBQr frames gracefully without failing', () => {
      service.processFragment('B$HP0200MOCKPART1');
      const progressAfterFirst = service.scanProgress();

      // Send duplicate
      const result = service.processFragment('B$HP0200MOCKPART1');

      expect(result).toBeNull();
      expect(service.scanProgress()).toBe(progressAfterFirst);
      expect(service.scanError()).toBeNull();
    });

    it('should catch errors when BBQr parsing throws an exception on final assembly', () => {
      // Z encoding (Zlib) -> 'B$ZP0200' and 'B$ZP0201'
      service.processFragment('B$ZP0200INVALID');
      service.processFragment('B$ZP0201GARBAGE');

      expect(service.scanError()).toBe('Decoding failure. Check wallet settings.');
    });
  });

  describe('generateBBQrFrames (Export)', () => {
    it('should generate BBQr frames from a valid PSBT base64 string', () => {
      const mockPsbtBase64 = 'cHNidP8BAg==';
      // Set char limit to 10 so it splits our tiny mock into multiple frames
      const frames = service.generateBBQrFrames(mockPsbtBase64, 10);

      expect(Array.isArray(frames)).toBe(true);
      expect(frames.length).toBeGreaterThan(0);
      expect(frames[0].startsWith('B$HP')).toBe(true);
    });

    it('should throw an error if the PSBT is too massive for BBQr', () => {
      // Force an artificial overflow by setting charsPerFrame to 1 on a large string
      const massiveBase64 = 'a'.repeat(2000);
      expect(() => service.generateBBQrFrames(massiveBase64, 1)).toThrow('PSBT too large for BBQr');
    });
  });
});

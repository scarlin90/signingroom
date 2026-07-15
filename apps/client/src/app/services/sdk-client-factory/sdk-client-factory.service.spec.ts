import { TestBed } from '@angular/core/testing';
import { SDKClientFactoryService, PROTOCOL_VERSION } from './sdk-client-factory.service';
import { environment } from '../../../environments/environment';
import { SigningRoomClient } from '@signing-room/sdk';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock the SDK module so we don't instantiate the real client
vi.mock('@signing-room/sdk', () => ({
  SigningRoomClient: vi.fn(),
}));

describe('SDKClientFactoryService', () => {
  let service: SDKClientFactoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SDKClientFactoryService],
    });

    service = TestBed.inject(SDKClientFactoryService);

    // Clear mock history before each test to ensure accurate call counts
    vi.clearAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('create()', () => {
    it('should initialize the client using default environment and protocol values when no config is provided', () => {
      service.create();

      expect(SigningRoomClient).toHaveBeenCalledTimes(1);
      expect(SigningRoomClient).toHaveBeenCalledWith({
        apiUrl: environment.apiUrl,
        protocolVersion: PROTOCOL_VERSION,
      });
    });

    it('should override the apiUrl when provided in the config', () => {
      const customApiUrl = 'https://custom-api.stateless.com';

      service.create({ apiUrl: customApiUrl });

      expect(SigningRoomClient).toHaveBeenCalledTimes(1);
      expect(SigningRoomClient).toHaveBeenCalledWith({
        apiUrl: customApiUrl,
        protocolVersion: PROTOCOL_VERSION, // Should fallback to default
      });
    });

    it('should override the protocolVersion when provided in the config', () => {
      const customVersion = '2.0.0-beta';

      service.create({ protocolVersion: customVersion });

      expect(SigningRoomClient).toHaveBeenCalledTimes(1);
      expect(SigningRoomClient).toHaveBeenCalledWith({
        apiUrl: environment.apiUrl, // Should fallback to default
        protocolVersion: customVersion,
      });
    });

    it('should override both apiUrl and protocolVersion when both are provided', () => {
      const customConfig = {
        apiUrl: 'https://testnet.api.stateless.com',
        protocolVersion: '9.9.9',
      };

      service.create(customConfig);

      expect(SigningRoomClient).toHaveBeenCalledTimes(1);
      expect(SigningRoomClient).toHaveBeenCalledWith(customConfig);
    });
  });
});

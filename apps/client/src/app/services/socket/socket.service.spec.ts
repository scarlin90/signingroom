import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SocketService } from './socket.service';
import { EncryptionService } from '../encryption/encryption.service';
import { environment } from '../../../environments/environment';

class MockWebSocket {
  onopen: any;
  onmessage: any;
  onclose: any;
  onerror: any;
  send = vi.fn();
  close = vi.fn();
  readyState = WebSocket.OPEN;
}

describe('SocketService', () => {
  let service: SocketService;
  let httpMock: HttpTestingController;
  let ws: MockWebSocket;
  
  // Mock EncryptionService
  const encryptionMock = {
    encrypt: vi.fn().mockResolvedValue('encrypted_data'),
    decrypt: vi.fn().mockResolvedValue('decrypted_data')
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        SocketService,
        { provide: EncryptionService, useValue: encryptionMock }
      ]
    });

    service = TestBed.inject(SocketService);
    httpMock = TestBed.inject(HttpTestingController);

    // Mock global WebSocket
    ws = new MockWebSocket();
    vi.stubGlobal('WebSocket', vi.fn(() => ws));
  });

  afterEach(() => {
    httpMock.verify();
    vi.unstubAllGlobals();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should connect via WebSocket', () => {
    service.connect('room-1', 'key');
    expect(WebSocket).toHaveBeenCalledWith(expect.stringContaining('/api/room/room-1/websocket'));
    expect(service.status()).toBe('connecting');
  });

  it('should authenticate automatically if token exists', () => {
    sessionStorage.setItem('admin_token_room-1', 'secret');
    service.connect('room-1', 'key');
    
    // Simulate WS Open
    ws.onopen();
    
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"AUTH"'));
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"token":"secret"'));
    sessionStorage.removeItem('admin_token_room-1');
  });

  it('should handle incoming state sync', async () => {
    service.connect('room-1', 'key');
    
    const mockStateMsg = {
      type: 'STATE_SYNC',
      roomId: 'room-1',
      psbt: 'mock_encrypted_psbt',
      connectedCount: 3,
      tier: 'free'
    };

    // Trigger message handling
    await (service as any).handleMessage(mockStateMsg);

    expect(encryptionMock.decrypt).toHaveBeenCalled();
    expect(service.roomState()?.connectedCount).toBe(3);
  });

  it('should create an invoice via HTTP', () => {
    service.roomState.set({ roomId: '123' } as any);
    
    service.createInvoice(1000, 'test').subscribe(res => {
      expect(res.payment_request).toBe('lnbc...');
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/room/123/invoice`);
    expect(req.request.method).toBe('POST');
    req.flush({ payment_request: 'lnbc...', payment_hash: 'hash' });
  });
});
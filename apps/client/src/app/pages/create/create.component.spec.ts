import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateComponent } from './create.component';
import { SocketService } from '../../services/socket/socket.service';
import { EncryptionService } from '../../services/encryption/encryption.service';
import { of } from 'rxjs';

describe('CreateComponent', () => {
  let component: CreateComponent;
  let fixture: ComponentFixture<CreateComponent>;
  let socketSpy: any;
  let encryptionSpy: any;

  beforeEach(async () => {
    socketSpy = {
      getGenesisStock: vi.fn().mockReturnValue(of({ sold: 0, remaining: 21 })),
      buyLicense: vi.fn(),
      waitForLicenseKey: vi.fn(),
      // Mock the internal 'http' client used in launchRoom
      http: { post: vi.fn().mockReturnValue(of({ roomId: '123', adminToken: 'abc' })) }
    };

    encryptionSpy = {
      encrypt: vi.fn().mockResolvedValue('encrypted_psbt')
    };

    await TestBed.configureTestingModule({
      imports: [CreateComponent, RouterTestingModule],
      providers: [
        { provide: SocketService, useValue: socketSpy },
        { provide: EncryptionService, useValue: encryptionSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should detect network mismatch', () => {
    // Setup mismatched state: Analysis says Mainnet, User selected Testnet
    component.selectedNetwork.set('testnet');
    component.psbtAnalysis.set({
      valid: true,
      detectedNetwork: 'bitcoin', // Mainnet
      signerCount: 1,
      amountBtc: 1,
      networkFeeSat: 100,
      outputCount: 1
    });

    expect(component.isNetworkMismatch()).toBe(true);
  });

  it('should correctly flag free tier limits', () => {
    // Free tier selected
    component.selectedTier.set('free');
    component.modalLicenseKey = ''; // No license

    // Analysis with 5 signers (Limit is 3)
    component.psbtAnalysis.set({
      valid: true,
      signerCount: 5,
      amountBtc: 1,
      networkFeeSat: 100,
      outputCount: 1,
      detectedNetwork: 'bitcoin'
    });

    expect(component.isSignerLimitExceeded()).toBe(true);
  });

  it('should launch room successfully', async () => {
    component.rawHex = "70736274ff"; // Magic bytes
    
    await component.launchRoom();
    
    expect(encryptionSpy.encrypt).toHaveBeenCalled();
    expect(socketSpy.http.post).toHaveBeenCalled();
  });
});
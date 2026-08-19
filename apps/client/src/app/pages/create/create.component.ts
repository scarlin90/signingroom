/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Component, OnInit, signal, inject, HostListener, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PsbtUtils, PsbtAnalysis, EncryptionEngine } from '@signing-room/sdk';
import { ConfigService } from '../../services/config/config.service';

import {
  LucideZap,
  LucideCheck,
  LucideLoader2,
  LucideX,
  LucideUploadCloud,
  LucideFileJson,
  LucideAlertTriangle,
  LucideShield,
  LucideKey,
  LucideUsers,
  LucideEye,
  LucideEyeOff,
  LucideQrCode,
  LucideEdit2,
} from '@lucide/angular';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { UrService } from '../../services/ur/ur.service';
import { WidgetDispatcherService } from '../../services/widget-dispatcher/widget-dispatcher.service';
import { SocketService } from '../../services/socket/socket.service';

const NETWORKS = ['bitcoin', 'testnet', 'signet'] as const;
type Network = (typeof NETWORKS)[number];

@Component({
  selector: 'app-create',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    LucideCheck,
    LucideLoader2,
    LucideX,
    LucideUploadCloud,
    LucideFileJson,
    LucideAlertTriangle,
    LucideShield,
    LucideEye,
    LucideEyeOff,
    LucideQrCode,
    LucideEdit2,
  ],
  templateUrl: './create.component.html',
  providers: [EncryptionEngine],
})
export class CreateComponent implements OnInit {
  public viewMode: 'default' | 'inject' | 'join' = 'default';
  public showManualRoomId = false;
  public showManualKey = false;
  public expectedHost = '';

  private socket = inject(SocketService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  public urService = inject(UrService);
  private dispatcher = inject(WidgetDispatcherService);
  private encryptionEngine = inject(EncryptionEngine);
  public readonly configService = inject(ConfigService);

  readonly networks = NETWORKS;

  public selectedNetwork = signal<Network>('bitcoin');
  public psbtFile = signal<File | null>(null);
  public psbtAnalysis = signal<PsbtAnalysis | null>(null);
  public rawHex = '';
  public showCreateModal = signal(false);
  public isLoading = signal(false);
  public errorMessage = signal<string | null>(null);

  // --- EMBED PROPERTIES ---
  public isEmbedded = false;
  public manualRoomId = '';
  public manualKey = '';

  isScanning = signal<boolean>(false);
  public html5QrCode: Html5Qrcode | null = null;

  @HostListener('window:message', ['$event'])
  async onMessage(event: MessageEvent) {
    if (this.expectedHost && event.origin !== this.expectedHost) {
      console.warn(`[Security] Blocked unauthorized postMessage from: ${event.origin}`);
      return;
    }

    if (event.data?.type === 'SIGNING_ROOM_COMMAND') {
      if (event.data.action === 'LOAD_PSBT' && event.data.payload) {
        const hostNetwork = this.route.snapshot.queryParamMap.get('network');
        if (hostNetwork) {
          this.selectedNetwork.set(hostNetwork as any);
        }

        const payloadString = event.data.payload.trim();

        const dummyFile = new File([payloadString], 'loaded_transaction.psbt.txt', {
          type: 'text/plain',
        });

        let files: any = [dummyFile];
        if (typeof DataTransfer !== 'undefined') {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(dummyFile);
          files = dataTransfer.files;
        }

        const mockEvent = {
          target: { files: files },
          preventDefault: () => {},
          stopPropagation: () => {},
        };

        await this.onFileSelected(mockEvent as any);
        this.showCreateModal.set(true);
      }
    }
  }

  ngOnInit() {
    this.viewMode = (this.route.snapshot.queryParamMap.get('view') as any) || 'default';

    this.expectedHost = this.route.snapshot.queryParamMap.get('host') || '';

    if (typeof window !== 'undefined') {
      if (!this.expectedHost) {
        this.expectedHost = window.location.origin;
      }

      this.isEmbedded = window !== window.parent || window !== window.top;

      if (this.isEmbedded) {
        window.parent.postMessage(
          {
            type: 'SIGNING_ROOM_EVENT',
            action: 'WIDGET_READY',
          },
          this.expectedHost,
        );
      }
    }
  }

  clearPsbt() {
    this.psbtFile.set(null);
    this.rawHex = '';
    this.psbtAnalysis.set(null);
    this.errorMessage.set(null);
  }

  async launchRoom() {
    this.isLoading.set(true);
    try {
      const createRoomPayload = await this.socket.createRoom(
        this.rawHex,
        this.selectedNetwork(),
        'Untitled Room',
      );

      const encryptedToken = await this.encryptionEngine.encrypt(
        createRoomPayload.httpPayload.adminToken,
        createRoomPayload.localData.encryptionKey,
      );

      sessionStorage.setItem(`admin_token_${createRoomPayload.localData.roomId}`, encryptedToken);
      this.dispatcher.emitRoomCreated(createRoomPayload.localData.roomId, this.selectedNetwork());
      this.router.navigate(['/room', createRoomPayload.localData.roomId], {
        fragment: createRoomPayload.localData.encryptionKey,
      });
    } catch (e) {
      console.error(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  joinRoom() {
    if (this.manualRoomId && this.manualKey) {
      const cleanKey = this.manualKey.includes('#') ? this.manualKey.split('#')[1] : this.manualKey;

      this.router.navigate(['/room', this.manualRoomId.trim()], {
        fragment: cleanKey.trim(),
      });
    }
  }

  async onFileSelected(event: any) {
    const file = event.target.files[0];

    if (!file) return;

    this.psbtFile.set(file);
    this.errorMessage.set(null);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // Magic bytes check for Binary PSBT (psbt\xff)
      const isBinary =
        bytes[0] === 0x70 &&
        bytes[1] === 0x73 &&
        bytes[2] === 0x62 &&
        bytes[3] === 0x74 &&
        bytes[4] === 0xff;

      const content = isBinary
        ? Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
        : new TextDecoder().decode(bytes).trim();

      this.rawHex = content;

      this.analyzeRawHex(content);
    } catch (e) {
      console.error(e);
    }
  }

  analyzeRawHex(data: string) {
    if (!data || data.length < 10) return;

    const analysis = PsbtUtils.analyze(data);

    if (analysis) {
      this.psbtAnalysis.set(analysis);
      this.errorMessage.set(null);
    } else {
      this.psbtAnalysis.set(null);
      this.errorMessage.set(
        'Invalid PSBT format. Please ensure you are providing a valid Base64 or Hex encoded Partially Signed Bitcoin Transaction.',
      );

      if (this.isEmbedded) {
        window.parent.postMessage(
          {
            type: 'SIGNING_ROOM_EVENT',
            action: 'signingError',
            payload: {
              code: 'PSBT_INVALID',
              message: 'Failed to parse PSBT data.',
            },
          },
          this.expectedHost,
        );
      }
    }
  }

  emitRoomCreated(roomId: string, network: string): void {
    this.dispatcher.emitRoomCreated(roomId, network);
  }

  // UX Helpers
  isNetworkMismatch(): boolean {
    const analysis = this.psbtAnalysis();
    if (!analysis) return false;
    return (
      (analysis.detectedNetwork === 'bitcoin' && this.selectedNetwork() !== 'bitcoin') ||
      (analysis.detectedNetwork === 'testnet' && this.selectedNetwork() === 'bitcoin')
    );
  }

  isHighFee(): boolean {
    const analysis = this.psbtAnalysis();
    if (!analysis || analysis.networkFeeSat === 0) return false;
    const estVBytes = analysis.signerCount * 68 + analysis.outputCount * 31 + 10;
    const rate = analysis.networkFeeSat / estVBytes;
    const totalSats = analysis.amountBtc * 100000000;
    return rate > 100 || (totalSats > 0 && analysis.networkFeeSat / totalSats > 0.05);
  }

  private isProcessingScan = false;

  async startScanner() {
    this.isScanning.set(true);
    this.isProcessingScan = false;
    this.errorMessage.set(null); // Clear old errors
    this.urService.resetDecoder();

    setTimeout(async () => {
      this.html5QrCode = new Html5Qrcode('reader', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      });

      let frameCount = 0;

      try {
        await this.html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            disableFlip: true,
            qrbox: { width: 350, height: 350 },
            videoConstraints: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          (decodedText) => this.handleScanResult(decodedText),
          (errorMessage) => {
            frameCount++;
            if (frameCount % 60 === 0) {
              console.warn(
                `[Optical Debug] Frame ${frameCount} - Engine failing to lock:`,
                errorMessage.split('\n')[0],
              );
            }
          },
        );
      } catch (err) {
        console.warn('High-res camera start failed. Falling back to standard resolution...', err);

        try {
          await this.html5QrCode.start(
            { facingMode: 'environment' },
            { fps: 10, disableFlip: false },
            (decodedText) => this.handleScanResult(decodedText),
            () => {
              console.error('Fallback camera failed to start.');
            },
          );
        } catch (fallbackErr) {
          console.error('Fallback camera start also failed:', fallbackErr);
          this.stopScanner();
        }
      }
    }, 100);
  }

  async handleScanResult(decodedText: string) {
    if (this.isProcessingScan) return;

    const upper = decodedText.toUpperCase();

    // Route BOTH Fountain Codes (UR) and Coldcard BBQr codes (B$) to the Omni-Decoder
    if (upper.startsWith('UR:') || upper.startsWith('B$')) {
      const fullHex = this.urService.processFragment(decodedText);

      if (fullHex) {
        this.isProcessingScan = true;
        await this.safeStopScanner();

        this.rawHex = fullHex;

        this.analyzeRawHex(fullHex);
        this.isProcessingScan = false;
      }
    } else {
      this.isProcessingScan = true;
      await this.safeStopScanner();

      this.rawHex = decodedText;

      this.analyzeRawHex(decodedText);
      this.isProcessingScan = false;
    }
  }

  async safeStopScanner() {
    if (this.html5QrCode) {
      try {
        if (this.html5QrCode.getState() === 2) {
          await this.html5QrCode.stop();
        }
        this.html5QrCode.clear();
      } catch (e) {
        console.error('Camera stop error', e);
      }
    }
    this.isScanning.set(false);
  }

  stopScanner() {
    this.safeStopScanner();
  }
}

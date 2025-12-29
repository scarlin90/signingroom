/*
 * Copyright (C) 2025 Sean Carlin
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 */

import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http'; 
import { firstValueFrom } from 'rxjs';
import { Transaction } from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import { environment } from '../../../environments/environment';
import { EncryptionService } from '../encryption/encryption.service';

// -------------------------------------------------------------------------
// Interfaces
// -------------------------------------------------------------------------

export interface AuditEntry {
  timestamp: number;
  event: string;
  detail?: string;
  user: string;
}

export interface RoomState {
  roomId: string;
  roomName: string;
  tier: 'free' | 'enterprise';
  isPaid: boolean;
  isGenesis?: boolean;
  network: 'bitcoin' | 'testnet' | 'signet';
  
  // Transaction Data
  psbt: string; 
  signatures: string[]; 
  
  // Metadata
  connectedCount: number;
  createdAt: number;
  expiresAt: number;
  isExtended: boolean;
  isLocked: boolean;
  
  // Governance
  auditLog: AuditEntry[];
  signerLabels: Record<string, string>; 
  whitelist: string[];
}

export interface SignerStatus {
  fingerprint: string;
  signed: boolean;
}

export interface TxDetails {
  amount: number;
  fee: number;
  vBytes: number;
  feeRate: number;
  inputs: number;
  inputsList: { address: string; amount: number; txId: string; vout: number }[];
  outputs: { address: string; amount: number; isChange: boolean }[];
}

type DerivationEntry = [Uint8Array, { fingerprint: number; path: number[] }];

@Injectable({ providedIn: 'root' })
export class SocketService {
  private ws: WebSocket | null = null;
  private encryptionKey: string | null = null; 

  // -------------------------------------------------------------------------
  // Signals
  // -------------------------------------------------------------------------
  
  // Connection Status
  public status = signal<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  public role = signal<'guest' | 'admin'>('guest');
  
  // Room Data
  public roomState = signal<RoomState | null>(null);
  
  // Error Flags
  public isRoomFull = signal(false);
  public isClosed = signal(false);
  public isLockedOut = signal(false);
  public roomNotFound = signal(false);
  public decryptionError = signal<string | null>(null);

  // -------------------------------------------------------------------------
  // Computed State
  // -------------------------------------------------------------------------

  public isCoordinator = computed(() => this.role() === 'admin');

  public signers = computed(() => {
    const state = this.roomState();
    if (!state?.psbt) return [];
    return this.extractSigners(state.psbt);
  });

  public signerCount = computed(() => {
    return this.signers().filter(signer => signer.signed).length;
  });

  public isReadyToBroadcast = computed(() => {
    const s = this.signers();
    return s.length > 0 && s.every(signer => signer.signed);
  });

  public txDetails = computed<TxDetails | null>(() => {
    const state = this.roomState();
    if (!state?.psbt) return null;
    return this.parseTxDetails(state.psbt);
  });

  constructor(
    private http: HttpClient,
    private encryption: EncryptionService
  ) {}

  // -------------------------------------------------------------------------
  // Connection Management
  // -------------------------------------------------------------------------

  /**
   * Connects to the WebSocket room.
   * @param roomId The UUID of the room.
   * @param key The decryption key from the URL hash.
   */
  connect(roomId: string, key: string | null) { 
    const licenseKey = localStorage.getItem('signing_room_license');
    this.reset();
    this.encryptionKey = key; 
    
    // Initialize default empty state to prevent UI flicker
    this.roomState.set(this.getInitialState(roomId));

    if (this.ws) this.disconnect(false);
    this.status.set('connecting');

    const apiBase = environment.apiUrl; 
    const wsBase = apiBase.replace(/^http/, 'ws');
    const url = `${wsBase}/api/room/${roomId}/websocket`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WS Connected');
      this.status.set('connected');

      // Verify License on connect if saved locally
      if (licenseKey) this.send('VERIFY_LICENSE', { key: licenseKey });

      // Auto-Claim admin if token exists in session
      const token = sessionStorage.getItem(`admin_token_${roomId}`);
      if (token) this.send('AUTH', { token });
    };

    this.ws.onmessage = (event) => this.handleMessage(JSON.parse(event.data));
    
    this.ws.onclose = (event) => {
      this.status.set('disconnected');
      this.role.set('guest');
      
      if (event.code === 4001) {
          this.isRoomFull.set(true);
          return; 
      }

      // Auto-reconnect if not intentionally closed
      if (!this.isClosed()) {
          setTimeout(() => {
            if (this.status() === 'disconnected') this.connect(roomId, this.encryptionKey);
          }, 3000);
      }
    };

    this.ws.onerror = (e) => {
      console.error('WS Error', e);
      this.status.set('error');
    };
  }

  disconnect(clearState = true) {
    if (this.ws) { 
        this.ws.onclose = null; 
        this.ws.close(); 
        this.ws = null; 
    }
    this.status.set('disconnected');
    if (clearState) this.reset();
  }

  // -------------------------------------------------------------------------
  // Public Actions
  // -------------------------------------------------------------------------

  /** Uploads a signed PSBT chunk (encrypted) to the room. */
  async uploadSignature(partialPsbtBase64: string) {
      if (!this.encryptionKey) return;

      const currentRoom = this.roomState();
      let payloadToSend = partialPsbtBase64;
      const detectedFingerprint = this.getFingerprintFromPsbt(partialPsbtBase64);

      // Merge client-side first if possible
      if (currentRoom?.psbt) {
          try {
              payloadToSend = this.mergePsbts(currentRoom.psbt, partialPsbtBase64);
          } catch (e) { console.error("Client-side merge failed", e); }
      }

      const encryptedData = await this.encryption.encrypt(payloadToSend, this.encryptionKey);
      
      this.send('UPLOAD_PARTIAL', { 
          data: { encryptedData },
          fingerprint: detectedFingerprint 
      });
  }

  claimCoordinator(password: string) { 
    this.send('AUTH', { token: password }); 
  }

  closeRoom() { 
    this.send('CLOSE_ROOM'); 
  }

  logAction(action: string, detail: string = '') {
      this.send('LOG_ACTION', { action, detail });
  }

  renameRoom(name: string) {
      this.send('RENAME_ROOM', { name });
  }

  updateSignerLabel(fingerprint: string, label: string) {
      this.send('UPDATE_LABEL', { fingerprint, label });
  }

  updateWhitelist(address: string, remove: boolean) {
      this.send('UPDATE_WHITELIST', { address, remove });
  }

  toggleLock(locked: boolean) {
      this.send('TOGGLE_LOCK', { locked });
  }

  // -------------------------------------------------------------------------
  // PSBT & Crypto Logic
  // -------------------------------------------------------------------------

  /** Finalizes the transaction and returns the hex string ready for broadcast. */
  getFinalTxHex(): string | null {
    if (this.role() !== 'admin') return null;
    const state = this.roomState();
    if (!state?.psbt) return null;
    try {
        const tx = Transaction.fromPSBT(base64.decode(state.psbt));
        tx.finalize(); 
        return hex.encode(tx.extract());
    } catch (e) { return null; }
  }

  getFinalTxId(): string | null {
    if (this.role() !== 'admin') return null;
    const state = this.roomState();
    if (!state?.psbt) return null;
    try {
        const tx = Transaction.fromPSBT(base64.decode(state.psbt));
        tx.finalize(); 
        return tx.id; 
    } catch (e) { return null; }
  }

  mergePsbts(base: string, next: string): string {
    try {
        const baseBytes = this.decodePsbt(base);
        const nextBytes = this.decodePsbt(next);
        const txBase = Transaction.fromPSBT(baseBytes);
        const txNext = Transaction.fromPSBT(nextBytes);
        txBase.combine(txNext);
        return base64.encode(txBase.toPSBT());
    } catch (e) {
        console.error("[Merge Failed]", e);
        return base;
    }
  }

  getThreshold(psbtBase64: string): number {
    try {
        const tx = Transaction.fromPSBT(base64.decode(psbtBase64));
        const input = tx.getInput(0);
        const script = input.witnessScript || input.redeemScript;
        if (!script || script.length === 0) return 0;

        // OP_M (0x51..0x60) check
        const firstOp = script[0];
        if (firstOp >= 0x51 && firstOp <= 0x60) {
            return firstOp - 0x50; 
        }
        return 0;
    } catch (e) { return 0; }
  }

  // -------------------------------------------------------------------------
  // Licensing & Payments
  // -------------------------------------------------------------------------

  createInvoice(amount: number, memo: string) {
      const roomId = this.roomState()?.roomId;
      if (!roomId) return Promise.reject('No room ID');
      return firstValueFrom(this.http.post<{ payment_request: string, payment_hash: string }>(
          `${environment.apiUrl}/api/room/${roomId}/invoice`, { amount, memo }
      ));
  }

  createTimeExtensionInvoice(amount: number = 5000) {
      return this.createInvoice(amount, "Extend Room (+24h)");
  }

  buyLicense(type: 'annual' | 'genesis') {
      return this.http.post<{ payment_request: string, payment_hash: string }>(
          `${environment.apiUrl}/api/license/buy`, { type }
      );
  }

  async waitForPayment(roomId: string, paymentHash: string): Promise<boolean> {
      return this.pollPayment(roomId, paymentHash, 'extend');
  }

  async waitForUnlock(roomId: string, paymentHash: string): Promise<boolean> {
      return this.pollPayment(roomId, paymentHash, 'unlock');
  }

  async waitForLicenseKey(paymentHash: string): Promise<string | null> {
      for (let i = 0; i < 60; i++) { 
          await new Promise(resolve => setTimeout(resolve, 3000));
          try {
              const res = await firstValueFrom(this.http.get<{ ready: boolean, apiKey?: string }>(
                  `${environment.apiUrl}/api/license/claim/${paymentHash}`
              ));
              if (res.ready && res.apiKey) return res.apiKey;
          } catch(e) {}
      }
      return null;
  }

  getGenesisStock() {
      return this.http.get<{ sold: number, remaining: number }>(`${environment.apiUrl}/api/license/stock`);
  }

  rotateLicense(oldKey: string) {
      return this.http.post<{ newKey: string }>(`${environment.apiUrl}/api/license/rotate`, { oldKey });
  }

  // -------------------------------------------------------------------------
  // Address Book Logic
  // -------------------------------------------------------------------------

  getLocalLabel(fingerprint: string): string | null {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(`addr_book_${fingerprint}`) : null;
  }

  saveToAddressBook(fingerprint: string, label: string) {
      if (typeof localStorage !== 'undefined') localStorage.setItem(`addr_book_${fingerprint}`, label);
  }

  removeFromAddressBook(fingerprint: string) {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(`addr_book_${fingerprint}`);
  }

  checkAndApplyLocalLabels() {
      if (!this.isCoordinator()) return; 
      const state = this.roomState();
      if (!state) return;

      const currentLabels = state.signerLabels || {};
      const signers = this.signers();

      signers.forEach(signer => {
          if (!currentLabels[signer.fingerprint]) {
              const savedName = this.getLocalLabel(signer.fingerprint);
              if (savedName) this.updateSignerLabel(signer.fingerprint, savedName);
          }
      });
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private send(type: string, payload: any = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  private reset() {
    this.roomState.set(null);
    this.role.set('guest');
    this.isClosed.set(false); 
    this.encryptionKey = null; 
    this.decryptionError.set(null);
    this.isLockedOut.set(false);
    this.isRoomFull.set(false);
    this.roomNotFound.set(false);
  }

  private getInitialState(roomId: string): RoomState {
      return {
        roomId, psbt: '', signatures: [], connectedCount: 0, createdAt: Date.now(),
        expiresAt: Date.now() + 1200000, isExtended: false, tier: 'free', isPaid: true,
        auditLog: [], signerLabels: {}, roomName: 'Signing Room', whitelist: [],
        isLocked: false, network: 'bitcoin'
      };
  }

  private async handleMessage(msg: any) {
    if (!this.encryptionKey && (msg.encryptedPsbt || msg.type === 'NEW_PARTIAL_DATA')) {
         this.decryptionError.set("Decryption Key Missing"); 
         return; 
     }

    try {
        switch (msg.type) {
            case 'STATE_SYNC':
                await this.handleStateSync(msg);
                break;
            case 'NEW_PARTIAL_DATA':
                await this.handleNewPartial(msg);
                break;
            case 'LABELS_UPDATED':
                this.roomState.update(s => s ? { ...s, signerLabels: msg.signerLabels } : null);
                break;
            case 'ROOM_RENAMED':
                this.roomState.update(s => s ? { ...s, roomName: msg.name } : null);
                break;
            case 'LOG_UPDATE':
                this.roomState.update(s => s ? { ...s, auditLog: msg.auditLog } : null);
                break;
            case 'CONNECTIONS_UPDATE':
                this.roomState.update(s => s ? { ...s, connectedCount: msg.count } : null);
                break;
            case 'ROLE_UPDATE':
                if (msg.role === 'admin') this.role.set('admin');
                break;
            case 'ROOM_CLOSED':
                if (msg.finalLog) this.roomState.update(s => s ? { ...s, auditLog: msg.finalLog } : null);
                this.isClosed.set(true);
                this.disconnect(false);
                break;
            case 'TIME_EXTENDED':
                this.roomState.update(s => s ? { ...s, expiresAt: msg.expiresAt } : null);
                break;
            case 'ROOM_UNLOCKED':
                this.roomState.update(s => s ? { ...s, isPaid: true } : null);
                break;
            case 'WHITELIST_UPDATED':
                this.roomState.update(s => s ? { ...s, whitelist: msg.whitelist } : null);
                break;
            case 'LOCK_UPDATED':
                this.roomState.update(s => s ? { ...s, isLocked: msg.isLocked } : null);
                break;
            case 'ERROR_LOCKED':
                this.isLockedOut.set(true);
                this.disconnect(false);
                break;
            case 'ERROR_NOT_FOUND':
                this.roomNotFound.set(true);
                this.disconnect(false);
                break;
        }
    } catch (e) {
        console.error("Message Handler Error", e);
    }
  }

  private async handleStateSync(msg: any) {
    let masterPsbt = "";
    if (msg.encryptedPsbt) {
        masterPsbt = await this.encryption.decrypt(msg.encryptedPsbt, this.encryptionKey!);
    } else {
        masterPsbt = msg.psbt || ""; 
    }
    masterPsbt = this.normalizePsbt(masterPsbt);

    const decryptedHistory: string[] = [];
    if (msg.signatures?.length) {
        for (const sig of msg.signatures) {
            if (sig?.encryptedData) {
                const dec = await this.encryption.decrypt(sig.encryptedData, this.encryptionKey!);
                decryptedHistory.push(this.normalizePsbt(dec)); 
            } else if (typeof sig === 'string') {
                decryptedHistory.push(this.normalizePsbt(sig));
            }
        }
    }
    
    let mergedPsbt = masterPsbt;
    for (const sigData of decryptedHistory) {
        mergedPsbt = this.mergePsbts(mergedPsbt, sigData);
    }
    
    this.roomState.set({
        ...this.getInitialState(msg.roomId),
        ...msg,
        psbt: mergedPsbt,
        signatures: decryptedHistory,
    });
  }

  private async handleNewPartial(msg: any) {
    if (!msg.data?.encryptedData) return;
    const decrypted = await this.encryption.decrypt(msg.data.encryptedData, this.encryptionKey!);
    this.roomState.update(current => {
        if (!current) return null;
        return {
            ...current,
            psbt: this.mergePsbts(current.psbt, decrypted),
            signatures: [...current.signatures, decrypted],
            auditLog: msg.auditLog || current.auditLog
        };
    });
  }

  private decodePsbt(raw: string): Uint8Array {
    const clean = raw.replace(/\s/g, '');
    return /^[0-9a-fA-F]+$/.test(clean) ? hex.decode(clean) : base64.decode(clean);
  }

  private normalizePsbt(input: string): string {
      const clean = input.trim();
      if (/^[0-9a-fA-F]+$/.test(clean) && clean.toLowerCase().startsWith('70736274')) {
          try { return base64.encode(hex.decode(clean)); } catch (e) { return input; }
      }
      return clean;
  }

  private parseTxDetails(psbtBase64: string): TxDetails | null {
    try {
      const tx = Transaction.fromPSBT(base64.decode(psbtBase64));
      const inputsList = [];
      const outputs = [];
      let totalInput = 0;
      let totalOutput = 0;

      for (let i = 0; i < tx.inputsLength; i++) {
        const input = tx.getInput(i);
        let amount = 0;
        let address = "Legacy/Unknown";
        
        if (input.witnessUtxo) {
            amount = Number(input.witnessUtxo.amount);
            totalInput += amount;
            address = this.formatScriptAddress(input.witnessUtxo.script);
        } else if (input.nonWitnessUtxo) {
            address = "Legacy Input";
        }

        let txId = "????";
        let vout = 0;
        try {
            // @ts-ignore
            const rawInput = tx.unsignedTx.inputs[i]; 
            if (rawInput?.txid) {
                txId = hex.encode(rawInput.txid).slice(0, 8) + "...";
                vout = rawInput.index;
            }
        } catch(e) {}

        inputsList.push({ address, amount, txId, vout });
      }

      for (let i = 0; i < tx.outputsLength; i++) {
        const output = tx.getOutput(i);
        const amount = Number(output.amount);
        totalOutput += amount;
        
        const address = this.formatScriptAddress(output.script || new Uint8Array([]));
        let isChange = false;
        
        if (output.bip32Derivation) {
            for (const [, meta] of output.bip32Derivation as any[]) {
                if (meta?.path?.length >= 2 && meta.path[meta.path.length - 2] === 1) {
                    isChange = true;
                    break; 
                }
            }
        }
        outputs.push({ address, amount, isChange });
      }

      const fee = totalInput > 0 ? Math.max(0, totalInput - totalOutput) : 0;
      let vBytes = 0;
      try { vBytes = (tx as any).vsize; } catch (e) { 
          vBytes = 10 + (tx.inputsLength * 100) + (tx.outputsLength * 31); 
      }
      
      const feeRate = vBytes > 0 ? Number((fee / vBytes).toFixed(2)) : 0;

      return { amount: totalOutput, fee, vBytes, feeRate, inputs: tx.inputsLength, inputsList, outputs };
    } catch (e) {
      console.error("Failed to parse PSBT", e);
      return null;
    }
  }

  private extractSigners(psbtBase64: string): SignerStatus[] {
    try {
        const tx = Transaction.fromPSBT(base64.decode(psbtBase64));
        const signersMap = new Map<string, boolean>();

        for (let i = 0; i < tx.inputsLength; i++) {
            const input = tx.getInput(i);
            const derivations = input.bip32Derivation as unknown as DerivationEntry[];
            
            if (derivations) {
                for (const [pubkey, meta] of derivations) {
                    if (!meta?.fingerprint) continue;
                    const fpHex = meta.fingerprint.toString(16).padStart(8, '0');
                    let isSigned = false;

                    // Check Partial Sigs
                    if (input.partialSig) {
                        isSigned = input.partialSig.some(p => this.areKeysEqual(p[0], pubkey));
                    }
                    // Check Taproot Sigs
                    if (!isSigned && input.tapScriptSig) {
                        isSigned = input.tapScriptSig.some(p => this.areKeysEqual(p[0].pubKey, pubkey));
                    }

                    if (isSigned || !signersMap.has(fpHex)) {
                         const current = signersMap.get(fpHex) || false;
                         signersMap.set(fpHex, current || isSigned);
                    }
                }
            }
        }
        return Array.from(signersMap.entries()).map(([fp, signed]) => ({ fingerprint: fp, signed }));
    } catch (e) { return []; }
  }

  private getFingerprintFromPsbt(psbtData: string): string | null {
    try {
        const bytes = this.decodePsbt(psbtData);
        const tx = Transaction.fromPSBT(bytes);
        for(let i=0; i<tx.inputsLength; i++) {
            const input = tx.getInput(i);
            if (input.bip32Derivation) {
                for (const [, meta] of input.bip32Derivation as any[]) {
                    if (meta?.fingerprint) return meta.fingerprint.toString(16).padStart(8, '0');
                }
            }
        }
        return null;
    } catch (e) { return null; }
  }

  private formatScriptAddress(script: Uint8Array): string {
      const s = hex.encode(script);
      if (s.startsWith('0014')) return `bc1q${s.slice(4)}`;
      if (s.startsWith('0020')) return `bc1q${s.slice(4)}`;
      if (s.startsWith('5120')) return `bc1p${s.slice(4)}`;
      return s; 
  }

  private areKeysEqual(k1: Uint8Array, k2: Uint8Array): boolean {
    if (hex.encode(k1) === hex.encode(k2)) return true;
    try {
        const getX = (k: Uint8Array) => k.length === 33 ? k.slice(1) : k.length === 65 ? k.slice(1, 33) : k;
        return hex.encode(getX(k1)) === hex.encode(getX(k2));
    } catch (e) { return false; }
  }

  private async pollPayment(roomId: string, paymentHash: string, endpoint: 'extend' | 'unlock'): Promise<boolean> {
      for (let i = 0; i < 40; i++) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          try {
              const res = await firstValueFrom(this.http.post<{ success: boolean }>(
                  `${environment.apiUrl}/api/room/${roomId}/${endpoint}`, { paymentHash }
              ));
              if (res.success) return true;
          } catch(e) {}
      }
      return false;
  }
}
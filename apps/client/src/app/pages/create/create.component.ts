/*
 * Copyright (C) 2025 Sean Carlin
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Title, Meta } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { Transaction } from '@scure/btc-signer';
import { base64, hex } from '@scure/base';

import { 
  LucideAngularModule, Zap, Check, Loader2, 
  X, UploadCloud, FileJson, AlertTriangle
} from 'lucide-angular';

import { SocketService } from '../../services/socket/socket.service';
import { EncryptionService } from '../../services/encryption/encryption.service';
import { environment } from '../../../environments/environment';

// 1. CONSTANTS MUST BE OUTSIDE THE CLASS
const NETWORKS = ['bitcoin', 'testnet', 'signet'] as const;
type Network = (typeof NETWORKS)[number];

interface PsbtAnalysis {
    valid: boolean;
    signerCount: number;
    amountBtc: number;
    networkFeeSat: number;
    outputCount: number;
    detectedNetwork: 'bitcoin' | 'testnet' | 'unknown';
}

@Component({
  selector: 'app-create',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule, FormsModule],
  template: `
    <div class="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 relative">
      <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div class="max-w-3xl w-full text-center mb-12 relative z-10">
        <h1 class="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
          Create <span class="text-emerald-400">Bitcoin Multisig</span> Room
        </h1>
        <p class="text-slate-400 text-lg">Instant, stateless coordination. 100% Free & Open Source.</p>
      </div>

      <div class="w-full relative z-10 flex justify-center max-w-xl"> 
        <div class="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 flex flex-col hover:border-emerald-500/30 transition-all group w-full shadow-2xl">
            <div class="mb-4">
                <div class="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-6 border border-emerald-500/20">
                    <lucide-icon [img]="Zap" class="w-6 h-6 text-emerald-400"></lucide-icon>
                </div>
                <h3 class="text-2xl font-bold text-white">Stateless Room</h3>
                <div class="text-slate-500 text-sm mt-1">Free stateless coordination for all users</div>
            </div>

            <ul class="space-y-4 mb-8 flex-grow">
                <li class="flex items-center gap-3 text-slate-300"><lucide-icon [img]="Check" class="w-5 h-5 text-emerald-500"></lucide-icon> Up to 20 Signers</li>
                <li class="flex items-center gap-3 text-slate-300"><lucide-icon [img]="Check" class="w-5 h-5 text-emerald-500"></lucide-icon> Ephemeral</li>
                <li class="flex items-center gap-3 text-slate-300"><lucide-icon [img]="Check" class="w-5 h-5 text-emerald-500"></lucide-icon> Audit Logs Included</li>
            </ul>
            
            <button (click)="showCreateModal.set(true)" class="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition shadow-lg shadow-emerald-500/20">
                Launch Room
            </button>
        </div>
      </div>
    </div>

    @if (showCreateModal()) {
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-fade-in">
        <div class="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-lg w-full relative">
            <button (click)="showCreateModal.set(false)" class="absolute top-4 right-4 text-slate-500 hover:text-white"><lucide-icon [img]="X" class="w-5 h-5"></lucide-icon></button>
            <h2 class="text-2xl font-bold text-white mb-6">Configure Room</h2>

            <div class="mb-6">
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Network</label>
                <div class="grid grid-cols-3 gap-2">
                    @for (net of networks; track net) {
                      <button (click)="selectedNetwork.set(net)" 
                              class="py-2 px-3 rounded-lg text-sm font-bold border transition-all capitalize"
                              [class.bg-emerald-500_20]="selectedNetwork() === net"
                              [class.border-emerald-500]="selectedNetwork() === net"
                              [class.text-emerald-400]="selectedNetwork() === net"
                              [class.bg-slate-950]="selectedNetwork() !== net"
                              [class.border-slate-700]="selectedNetwork() !== net"
                              [class.text-slate-400]="selectedNetwork() !== net">
                          {{ net }}
                      </button>
                    }
                </div>
            </div>

            <div class="mb-8">
                <label class="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500">Transaction Data (Required)</label>
                
                @if (psbtAnalysis()) {
                    <div class="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-3">
                        <div class="flex items-start justify-between mb-4">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
                                    <lucide-icon [img]="FileJson" class="w-5 h-5"></lucide-icon>
                                </div>
                                <div>
                                    <div class="text-white text-sm font-bold truncate max-w-[150px]">{{ psbtFile()?.name || 'Raw PSBT' }}</div>
                                    <div class="text-emerald-500 text-xs font-mono">{{ psbtAnalysis()?.outputCount }} Outputs</div>
                                </div>
                            </div>
                            <button (click)="clearPsbt()" class="text-slate-500 hover:text-rose-400"><lucide-icon [img]="X" class="w-4 h-4"></lucide-icon></button>
                        </div>

                        <div class="grid grid-cols-3 gap-2 text-center">
                            <div class="bg-slate-900 rounded p-2 border border-slate-800">
                                <div class="text-[10px] text-slate-500 uppercase">Amount</div>
                                <div class="text-white text-xs font-bold">{{ psbtAnalysis()?.amountBtc | number:'1.4-4' }} <span class="text-slate-600">BTC</span></div>
                            </div>
                            <div class="bg-slate-900 rounded p-2 border border-slate-800">
                                <div class="text-[10px] text-slate-500 uppercase">Network Fee</div>
                                <div class="text-white text-xs font-bold">{{ psbtAnalysis()?.networkFeeSat | number }} <span class="text-slate-600">sats</span></div>
                            </div>
                            <div class="bg-slate-900 rounded p-2 border border-slate-800">
                                <div class="text-[10px] text-slate-500 uppercase">Signers</div>
                                <div class="text-white text-xs font-bold">{{ psbtAnalysis()?.signerCount }}</div>
                            </div>
                        </div>
                    </div>
                } @else {
                    <div class="grid grid-cols-1 gap-3">
                        <label class="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-800 border-dashed rounded-xl cursor-pointer bg-slate-900/50 hover:bg-slate-900 hover:border-emerald-500/50 transition group">
                            <lucide-icon [img]="UploadCloud" class="w-8 h-8 text-slate-600 group-hover:text-emerald-400 mb-2 transition"></lucide-icon>
                            <p class="text-sm text-slate-400">Upload PSBT</p>
                            <input type="file" class="hidden" (change)="onFileSelected($event)" accept=".psbt,.txt,.hex">
                        </label>
                        <input type="text" [(ngModel)]="rawHex" (ngModelChange)="analyzeRawHex($event)" placeholder="Or paste hex..." class="w-full bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg p-3 outline-none focus:border-emerald-500 font-mono"/>
                    </div>
                }
            </div>

            @if (isNetworkMismatch()) {
                <div class="mb-4 p-3 bg-rose-950/30 border border-rose-900/50 rounded-xl flex items-start gap-3">
                    <lucide-icon [img]="AlertTriangle" class="w-5 h-5 text-rose-500 shrink-0 mt-0.5"></lucide-icon>
                    <div>
                        <div class="text-rose-200 text-xs font-bold mb-1">Network Mismatch</div>
                        <p class="text-rose-400 text-[10px]">
                            Selected: <strong>{{ selectedNetwork() | titlecase }}</strong>. 
                            PSBT: <strong>{{ psbtAnalysis()?.detectedNetwork | titlecase }}</strong>.
                        </p>
                    </div>
                </div>
            }

            @if (isHighFee()) {
                <div class="mb-4 p-3 bg-amber-950/30 border border-amber-900/50 rounded-xl flex items-start gap-3">
                    <lucide-icon [img]="AlertTriangle" class="w-5 h-5 text-amber-500 shrink-0 mt-0.5"></lucide-icon>
                    <div>
                        <div class="text-amber-200 text-xs font-bold mb-1">High Fee Detected</div>
                        <p class="text-amber-400 text-[10px]">The network fee is unusually high (>100 sats/vB or >5% of total).</p>
                    </div>
                </div>
            }

            <button (click)="launchRoom()" [disabled]="isLoading() || !psbtAnalysis() || isNetworkMismatch()" class="w-full py-4 bg-emerald-500 text-slate-950 font-bold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50">
                <lucide-icon [img]="isLoading() ? Loader2 : Zap" class="w-5 h-5" [class.animate-spin]="isLoading()"></lucide-icon>
                {{ isLoading() ? 'Creating...' : 'Start Session' }}
            </button>
        </div>
    </div>
    }
  `
})
export class CreateComponent implements OnInit {
    readonly Zap = Zap; readonly Check = Check; readonly Loader2 = Loader2; readonly X = X;
    readonly UploadCloud = UploadCloud; readonly FileJson = FileJson; readonly AlertTriangle = AlertTriangle;

    private socket = inject(SocketService);
    private encryption = inject(EncryptionService);
    private router = inject(Router);
    private titleService = inject(Title);
    private metaService = inject(Meta);

    // 2. EXPOSE CONSTANTS TO TEMPLATE (Fixes your error)
    readonly networks = NETWORKS;
    
    public selectedNetwork = signal<Network>('bitcoin');
    public psbtFile = signal<File | null>(null);
    public psbtAnalysis = signal<PsbtAnalysis | null>(null);
    public rawHex = '';
    public showCreateModal = signal(false);
    public isLoading = signal(false);

    ngOnInit() {
        this.titleService.setTitle('Signing Room | Free Stateless Multisig');
        this.metaService.updateTag({ name: 'description', content: 'Free, open-source multisig coordination.' });
    }

    clearPsbt() { this.psbtFile.set(null); this.rawHex = ''; this.psbtAnalysis.set(null); }

    async launchRoom() {
        this.isLoading.set(true);
        try {
            const encryptionKey = this.generateEncryptionKey(); 
            const adminSecret = crypto.randomUUID();
            
            const encryptedData = await this.encryption.encrypt(this.rawHex, encryptionKey);
            const encryptedAdminToken = await this.encryption.encrypt(adminSecret, encryptionKey);
            
            const res: any = await firstValueFrom(this.socket['http'].post(`${environment.apiUrl}/api/room`, { 
                encryptedPsbt: encryptedData, 
                adminToken: encryptedAdminToken,
                network: this.selectedNetwork() 
            }));

            sessionStorage.setItem(`admin_token_${res.roomId}`, encryptedAdminToken);
            
            this.router.navigate(['/room', res.roomId], { fragment: encryptionKey });
        } catch (e) {
            console.error(e);
        } finally {
            this.isLoading.set(false);
        }
    }

    async onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;
        this.psbtFile.set(file);
        try {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            // Magic bytes check for Binary PSBT (psbt\xff)
            const isBinary = bytes[0] === 0x70 && bytes[1] === 0x73 && bytes[2] === 0x62 && bytes[3] === 0x74 && bytes[4] === 0xff;
            
            const content = isBinary 
                ? Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
                : new TextDecoder().decode(bytes).trim();

            this.rawHex = content;
            this.analyzeRawHex(content);
        } catch (e) { console.error(e); }
    }

    analyzeRawHex(data: string) {
        if (!data || data.length < 10) return;
        try {
            const clean = this.normalizeInput(data);
            const psbtBytes = /^[0-9a-fA-F]+$/.test(clean) ? hex.decode(clean) : base64.decode(clean);
            const tx = Transaction.fromPSBT(psbtBytes);
            
            // Calculate Signers
            const fingerprints = new Set<string>();
            let totalInput = 0, totalOutput = 0, networkScore = 0;

            for(let i=0; i<tx.inputsLength; i++) {
                const input = tx.getInput(i);
                if (input.witnessUtxo) totalInput += Number(input.witnessUtxo.amount);
                if (input.bip32Derivation) {
                    for (const [, meta] of input.bip32Derivation as any[]) {
                        if (meta?.fingerprint) fingerprints.add(meta.fingerprint.toString(16));
                        if (meta?.path) {
                            const coinType = meta.path[1];
                            if (coinType === 2147483648) networkScore--;
                            if (coinType === 2147483649) networkScore++;
                        }
                    }
                }
            }
            for(let i=0; i<tx.outputsLength; i++) totalOutput += Number(tx.getOutput(i).amount);

            const fee = totalInput > 0 ? totalInput - totalOutput : 0;

            this.psbtAnalysis.set({
                valid: true,
                signerCount: fingerprints.size || 1,
                amountBtc: totalOutput / 100000000,
                networkFeeSat: fee,
                outputCount: tx.outputsLength,
                detectedNetwork: networkScore > 0 ? 'testnet' : 'bitcoin'
            });
        } catch (e) { this.psbtAnalysis.set(null); }
    }

    // UX Helpers
    isNetworkMismatch(): boolean {
        const analysis = this.psbtAnalysis();
        if (!analysis) return false;
        return (analysis.detectedNetwork === 'bitcoin' && this.selectedNetwork() !== 'bitcoin') || 
               (analysis.detectedNetwork === 'testnet' && this.selectedNetwork() === 'bitcoin');
    }

    isHighFee(): boolean {
        const analysis = this.psbtAnalysis();
        if (!analysis || analysis.networkFeeSat === 0) return false;
        const estVBytes = (analysis.signerCount * 68) + (analysis.outputCount * 31) + 10; 
        const rate = analysis.networkFeeSat / estVBytes;
        const totalSats = analysis.amountBtc * 100000000;
        return rate > 100 || (totalSats > 0 && (analysis.networkFeeSat / totalSats) > 0.05);
    }

    private normalizeInput(str: string): string { return str.replace(/\s/g, ''); }
    private generateEncryptionKey(): string {
        const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
        return base64.encode(bytes); 
    }
}
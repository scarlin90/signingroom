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
  LucideAngularModule, Zap, Shield, Crown, Infinity, Check, Loader2, 
  Copy, X, Key, Info, UploadCloud, FileJson, AlertTriangle, 
  Users, Coins, HardDrive, RefreshCw, Clipboard
} from 'lucide-angular';

import { SocketService } from '../../services/socket/socket.service';
import { EncryptionService } from '../../services/encryption/encryption.service';
import { environment } from '../../../environments/environment';

interface PsbtAnalysis {
    valid: boolean;
    signerCount: number;
    amountBtc: number;
    networkFeeSat: number;
    outputCount: number;
    error?: string;
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
        <p class="text-slate-400 text-lg">
          Instant, stateless coordination. Merge PSBTs without accounts.
        </p>
        
        @if (savedKey()) {
            <div class="mt-6 flex flex-col items-center gap-2 animate-fade-in">
                 <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-950/30 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
                    <lucide-icon [img]="Check" class="w-3 h-3"></lucide-icon>
                    <span>License Active</span>
                    <span class="text-emerald-600">|</span>
                    <span class="truncate max-w-[150px]" title="{{ savedKey() }}">{{ savedKey() }}</span>
                    
                    <button (click)="copySavedKey()" class="ml-1 hover:text-white transition p-1 rounded hover:bg-emerald-500/20" title="Copy Key">
                        <lucide-icon [img]="keyCopied() ? Check : Copy" class="w-3 h-3"></lucide-icon>
                    </button>

                    <button (click)="rotateKey()" [disabled]="isRotating()" class="ml-1 hover:text-amber-400 transition p-1 rounded hover:bg-amber-500/20 disabled:opacity-50" title="Rotate Key (Security)">
                        <lucide-icon [img]="isRotating() ? Loader2 : RefreshCw" class="w-3 h-3" [class.animate-spin]="isRotating()"></lucide-icon>
                    </button>

                    <button (click)="clearKey()" class="ml-1 hover:text-rose-400 transition p-1 rounded hover:bg-rose-500/20" title="Remove License">
                        <lucide-icon [img]="X" class="w-3 h-3"></lucide-icon>
                    </button>
                </div>
            </div>
        } @else {
            <button (click)="showLicenseInput.set(true)" class="mt-6 text-xs text-slate-500 hover:text-emerald-400 underline decoration-slate-800 underline-offset-4 transition">
                Already have a license key? Enter it here
            </button>
        }
      </div>

      <div class="w-full relative z-10 transition-all duration-500 ease-in-out"
           [class.grid]="!savedKey()" 
           [class.grid-cols-1]="!savedKey()" 
           [class.md:grid-cols-2]="!savedKey()" 
           [class.xl:grid-cols-4]="!savedKey()"
           [class.gap-6]="!savedKey()" 
           [class.max-w-7xl]="!savedKey()"
           
           [class.flex]="savedKey()"
           [class.justify-center]="savedKey()"> 
        
        @if (!savedKey()) {
            <div class="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 flex flex-col hover:border-slate-700 transition-all group">
                <div class="mb-4">
                    <div class="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center mb-4 group-hover:bg-slate-700 transition">
                        <lucide-icon [img]="Zap" class="w-5 h-5 text-slate-400"></lucide-icon>
                    </div>
                    <h3 class="text-xl font-bold text-white">Standard</h3>
                    <div class="text-slate-500 text-sm mt-1">For quick signing</div>
                </div>
                <div class="mb-6">
                    <span class="text-3xl font-bold text-white">Free</span>
                </div>
                <ul class="space-y-3 mb-8 flex-grow">
                    <li class="flex items-center gap-2 text-sm text-slate-300"><lucide-icon [img]="Check" class="w-4 h-4 text-emerald-500"></lucide-icon> Max 3 Signers</li>
                    <li class="flex items-center gap-2 text-sm text-slate-300"><lucide-icon [img]="Check" class="w-4 h-4 text-emerald-500"></lucide-icon> 20 Minute Limit</li>
                </ul>
                <button (click)="openCreateModal('free')" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl border border-slate-700 transition">
                    Create Room
                </button>
            </div>
        }

        <div class="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 flex flex-col hover:border-emerald-500/30 transition-all group relative overflow-hidden"
             [class.max-w-md]="savedKey()" 
             [class.w-full]="savedKey()"
             [class.border-emerald-500_50]="savedKey()"
             [class.shadow-2xl]="savedKey()"
             [class.shadow-emerald-500_10]="savedKey()">
             
            <div class="mb-4">
                <div class="w-10 h-10 bg-emerald-950/30 rounded-lg flex items-center justify-center mb-4 border border-emerald-500/20">
                    <lucide-icon [img]="Shield" class="w-5 h-5 text-emerald-400"></lucide-icon>
                </div>
                
                <div class="flex items-center gap-2 mb-1">
                    <h3 class="text-xl font-bold text-white">{{ savedKey() ? 'Boardroom' : 'Boardroom Pass' }}</h3>
                    
                    @if (savedKey() && isGenesisLicense()) {
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-200 to-yellow-400 text-slate-900 text-[10px] font-bold shadow-[0_0_15px_rgba(251,191,36,0.4)]">
                            <lucide-icon [img]="Infinity" class="w-3 h-3 fill-slate-900"></lucide-icon> Founder
                        </span>
                    }
                </div>

                <div class="text-slate-500 text-sm">{{ savedKey() ? 'Enterprise features unlocked' : 'Single session upgrade' }}</div>
            </div>
            
            <div class="mb-6">
                @if (savedKey()) {
                    <span class="text-3xl font-bold text-emerald-400">Active</span> 
                    <span class="text-sm text-slate-500 font-mono ml-2">License Applied</span>
                } @else {
                    <span class="text-3xl font-bold text-white">21k</span> <span class="text-sm text-slate-500 font-mono ml-2">sats</span>
                }
            </div>

            <ul class="space-y-3 mb-8 flex-grow">
                <li class="flex items-center gap-2 text-sm text-slate-300"><lucide-icon [img]="Check" class="w-4 h-4 text-emerald-500"></lucide-icon> Unlimited Signers</li>
                <li class="flex items-center gap-2 text-sm text-slate-300"><lucide-icon [img]="Check" class="w-4 h-4 text-emerald-500"></lucide-icon> 24 Hour Session</li>
                <li class="flex items-center gap-2 text-sm text-slate-300"><lucide-icon [img]="Check" class="w-4 h-4 text-emerald-500"></lucide-icon> Auditable Governance</li>
            </ul>
            
            <button (click)="openCreateModal('one-off')" class="w-full py-3 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-400 font-bold rounded-xl border border-emerald-500/30 transition shadow-lg shadow-emerald-500/10">
                {{ savedKey() ? 'Launch Boardroom' : 'Create & Upgrade' }}
            </button>
        </div>

        @if (!savedKey()) {
            <div class="bg-slate-900/80 backdrop-blur-sm border border-indigo-500/30 rounded-2xl p-6 flex flex-col hover:border-indigo-500/60 transition-all group shadow-lg shadow-indigo-500/5">
                <div class="absolute top-0 right-0 bg-indigo-500 text-[10px] font-bold px-2 py-1 rounded-bl-lg text-white">POPULAR</div>
                <div class="mb-4">
                    <div class="w-10 h-10 bg-indigo-950/30 rounded-lg flex items-center justify-center mb-4 border border-indigo-500/20">
                        <lucide-icon [img]="Crown" class="w-5 h-5 text-indigo-400"></lucide-icon>
                    </div>
                    <h3 class="text-xl font-bold text-white">Corporate</h3>
                    <div class="text-slate-500 text-sm mt-1">Annual API License</div>
                </div>
                <div class="mb-6">
                    <span class="text-3xl font-bold text-white">300k</span> <span class="text-sm text-slate-500 font-mono ml-2">sats/yr</span>
                </div>
                
                <ul class="space-y-3 mb-8 flex-grow">
                    <li class="flex items-center gap-2 text-sm text-slate-300"><lucide-icon [img]="Check" class="w-4 h-4 text-indigo-400"></lucide-icon> Unlimited Boardrooms</li>
                    <li class="flex items-center gap-2 text-sm text-slate-300"><lucide-icon [img]="Check" class="w-4 h-4 text-indigo-400"></lucide-icon> Instant Activation</li>
                    <li class="flex items-center gap-2 text-sm text-slate-300"><lucide-icon [img]="Check" class="w-4 h-4 text-indigo-400"></lucide-icon> 365-Day Validity</li>
                </ul>

                <button (click)="buyLicense('annual')" class="mt-auto w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition">
                    Buy License
                </button>
            </div>

            <div class="bg-gradient-to-b from-amber-950/40 to-slate-900 backdrop-blur-sm border border-amber-500/40 rounded-2xl p-6 flex flex-col hover:border-amber-400 transition-all group relative overflow-hidden shadow-xl shadow-amber-500/10">
                
                <div class="absolute top-0 right-0 left-0 bg-amber-500/10 border-b border-amber-500/30 p-2 text-center">
                    <div class="text-amber-400 text-xs font-bold tracking-widest uppercase">Limited Supply</div>
                    <div class="text-2xl font-black text-amber-500 tabular-nums animate-pulse">
                        {{ genesisStock() }} <span class="text-sm font-normal text-amber-200/70">/ 21 LEFT</span>
                    </div>
                </div>

                <div class="mb-4 mt-12"> 
                    <h3 class="text-xl font-bold text-white">Genesis</h3>
                    <div class="text-amber-200/60 text-sm mt-1">Lifetime Founder's Key</div>
                </div>
                
                <div class="mb-6">
                    <span class="text-3xl font-bold text-white">2.1M</span> <span class="text-sm text-slate-500 font-mono ml-2">sats</span>
                </div>

                <ul class="space-y-3 mb-8 flex-grow">
                    <li class="flex items-center gap-2 text-sm text-slate-300"><lucide-icon [img]="Check" class="w-4 h-4 text-amber-400"></lucide-icon> <strong>Lifetime</strong> Access</li>
                    <li class="flex items-center gap-2 text-sm text-slate-300"><lucide-icon [img]="Infinity" class="w-4 h-4 text-amber-400"></lucide-icon> In-Room Founder Badge</li>
                    <li class="flex items-center gap-2 text-sm text-slate-300"><lucide-icon [img]="Check" class="w-4 h-4 text-amber-400"></lucide-icon> Uncapped Usage</li>
                </ul>

                <button (click)="buyLicense('genesis')" [disabled]="genesisStock() === 0" class="mt-auto w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2">
                    {{ genesisStock() === 0 ? 'Sold Out' : 'Become a Founder' }}
                </button>
            </div>
        }
      </div>
    </div>

    @if (showCreateModal()) {
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-fade-in">
        <div class="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-lg w-full relative">
            <button (click)="showCreateModal.set(false)" class="absolute top-4 right-4 text-slate-500 hover:text-white"><lucide-icon [img]="X" class="w-5 h-5"></lucide-icon></button>
            
            <h2 class="text-2xl font-bold text-white mb-1">Configure Room</h2>
            <p class="text-slate-400 text-sm mb-6">Setup your signing session details.</p>

            @if (selectedTier() !== 'free') {
                <div class="mb-6">
                    @if (isEnterpriseKey()) {
                        <div class="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl flex justify-between items-center animate-fade-in">
                            <div>
                                <div class="text-xs text-emerald-400 flex items-center gap-2 font-bold mb-1">
                                    <lucide-icon [img]="Check" class="w-3 h-3"></lucide-icon> 
                                    Boardroom Unlocked
                                    
                                    @if (isGenesisLicense()) {
                                         <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-200 to-yellow-400 text-slate-900 text-[10px] font-bold shadow-[0_0_15px_rgba(251,191,36,0.4)]">
                                            <lucide-icon [img]="Infinity" class="w-3 h-3 fill-slate-900"></lucide-icon> Founder
                                        </span>
                                    }
                                </div>
                                <div class="text-[10px] text-slate-500 font-mono">
                                    Key: {{ modalLicenseKey.slice(0, 16) }}...
                                </div>
                            </div>
                            
                            <button (click)="clearModalKey()" class="text-xs text-slate-500 hover:text-white underline decoration-slate-700 underline-offset-2 transition cursor-pointer">
                                Change
                            </button>
                        </div>
                    } @else {
                        <div class="flex items-center justify-between mb-2">
                            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider">License Key (Optional)</label>
                        </div>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <lucide-icon [img]="Key" class="w-4 h-4 text-slate-500"></lucide-icon>
                            </div>
                            <input type="text" [(ngModel)]="modalLicenseKey" 
                                placeholder="Enter sk_live_... to unlock Boardroom" 
                                class="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-xl block pl-10 p-3 outline-none focus:border-emerald-500 transition font-mono placeholder:text-slate-600"/>
                        </div>
                    }
                </div>
            }

            <div class="mb-6">
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Network</label>
                <div class="grid grid-cols-3 gap-2">
                    <button (click)="selectedNetwork.set('bitcoin')" 
                            class="py-2 px-3 rounded-lg text-sm font-bold border transition-all"
                            [class.bg-emerald-500_20]="selectedNetwork() === 'bitcoin'"
                            [class.border-emerald-500]="selectedNetwork() === 'bitcoin'"
                            [class.text-emerald-400]="selectedNetwork() === 'bitcoin'"
                            [class.bg-slate-950]="selectedNetwork() !== 'bitcoin'"
                            [class.border-slate-700]="selectedNetwork() !== 'bitcoin'"
                            [class.text-slate-400]="selectedNetwork() !== 'bitcoin'">
                        Mainnet
                    </button>
                    <button (click)="selectedNetwork.set('testnet')" 
                            class="py-2 px-3 rounded-lg text-sm font-bold border transition-all"
                            [class.bg-amber-500_20]="selectedNetwork() === 'testnet'"
                            [class.border-amber-500]="selectedNetwork() === 'testnet'"
                            [class.text-amber-400]="selectedNetwork() === 'testnet'"
                            [class.bg-slate-950]="selectedNetwork() !== 'testnet'"
                            [class.border-slate-700]="selectedNetwork() !== 'testnet'"
                            [class.text-slate-400]="selectedNetwork() !== 'testnet'">
                        Testnet
                    </button>
                    <button (click)="selectedNetwork.set('signet')" 
                            class="py-2 px-3 rounded-lg text-sm font-bold border transition-all"
                            [class.bg-purple-500_20]="selectedNetwork() === 'signet'"
                            [class.border-purple-500]="selectedNetwork() === 'signet'"
                            [class.text-purple-400]="selectedNetwork() === 'signet'"
                            [class.bg-slate-950]="selectedNetwork() !== 'signet'"
                            [class.border-slate-700]="selectedNetwork() !== 'signet'"
                            [class.text-slate-400]="selectedNetwork() !== 'signet'">
                        Signet
                    </button>
                </div>
            </div>

            <div class="mb-8">
                <label class="block text-xs font-bold uppercase tracking-wider mb-2" 
                       [class.text-slate-500]="psbtAnalysis()" 
                       [class.text-rose-400]="!psbtAnalysis()">
                    Transaction Data (Required)
                </label>
                
                @if (psbtAnalysis()) {
                    <div class="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-3">
                        <div class="flex items-start justify-between mb-4">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
                                    <lucide-icon [img]="FileJson" class="w-5 h-5"></lucide-icon>
                                </div>
                                <div>
                                    <div class="text-white text-sm font-bold truncate max-w-[150px]">{{ psbtFile()?.name || 'Raw PSBT Data' }}</div>
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
                            <div class="bg-slate-900 rounded p-2 border border-slate-800"
                                 [class.border-rose-900]="isSignerLimitExceeded()">
                                <div class="text-[10px] text-slate-500 uppercase">Signers</div>
                                <div class="text-white text-xs font-bold" [class.text-rose-400]="isSignerLimitExceeded()">
                                    {{ psbtAnalysis()?.signerCount }} 
                                    @if (isSignerLimitExceeded()) { <span class="text-[8px] block text-rose-500">MAX 3 FREE</span> }
                                </div>
                            </div>
                        </div>
                    </div>

                    @if (isSignerLimitExceeded()) {
                        <div class="flex items-center gap-3 p-3 bg-rose-950/30 border border-rose-900/50 rounded-xl text-rose-200 text-xs animate-pulse">
                            <lucide-icon [img]="AlertTriangle" class="w-5 h-5 shrink-0"></lucide-icon>
                            <span>
                                <strong>Limit Exceeded:</strong> Free rooms allow max 3 signers. 
                                <br>Upgrade to Boardroom to continue.
                            </span>
                        </div>
                    }

                } @else {
                    <div class="grid grid-cols-1 gap-3">
                        <label class="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-800 border-dashed rounded-xl cursor-pointer bg-slate-900/50 hover:bg-slate-900 hover:border-emerald-500/50 transition group">
                            <div class="flex flex-col items-center justify-center pt-5 pb-6">
                                <lucide-icon [img]="UploadCloud" class="w-8 h-8 text-slate-600 group-hover:text-emerald-400 mb-2 transition"></lucide-icon>
                                <p class="text-sm text-slate-400"><span class="font-bold text-white">Click to upload PSBT</span></p>
                                <p class="text-xs text-slate-500">Supports .psbt, .txt, .hex</p>
                            </div>
                            <input type="file" class="hidden" (change)="onFileSelected($event)" accept=".psbt,.txt,.hex">
                        </label>
                        
                        <div class="relative">
                            <input type="text" [(ngModel)]="rawHex" (ngModelChange)="analyzeRawHex($event)" placeholder="Or paste raw Hex / Base64 here..." class="w-full bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg p-3 outline-none focus:border-emerald-500 font-mono"/>
                        </div>
                    </div>
                }
            </div>

            @if (isNetworkMismatch()) {
                <div class="mb-4 p-3 bg-rose-950/30 border border-rose-900/50 rounded-xl flex items-start gap-3">
                    <lucide-icon [img]="AlertTriangle" class="w-5 h-5 text-rose-500 shrink-0 mt-0.5"></lucide-icon>
                    <div>
                        <div class="text-rose-200 text-xs font-bold mb-1">Network Mismatch Detected</div>
                        <p class="text-rose-400 text-[10px] leading-relaxed">
                            You selected <strong>{{ selectedNetwork() === 'bitcoin' ? 'Mainnet' : (selectedNetwork() | titlecase) }}</strong>, but your PSBT appears to be for 
                            <strong>{{ psbtAnalysis()?.detectedNetwork === 'bitcoin' ? 'Mainnet' : 'Testnet' }}</strong>.
                            Please switch the network toggle above.
                        </p>
                    </div>
                </div>
            }

            @if (isHighFee()) {
                <div class="mb-4 p-3 bg-amber-950/30 border border-amber-900/50 rounded-xl flex items-start gap-3">
                    <lucide-icon [img]="AlertTriangle" class="w-5 h-5 text-amber-500 shrink-0 mt-0.5"></lucide-icon>
                    <div>
                        <div class="text-amber-200 text-xs font-bold mb-1">High Fee Detected</div>
                        <p class="text-amber-400 text-[10px] leading-relaxed">
                            The network fee is unusually high (>100 sats/vB or >5% of total). 
                            <br>Please verify this is intentional before creating the room.
                        </p>
                    </div>
                </div>
            }

            <button (click)="launchRoom()" 
                    [disabled]="isLoading() || isSignerLimitExceeded() || !psbtAnalysis() || isNetworkMismatch()"
                    class="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
                
                @if (isLoading()) {
                    <lucide-icon [img]="Loader2" class="w-5 h-5 animate-spin"></lucide-icon> Preparing...
                } @else if (!psbtAnalysis()) {
                    <lucide-icon [img]="UploadCloud" class="w-5 h-5"></lucide-icon> Upload PSBT to Continue
                } @else if (isSignerLimitExceeded()) {
                    <lucide-icon [img]="Crown" class="w-5 h-5"></lucide-icon> Upgrade Required
                } @else {
                    <lucide-icon [img]="Zap" class="w-5 h-5"></lucide-icon> Launch Signing Room
                }
            </button>
        </div>
    </div>
    }

    @if (showLicenseInput()) {
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-fade-in">
        <div class="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full relative">
            <button (click)="showLicenseInput.set(false)" class="absolute top-4 right-4 text-slate-500 hover:text-white"><lucide-icon [img]="X" class="w-5 h-5"></lucide-icon></button>
            
            <div class="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <lucide-icon [img]="Key" class="w-6 h-6 text-emerald-400"></lucide-icon>
            </div>

            <h3 class="text-xl font-bold text-white mb-2 text-center">Enter License Key</h3>
            <p class="text-slate-400 text-sm mb-6 text-center">Paste your key to unlock Enterprise features.</p>

            <div class="relative group mb-6">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <lucide-icon [img]="Key" class="w-4 h-4 text-slate-500"></lucide-icon>
                </div>
                <input type="text" [(ngModel)]="manualLicenseEntry" 
                       placeholder="sk_annual_..." 
                       autofocus
                       (keyup.enter)="saveManualLicense()"
                       class="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-xl block pl-10 pr-10 p-3 outline-none focus:border-emerald-500 transition font-mono placeholder:text-slate-600 shadow-inner"/>
                
                <button (click)="pasteLicense()" class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white cursor-pointer transition" title="Paste">
                    <lucide-icon [img]="Clipboard" class="w-4 h-4"></lucide-icon>
                </button>
            </div>

            <button (click)="saveManualLicense()" class="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition shadow-lg shadow-emerald-500/20">
                Activate License
            </button>
        </div>
    </div>
    }

    @if (showPaymentModal()) {
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-fade-in">
        <div class="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center relative">
            <button (click)="showPaymentModal.set(false)" class="absolute top-4 right-4 text-slate-500 hover:text-white"><lucide-icon [img]="X" class="w-5 h-5"></lucide-icon></button>
            <div class="flex items-center justify-center gap-2 mt-4">
                <span class="text-[10px] text-slate-500">Invoice expires in ~10m</span>
                <button (click)="buyLicense(selectedPlan()!)" class="text-[10px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer">
                    Generate New
                </button>
            </div>
            <h3 class="text-xl font-bold text-white mb-1">
                {{ selectedPlan() === 'genesis' ? 'Genesis License' : 'Annual License' }}
            </h3>
            <p class="text-slate-400 text-xs mb-6">
                Pay {{ selectedPlan() === 'genesis' ? '2,100,000' : '300,000' }} sats via Lightning.
            </p>

            @if (invoiceLoading()) {
                <div class="py-12 flex justify-center"><lucide-icon [img]="Loader2" class="w-8 h-8 text-emerald-500 animate-spin"></lucide-icon></div>
            } @else if (purchasedKey()) {
                <div class="bg-emerald-950/30 border border-emerald-500/30 p-6 rounded-xl mb-6">
                    <div class="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-950">
                        <lucide-icon [img]="Check" class="w-6 h-6"></lucide-icon>
                    </div>
                    <h4 class="text-white font-bold mb-2">Payment Successful!</h4>
                    <p class="text-slate-400 text-sm mb-4">Here is your API License Key. Save it securely!</p>
                    
                    <div class="bg-slate-950 border border-slate-800 rounded p-3 flex items-center justify-between gap-2">
                        <code class="text-emerald-400 font-mono text-sm truncate">{{ purchasedKey() }}</code>
                        <button (click)="copyKey()" class="text-slate-400 hover:text-white"><lucide-icon [img]="Copy" class="w-4 h-4"></lucide-icon></button>
                    </div>
                </div>
                <button (click)="closeAndSave()" class="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition">
                    Save & Continue
                </button>
            } @else if (paymentRequest()) {
                <div class="bg-white p-2 rounded-lg mb-4 mx-auto w-fit"><img [src]="'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + paymentRequest()" class="w-48 h-48"></div>
                <div class="bg-slate-950 border border-slate-800 rounded p-2 mb-4 flex items-center justify-between gap-2">
                    <div class="font-mono text-[10px] text-slate-500 truncate w-full text-left select-all">{{ paymentRequest() }}</div>
                    <button (click)="copyInvoice()" class="text-emerald-400 hover:text-emerald-300"><lucide-icon [img]="Copy" class="w-4 h-4"></lucide-icon></button>
                </div>
                <div class="flex items-center justify-center gap-2 text-xs text-emerald-400 animate-pulse">
                    <lucide-icon [img]="Loader2" class="w-3 h-3 animate-spin"></lucide-icon>
                    Waiting for payment...
                </div>
            }
        </div>
    </div>
    }

    @if (showConfirmModal()) {
    <div class="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-fade-in">
        <div class="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 relative overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-1" 
                 [class.bg-rose-500]="confirmData().isDestructive" 
                 [class.bg-emerald-500]="!confirmData().isDestructive"></div>

            <h3 class="text-white font-bold text-lg mb-2">{{ confirmData().title }}</h3>
            
            <p class="text-slate-400 text-sm mb-6 leading-relaxed whitespace-pre-wrap break-words">
                {{ confirmData().message }}
            </p>

            <div class="grid gap-3" [class.grid-cols-2]="confirmData().type === 'confirm'" [class.grid-cols-1]="confirmData().type === 'alert'">
                
                @if (confirmData().type === 'confirm') {
                    <button (click)="closeConfirmModal()" class="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition font-bold text-sm">
                        Cancel
                    </button>
                }

                <button (click)="executeConfirmAction()" 
                        class="px-4 py-2.5 rounded-xl font-bold text-sm text-white transition shadow-lg"
                        [class.bg-rose-600]="confirmData().isDestructive"
                        [class.hover:bg-rose-500]="confirmData().isDestructive"
                        [class.bg-emerald-600]="!confirmData().isDestructive"
                        [class.hover:bg-emerald-500]="!confirmData().isDestructive">
                    {{ confirmData().type === 'confirm' ? 'Confirm' : 'OK' }}
                </button>
            </div>
        </div>
    </div>
    }
  `
})
export class CreateComponent implements OnInit {

    // -------------------------------------------------------------------------
    // Icons
    // -------------------------------------------------------------------------
    readonly Zap = Zap;
    readonly Shield = Shield;
    readonly Crown = Crown;
    readonly Infinity = Infinity;
    readonly Check = Check;
    readonly Loader2 = Loader2;
    readonly Copy = Copy;
    readonly X = X;
    readonly Key = Key;
    readonly Info = Info;
    readonly UploadCloud = UploadCloud;
    readonly FileJson = FileJson;
    readonly AlertTriangle = AlertTriangle;
    readonly Users = Users;
    readonly Coins = Coins;
    readonly HardDrive = HardDrive;
    readonly RefreshCw = RefreshCw;
    readonly Clipboard = Clipboard;

    // -------------------------------------------------------------------------
    // Dependencies
    // -------------------------------------------------------------------------
    private socket = inject(SocketService);
    private encryption = inject(EncryptionService);
    private router = inject(Router);
    private titleService = inject(Title);
    private metaService = inject(Meta);

    // -------------------------------------------------------------------------
    // UI State Signals
    // -------------------------------------------------------------------------
    public selectedTier = signal<'free' | 'one-off'>('free');
    public selectedNetwork = signal<'bitcoin' | 'testnet' | 'signet'>('bitcoin');
    
    public showLicenseInput = signal(false);
    public savedKey = signal<string | null>(null);
    public modalLicenseKey = '';
    public manualLicenseEntry = '';
    public keyCopied = signal(false);
    
    public psbtFile = signal<File | null>(null);
    public psbtAnalysis = signal<PsbtAnalysis | null>(null);
    public rawHex = '';
    
    public showCreateModal = signal(false);
    public isLoading = signal(false);
    
    public genesisStock = signal(21);
    public showPaymentModal = signal(false);
    public selectedPlan = signal<'annual' | 'genesis' | null>(null);
    public invoiceLoading = signal(false);
    public paymentRequest = signal<string | null>(null);
    public purchasedKey = signal<string | null>(null);
    public isRotating = signal(false);

    // -------------------------------------------------------------------------
    // Unified Modal State
    // -------------------------------------------------------------------------
    public showConfirmModal = signal(false);
    public confirmData = signal({
        title: '',
        message: '',
        action: () => {},
        isDestructive: false,
        type: 'confirm' as 'confirm' | 'alert'
    });

    readonly icons = { Zap, Shield, Crown, Infinity, Check, Loader2, Copy, X, Key, Info, UploadCloud, FileJson, AlertTriangle, Users, Coins, HardDrive, RefreshCw };

    constructor() {
        if (typeof localStorage !== 'undefined') {
            const key = localStorage.getItem('signing_room_license');
            if (key) {
                this.savedKey.set(key);      
                this.modalLicenseKey = key;  
            }
        }
    }

    ngOnInit() {
        this.titleService.setTitle('Create Signing Room | Bitcoin Multisig Coordinator');
        this.metaService.updateTag({ 
            name: 'description', 
            content: 'Launch a secure, stateless Bitcoin multisig signing room.' 
        });
        this.fetchStock();
    }

    // -------------------------------------------------------------------------
    // Public Actions
    // -------------------------------------------------------------------------

    openCreateModal(tier: 'free' | 'one-off') {
        this.selectedTier.set(tier);
        this.showCreateModal.set(true);
    }

    clearPsbt() {
        this.psbtFile.set(null);
        this.rawHex = '';
        this.psbtAnalysis.set(null);
    }

    async launchRoom() {
        this.isLoading.set(true);
        if (!this.rawHex) {
            this.openAlert("Missing Data", "Transaction data is required.");
            this.isLoading.set(false);
            return;
        }

        try {
            const encryptionKey = this.generateEncryptionKey(); 
            const cleanData = this.normalizeInput(this.rawHex);
            const encryptedData = await this.encryption.encrypt(cleanData, encryptionKey);

            const isFree = this.selectedTier() === 'free';
            const licenseKey = isFree ? undefined : (this.isEnterpriseKey() ? this.modalLicenseKey : undefined);
            const tier = licenseKey ? 'enterprise' : isFree ? 'free' : 'enterprise';

            // Direct HTTP call as room doesn't exist yet
            const res: any = await firstValueFrom(this.socket['http'].post(
               `${environment.apiUrl}/api/room`, 
               { tier, licenseKey, encryptedPsbt: encryptedData, network: this.selectedNetwork() } 
            ));

            if (res.adminToken) {
                sessionStorage.setItem(`admin_token_${res.roomId}`, res.adminToken);
            }

            if (licenseKey) {
                localStorage.setItem('signing_room_license', licenseKey);
                this.savedKey.set(licenseKey);
            }
            
            this.router.navigate(['/room', res.roomId], { fragment: encryptionKey });
            
        } catch (e) {
            console.error("Create failed", e);
            this.openAlert("Creation Failed", "Failed to create room. Please try again.");
        } finally {
            this.isLoading.set(false);
        }
    }

    // -------------------------------------------------------------------------
    // Licensing Logic
    // -------------------------------------------------------------------------

    async buyLicense(type: 'annual' | 'genesis') {
        this.selectedPlan.set(type);
        this.showPaymentModal.set(true);
        this.invoiceLoading.set(true);
        this.purchasedKey.set(null);
        this.paymentRequest.set(null);

        try {
            // 1. Generate Invoice
            const res = await firstValueFrom(this.socket.buyLicense(type));
            this.paymentRequest.set(res.payment_request);
            this.invoiceLoading.set(false);

            const currentInvoice = res.payment_request; // Capture specific invoice ID

            // 2. Poll Manually (Stops if modal closes OR new invoice generated)
            while (this.showPaymentModal() && this.paymentRequest() === currentInvoice && !this.purchasedKey()) {
                
                // Wait 2 seconds
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Double check state after wait
                if (!this.showPaymentModal() || this.paymentRequest() !== currentInvoice) break;

                try {
                    // Check status using the existing private HTTP client
                    const check: any = await firstValueFrom(
                        this.socket['http'].get(`${environment.apiUrl}/api/license/claim/${res.payment_hash}`)
                    );

                    if (check.ready && check.apiKey) {
                        this.purchasedKey.set(check.apiKey);
                        this.downloadLicenseFile(check.apiKey);
                        this.triggerConfetti();
                        break; 
                    }
                } catch (e) {
                    // Ignore 429s or network blips during poll
                }
            }

        } catch (e) {
            console.error(e);
            this.openAlert("Error", "Failed to generate invoice.");
            this.showPaymentModal.set(false);
        }
    }

    async rotateKey() {
        this.openConfirm(
            "⚠️ SECURITY WARNING ⚠️",
            "Are you sure you want to rotate your API Key?\n\n1. Your old key will stop working IMMEDIATELY.\n2. A new key will be generated with the same expiration date.\n3. You must update any scripts using the old key.",
            async () => {
                this.isRotating.set(true);
                const oldKey = this.modalLicenseKey;

                try {
                    const res = await firstValueFrom(this.socket.rotateLicense(oldKey));
                    this.modalLicenseKey = res.newKey;
                    this.savedKey.set(res.newKey);
                    localStorage.setItem('signing_room_license', res.newKey);
                    
                    this.openAlert("Success", "Success! Your API Key has been rotated. The new key is saved.");
                } catch (e) {
                    console.error(e);
                    this.openAlert("Error", "Failed to rotate key. It may be expired or invalid.");
                } finally {
                    this.isRotating.set(false);
                }
            },
            true // Destructive action
        );
    }

    // -------------------------------------------------------------------------
    // File & Data Handlers
    // -------------------------------------------------------------------------

    async onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;

        // --- VALIDATION START ---
        // 1. Extension Check
        const validExtensions = ['.psbt', '.txt', '.hex', '.base64'];
        const fileName = file.name.toLowerCase();
        if (!validExtensions.some(ext => fileName.endsWith(ext))) {
            this.openAlert("Invalid File Type", "Please upload a .psbt, .txt, or .hex file.");
            event.target.value = ''; // Reset input
            return;
        }

        // 2. Size Check (Max 2MB for browser performance)
        if (file.size > 2 * 1024 * 1024) {
            this.openAlert("File Too Large", "File exceeds 2MB limit. PSBTs are usually much smaller.");
            event.target.value = '';
            return;
        }
        // --- VALIDATION END ---

        this.psbtFile.set(file);

        try {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            
            // Magic bytes check for Binary PSBT (psbt\xff)
            const isBinary = bytes[0] === 0x70 && bytes[1] === 0x73 && bytes[2] === 0x62 && bytes[3] === 0x74 && bytes[4] === 0xff;
            
            // Hex string or Raw String
            const content = isBinary 
                ? Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
                : new TextDecoder().decode(bytes).trim();
            
            if (content.startsWith('010000') || content.startsWith('020000')) {
                 this.openAlert("Invalid File", "This looks like a Raw Transaction. Please export as PSBT.");
                 return;
            }

            this.rawHex = content;
            this.analyzeRawHex(content);
        } catch (e) {
            console.error("File read error", e);
            this.openAlert("Read Error", "Failed to read file.");
        }
    }

    analyzeRawHex(data: string) {
        if (!data || data.length < 10) {
            this.psbtAnalysis.set(null);
            return;
        }

        try {
            const clean = this.normalizeInput(data);
            const psbtBytes = this.isHex(clean) ? hex.decode(clean) : base64.decode(clean);
            const tx = Transaction.fromPSBT(psbtBytes);
            
            // Calculate Signers based on Fingerprints
            const fingerprints = new Set<string>();
            let totalInput = 0;
            let totalOutput = 0;
            let networkScore = 0;

            for(let i=0; i<tx.inputsLength; i++) {
                const input = tx.getInput(i);
                if (input.witnessUtxo) totalInput += Number(input.witnessUtxo.amount);
                
                if (input.bip32Derivation) {
                    for (const [, meta] of input.bip32Derivation as any[]) {
                        if (meta?.fingerprint) fingerprints.add(meta.fingerprint.toString(16));
                        
                        // Network Detection (CoinType: 0=Main, 1=Test)
                        if (meta?.path) {
                            const coinType = meta.path[1];
                            if (coinType === 2147483648) networkScore--; // 0'
                            if (coinType === 2147483649) networkScore++; // 1'
                        }
                    }
                }
            }

            for(let i=0; i<tx.outputsLength; i++) {
                const amt = Number(tx.getOutput(i).amount);
                totalOutput += amt;
                
                // CHECK FOR DUST (Standard relay limit is usually 546 sats for P2PKH/P2WPKH)
                if (amt < 546) {
                    this.openAlert("Dust Error", `Output #${i} is too small (${amt} sats). It will be rejected by the network.`);
                    this.psbtAnalysis.set(null); // Invalidate
                    return;
                }
            }

            const fee = totalInput > 0 ? totalInput - totalOutput : 0;
            const detected = networkScore > 0 ? 'testnet' : networkScore < 0 ? 'bitcoin' : 'unknown';

            this.psbtAnalysis.set({
                valid: true,
                signerCount: fingerprints.size || 1,
                amountBtc: totalOutput / 100000000,
                networkFeeSat: fee,
                outputCount: tx.outputsLength,
                detectedNetwork: detected
            });

        } catch (e) {
            console.error("Analysis Failed", e);
            this.psbtAnalysis.set(null);
        }
    }

    // -------------------------------------------------------------------------
    // Unified Modal Logic
    // -------------------------------------------------------------------------

    openConfirm(title: string, message: string, action: () => void, isDestructive = false) {
        this.confirmData.set({ title, message, action, isDestructive, type: 'confirm' });
        this.showConfirmModal.set(true);
    }

    openAlert(title: string, message: string) {
        this.confirmData.set({ title, message, action: () => {}, isDestructive: false, type: 'alert' });
        this.showConfirmModal.set(true);
    }

    executeConfirmAction() {
        this.confirmData().action();
        this.closeConfirmModal();
    }

    closeConfirmModal() {
        this.showConfirmModal.set(false);
        this.confirmData.set({ title: '', message: '', action: () => {}, isDestructive: false, type: 'confirm' });
    }

    // -------------------------------------------------------------------------
    // Helpers / Getters
    // -------------------------------------------------------------------------

    isSignerLimitExceeded() {
        const analysis = this.psbtAnalysis();
        const hasLicense = this.isEnterpriseKey();
        const isOneOff = this.selectedTier() === 'one-off'; 
        return analysis ? (!hasLicense && !isOneOff && analysis.signerCount > 3) : false;
    }

    isEnterpriseKey() {
        return this.modalLicenseKey.length > 5;
    }

    isGenesisLicense() {
        return this.savedKey()?.toLowerCase().includes('genesis') || false;
    }

    isNetworkMismatch(): boolean {
        const analysis = this.psbtAnalysis();
        const selected = this.selectedNetwork();
        if (!analysis || analysis.detectedNetwork === 'unknown') return false;
        const isTestGroup = selected === 'testnet' || selected === 'signet';
        if (analysis.detectedNetwork === 'bitcoin' && isTestGroup) return true;
        if (analysis.detectedNetwork === 'testnet' && selected === 'bitcoin') return true;
        return false;
    }

    isHighFee(): boolean {
        const analysis = this.psbtAnalysis();
        if (!analysis) return false;

        if (analysis.networkFeeSat === 0) return false;
        
        const estVBytes = (analysis.signerCount * 68) + (analysis.outputCount * 31) + 10; 
        const rate = analysis.networkFeeSat / estVBytes;
        if (rate > 100) return true;

        const totalSats = analysis.amountBtc * 100000000;
        if (totalSats > 0 && (analysis.networkFeeSat / totalSats) > 0.05) return true;

        return false;
    }

    private normalizeInput(str: string): string {
        return str.replace(/\s/g, '');
    }

    private isHex(str: string): boolean {
        return /^[0-9a-fA-F]+$/.test(str) && str.toLowerCase().startsWith('70736274');
    }

    private generateEncryptionKey(): string {
        const bytes = new Uint8Array(32); 
        crypto.getRandomValues(bytes);
        return base64.encode(bytes); 
    }

    private async fetchStock() {
        try {
            const res = await firstValueFrom(this.socket.getGenesisStock());
            this.genesisStock.set(res.remaining);
        } catch (e) {}
    }

    downloadLicenseFile(key: string) {
        const blob = new Blob([`Key: ${key}`], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'license.txt';
        a.click();
        window.URL.revokeObjectURL(url);
    }

    private triggerConfetti() {
        import('canvas-confetti').then(c => c.default());
    }
    
    saveManualLicense() {
        if (!this.manualLicenseEntry || this.manualLicenseEntry.length < 10) return;
        const key = this.manualLicenseEntry.trim();
        localStorage.setItem('signing_room_license', key);
        this.savedKey.set(key);
        this.modalLicenseKey = key;
        this.showLicenseInput.set(false);
        this.manualLicenseEntry = '';
    }

    copySavedKey() {
        if (this.savedKey()) navigator.clipboard.writeText(this.savedKey()!);
    }

    clearKey() {
        localStorage.removeItem('signing_room_license');
        this.savedKey.set(null);
    }

    async pasteLicense() {
    try {
        const text = await navigator.clipboard.readText();
        if (text) this.manualLicenseEntry = text.trim();
    } catch (e) {
        // Fallback or permission error - ignore
    }
}
    
    copyInvoice() { navigator.clipboard.writeText(this.paymentRequest() || ''); }
    copyKey() { navigator.clipboard.writeText(this.purchasedKey() || ''); }
    clearModalKey() { this.modalLicenseKey = ''; }
    
    closeAndSave() {
        if (this.purchasedKey()) {
            localStorage.setItem('signing_room_license', this.purchasedKey()!);
            this.savedKey.set(this.purchasedKey()); 
            this.modalLicenseKey = this.purchasedKey()!; 
            this.showPaymentModal.set(false);
            this.fetchStock();
            setTimeout(() => this.openCreateModal('one-off'), 100); 
        }
    }
}
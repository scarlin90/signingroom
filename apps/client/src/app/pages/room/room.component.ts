/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Component, OnInit, signal, computed, OnDestroy, effect, Inject, PLATFORM_ID, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { 
    LucideAngularModule, Shield, Users, CheckCircle, Loader2, 
    Copy, Clock, ArrowRight, Hash, Crown, UploadCloud, DownloadCloud,
    Download, ExternalLink, Check, Zap, AlertTriangle, Power, X, Lock, Unlock, Key, RefreshCw, AlertOctagon, FileKey, FileCheck,
    Edit2, Tag, Bell, Infinity, ArrowDown, Book, QrCode, Eye, EyeOff, Search
} from 'lucide-angular';
import { SocketService } from '../../services/socket/socket.service';
import { jsPDF } from 'jspdf';
import * as QRCode from 'qrcode';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FormsModule, RouterModule],
  template: `

  @if (socket.status() !== 'connected' && !socket.isClosed() && !isExpired()) {
        <div class="w-full bg-amber-500/90 text-slate-950 text-center text-xs font-bold py-1.5 fixed top-0 z-[200] flex items-center justify-center gap-2 animate-pulse">
            <lucide-icon [img]="Loader2" class="w-3 h-3 animate-spin"></lucide-icon>
            Connection lost... Reconnecting...
        </div>
    }

    @if (showPsbtModal()) {
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden relative">
            <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <lucide-icon [img]="DownloadCloud" class="w-5 h-5 text-emerald-400"></lucide-icon>
                    <h3 class="font-bold text-white">Download Unsigned PSBT</h3>
                </div>
                <button (click)="showPsbtModal.set(false)" class="text-slate-400 hover:text-white transition">
                    <lucide-icon [img]="X" class="w-5 h-5"></lucide-icon>
                </button>
            </div>
            <div class="p-6 flex flex-col gap-4">
                <div class="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-start gap-3">
                    <lucide-icon [img]="AlertTriangle" class="w-5 h-5 text-emerald-400 shrink-0 mt-0.5"></lucide-icon>
                    <p class="text-xs text-emerald-200 leading-relaxed">
                        <strong>Privacy Warning:</strong> This file contains unencrypted metadata about your wallet balances, UTXOs, and destination addresses. 
                    </p>
                </div>
                <p class="text-xs text-slate-400 leading-relaxed">
                    You are downloading this to transfer to a Coldcard or air-gapped hardware wallet. Please delete the plaintext file from your computer after signing.
                </p>
                <div class="flex gap-3 mt-2">
                    <button (click)="showPsbtModal.set(false)" class="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition font-bold text-xs">
                        Cancel
                    </button>
                    <button (click)="executePsbtDownload()" class="flex-1 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/20 transition flex items-center justify-center gap-2">
                        <lucide-icon [img]="Download" class="w-4 h-4"></lucide-icon>
                        Download PSBT
                    </button>
                </div>
            </div>
        </div>
    </div>
  }

    @if (showAuditModal()) {
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden relative">
            <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <lucide-icon [img]="FileCheck" class="w-5 h-5 text-emerald-400"></lucide-icon>
                    <h3 class="font-bold text-white">Download Audit Log</h3>
                </div>
                <button (click)="showAuditModal.set(false)" class="text-slate-400 hover:text-white transition">
                    <lucide-icon [img]="X" class="w-5 h-5"></lucide-icon>
                </button>
            </div>
            <div class="p-6 flex flex-col gap-4">
                <div class="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-start gap-3">
                    <lucide-icon [img]="AlertTriangle" class="w-5 h-5 text-emerald-400 shrink-0 mt-0.5"></lucide-icon>
                    <p class="text-xs text-emerald-200 leading-relaxed">
                        <strong>Confidential Data:</strong> This PDF contains a complete, unencrypted record of the ceremony, including transaction details, participant identities, and action timestamps.
                    </p>
                </div>
                <p class="text-xs text-slate-400 leading-relaxed">
                    Please ensure it is stored securely and only shared with authorized participants or trusted third parties.
                </p>
                <div class="flex gap-3 mt-2">
                    <button (click)="showAuditModal.set(false)" class="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition font-bold text-xs">
                        Cancel
                    </button>
                    <button (click)="executeAuditDownload()" class="flex-1 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/20 transition flex items-center justify-center gap-2">
                        <lucide-icon [img]="Download" class="w-4 h-4"></lucide-icon>
                        Download PDF
                    </button>
                </div>
            </div>
        </div>
    </div>
  }

  @if (showCsvModal()) {
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden relative">
            <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <lucide-icon [img]="Download" class="w-5 h-5 text-blue-400"></lucide-icon>
                    <h3 class="font-bold text-white">Download CSV Data</h3>
                </div>
                <button (click)="showCsvModal.set(false)" class="text-slate-400 hover:text-white transition">
                    <lucide-icon [img]="X" class="w-5 h-5"></lucide-icon>
                </button>
            </div>
            <div class="p-6 flex flex-col gap-4">
                <div class="w-full bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex items-start gap-3">
                    <lucide-icon [img]="AlertTriangle" class="w-5 h-5 text-blue-400 shrink-0 mt-0.5"></lucide-icon>
                    <p class="text-xs text-blue-200 leading-relaxed">
                        <strong>Confidential Data:</strong> This spreadsheet contains unencrypted settlement data and participant metadata.
                    </p>
                </div>
                <p class="text-xs text-slate-400 leading-relaxed">
                    Please ensure it is stored securely and only shared with authorized participants or trusted third parties.
                </p>
                <div class="flex gap-3 mt-2">
                    <button (click)="showCsvModal.set(false)" class="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition font-bold text-xs">
                        Cancel
                    </button>
                    <button (click)="executeCsvDownload()" class="flex-1 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-bold rounded-lg border border-blue-500/20 transition flex items-center justify-center gap-2">
                        <lucide-icon [img]="Download" class="w-4 h-4"></lucide-icon>
                        Download CSV
                    </button>
                </div>
            </div>
        </div>
    </div>
  }

    @if (showRoomIdModal()) {
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden relative">
                <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <lucide-icon [img]="Hash" class="w-5 h-5 text-emerald-400"></lucide-icon>
                        <h3 class="font-bold text-white">Room Identifier</h3>
                    </div>
                    <button (click)="closeRoomIdModal()" class="text-slate-400 hover:text-white transition">
                        <lucide-icon [img]="X" class="w-5 h-5"></lucide-icon>
                    </button>
                </div>
                <div class="p-6 flex flex-col gap-4">
                    <div class="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-start gap-3">
                        <lucide-icon [img]="Shield" class="w-5 h-5 text-emerald-400 shrink-0"></lucide-icon>
                        <p class="text-xs text-emerald-200 leading-relaxed">
                            <strong>Public Routing Data:</strong> This ID directs signers to the correct room, but it <em>cannot</em> decrypt the transaction data without the private Decryption Key.
                        </p>
                    </div>
                    <p class="text-xs text-slate-400 leading-relaxed">
                        If you are practicing strict Operational Security (OpSec), send this Room ID to your signers first. Send the Decryption Key later via a separate, secure channel (e.g., Signal vs Email).
                    </p>
                    <button (click)="copyRoomId()" class="mt-2 w-full py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/20 transition flex items-center justify-center gap-2">
                        <lucide-icon [img]="roomIdCopied() ? Check : Copy" class="w-4 h-4"></lucide-icon>
                        {{ roomIdCopied() ? 'Room ID Copied!' : 'Copy Room ID' }}
                    </button>
                </div>
            </div>
        </div>
    }

    @if (showLabelModal()) {
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-fade-in">
        <div class="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl max-w-sm w-full">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-white font-bold">Label Signer</h3>
                <button (click)="closeLabelModal()" class="text-slate-500 hover:text-white"><lucide-icon [img]="X" class="w-5 h-5"></lucide-icon></button>
            </div>
            
            <div class="mb-4">
                <div class="text-xs text-slate-500 font-mono mb-1">Fingerprint</div>
                <div class="text-sm text-slate-300 font-mono bg-slate-950 p-2 rounded border border-slate-800">
                    {{ editingFingerprint() }}
                </div>
            </div>

            <div class="mb-4">
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Label Name</label>
                <input type="text" [(ngModel)]="editingLabel" (keyup.enter)="saveLabel()" 
                       placeholder="e.g. Alice (Ledger)" autofocus
                       class="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-xl block p-3 outline-none focus:border-emerald-500 transition"/>
            </div>

            <div class="mb-6 flex items-center gap-3 cursor-pointer select-none" (click)="saveToBook.set(!saveToBook())">
                <div class="w-5 h-5 rounded border flex items-center justify-center transition-colors"
                     [class.bg-emerald-500]="saveToBook()"
                     [class.border-emerald-500]="saveToBook()"
                     [class.border-slate-600]="!saveToBook()">
                    @if (saveToBook()) { <lucide-icon [img]="Check" class="w-3.5 h-3.5 text-slate-950"></lucide-icon> }
                </div>
                <div class="text-sm text-slate-300">Save to Address Book</div>
            </div>

            <button (click)="saveLabel()" class="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition">
                Save Label
            </button>
        </div>
    </div>
    }

    @if (socket.roomNotFound()) {
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-fade-in">
        <div class="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
            <div class="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <lucide-icon [img]="AlertOctagon" class="w-8 h-8 text-slate-500"></lucide-icon>
            </div>
            <h2 class="text-2xl font-bold text-white mb-2">Room Not Found</h2>
            <p class="text-slate-400 mb-8 text-sm">
                This room does not exist or has expired.<br>
                Please check the URL or create a new signing session.
            </p>
            <a routerLink="/create" class="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition flex items-center justify-center gap-2">
                <lucide-icon [img]="Zap" class="w-4 h-4"></lucide-icon> Create New Room
            </a>
        </div>
    </div>
    } 
    @else if (socket.isRoomFull()) {
        <div class="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm rounded-3xl border border-slate-800 animate-fade-in-up">
            <div class="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
                <div class="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <lucide-icon [img]="Users" class="w-8 h-8 text-amber-500"></lucide-icon>
                </div>
                <h2 class="text-2xl font-bold text-white mb-2">Room Full</h2>
                <p class="text-slate-400 mb-8">This room has reached its maximum connection limit.</p>
                <a routerLink="/" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 border border-slate-700 decoration-0">
                    <lucide-icon [img]="ArrowRight" class="w-4 h-4 rotate-180"></lucide-icon> Return Home
                </a>
            </div>
        </div>
      }
    @else if (socket.isLockedOut()) {
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-fade-in">
        <div class="bg-slate-900 border border-rose-900/50 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center relative overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 via-orange-500 to-rose-500"></div>
            <div class="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-rose-500/50">
                <lucide-icon [img]="Lock" class="w-8 h-8 text-rose-500"></lucide-icon>
            </div>
            <h2 class="text-2xl font-bold text-white mb-2">Access Denied</h2>
            <p class="text-slate-400 mb-8 text-sm">
                The Coordinator has locked this room.<br>
                No new guests can join the session at this time.
            </p>
            <a routerLink="/" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 border border-slate-700 decoration-0">
                <lucide-icon [img]="ArrowRight" class="w-4 h-4 rotate-180"></lucide-icon> Return Home
            </a>
        </div>
    </div>
    }

    @else if (socket.decryptionError()) {
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/95 backdrop-blur-md rounded-3xl border border-slate-800 animate-fade-in-up">
        <div class="max-w-md w-full p-8 text-center">
            <div class="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-rose-500/30">
                <lucide-icon [img]="Lock" class="w-8 h-8 text-rose-500"></lucide-icon>
            </div>
<h2 class="text-2xl font-bold text-white mb-2">Decryption Key Required</h2>
            <p class="text-slate-400 mb-6 text-sm">Your link is missing the private decryption key. Please enter it below to join the room.</p>
            <div class="flex gap-2 mb-4">
                <input type="text" [(ngModel)]="manualKey" placeholder="Enter decryption key..." class="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg block p-2.5 outline-none"/>
            </div>
            <button (click)="submitKey()" [disabled]="!manualKey" class="w-full py-3 bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white font-bold rounded-xl transition flex items-center justify-center gap-2">
                <lucide-icon [img]="RefreshCw" class="w-4 h-4"></lucide-icon> Decrypt Room
            </button>
        </div>
    </div>
    }

    @if (showRenameModal()) {
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden relative">
            
            <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <lucide-icon [img]="Tag" class="w-5 h-5 text-emerald-400"></lucide-icon>
                    <h3 class="font-bold text-white">Rename Room</h3>
                </div>
                <button (click)="closeRenameModal()" class="text-slate-400 hover:text-white transition">
                    <lucide-icon [img]="X" class="w-5 h-5"></lucide-icon>
                </button>
            </div>

            <div class="p-6">
                <p class="text-sm text-slate-400 mb-4">
                    Give this room a label to make it easier to identify. This name is visible to all participants.
                </p>

                <div class="space-y-2">
                    <div class="flex justify-between">
                        <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Room Name</label>
                        <span class="text-xs font-mono" 
                            [class.text-red-400]="newRoomName().length > 64" 
                            [class.text-slate-600]="newRoomName().length <= 64">
                            {{ newRoomName().length }} / 64
                        </span>
                    </div>
                    
                    <input 
                        type="text" 
                        [(ngModel)]="newRoomName" 
                        (keyup.enter)="saveRoomName()"
                        maxlength="64"  placeholder="e.g. Q1 Treasury Board Vote"
                        class="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition"
                        autofocus
                    />
                    
                    @if (newRoomName().length >= 64) {
                        <p class="text-xs text-red-400 animate-pulse">
                            Maximum length reached.
                        </p>
                    }
                </div>
            </div>

            <div class="p-4 bg-slate-950/50 border-t border-slate-800 flex justify-end gap-3">
                <button (click)="closeRenameModal()" class="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition text-sm font-medium">
                    Cancel
                </button>
                <button (click)="saveRoomName()" class="px-6 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-500/20">
                    Save Name
                </button>
            </div>

        </div>
    </div>
  }

    @if (showQrModal()) {
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden relative">
            
            <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <lucide-icon [img]="QrCode" class="w-5 h-5 text-emerald-400"></lucide-icon>
                    <h3 class="font-bold text-white">Room QR Code</h3>
                </div>
                <button (click)="closeQr()" class="text-slate-400 hover:text-white transition">
                    <lucide-icon [img]="X" class="w-5 h-5"></lucide-icon>
                </button>
            </div>

            <div class="p-6 flex flex-col items-center">
                
                <div class="w-full flex bg-slate-950 p-1 rounded-lg border border-slate-800 mb-4">
                    <button (click)="toggleQrKey(false)" 
                            class="flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2"
                            [class.bg-slate-800]="!qrIncludesKey()"
                            [class.text-emerald-400]="!qrIncludesKey()"
                            [class.text-slate-500]="qrIncludesKey()">
                        <lucide-icon [img]="Shield" class="w-3 h-3"></lucide-icon>
                        Link Only
                    </button>
                    <button (click)="toggleQrKey(true)" 
                            class="flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2"
                            [class.bg-slate-800]="qrIncludesKey()"
                            [class.text-amber-400]="qrIncludesKey()"
                            [class.text-slate-500]="!qrIncludesKey()">
                        <lucide-icon [img]="Key" class="w-3 h-3"></lucide-icon>
                        Full (Link + Key)
                    </button>
                </div>

                @if (qrIncludesKey()) {
                    <div class="w-full bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-6 flex items-start gap-3 animate-in fade-in zoom-in-95 duration-200">
                        <lucide-icon [img]="AlertTriangle" class="w-5 h-5 text-amber-500 shrink-0"></lucide-icon>
                        <p class="text-xs text-amber-200/80 leading-relaxed">
                            <strong>Contains Decryption Key:</strong> Anyone who scans this can join the room and view data. Treat it like a password.
                        </p>
                    </div>
                } @else {
                    <div class="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 mb-6 flex items-start gap-3 animate-in fade-in zoom-in-95 duration-200">
                        <lucide-icon [img]="Shield" class="w-5 h-5 text-emerald-400 shrink-0"></lucide-icon>
                        <p class="text-xs text-emerald-200/80 leading-relaxed">
                            <strong>Maximum Security:</strong> Key is excluded. You must send the <em>Link Key</em> via a separate secure channel.
                        </p>
                    </div>
                }

                <div class="relative group cursor-pointer" (click)="toggleQrReveal()">
                    
                    <div class="bg-white p-2 rounded-lg transition-all duration-300"
                         [class.blur-md]="!isQrRevealed()"
                         [class.opacity-50]="!isQrRevealed()">
                        @if (qrDataUrl()) {
                            <img [src]="qrDataUrl()" alt="Room QR Code" class="w-48 h-48 sm:w-56 sm:h-56">
                        } @else {
                            <div class="w-48 h-48 flex items-center justify-center">
                                <lucide-icon [img]="Loader2" class="w-8 h-8 text-slate-900 animate-spin"></lucide-icon>
                            </div>
                        }
                    </div>

                    @if (!isQrRevealed()) {
                        <div class="absolute inset-0 flex flex-col items-center justify-center z-10">
                            <div class="bg-slate-900/90 p-3 rounded-full border border-slate-700 shadow-xl mb-2">
                                <lucide-icon [img]="Eye" class="w-6 h-6 text-white"></lucide-icon>
                            </div>
                            <span class="text-xs font-bold text-slate-900 bg-white/90 px-2 py-1 rounded shadow-sm">Click to Reveal</span>
                        </div>
                    }
                </div>

                <p class="text-xs text-slate-500 mt-4 text-center">
                    Scan with a mobile wallet or camera to join.
                </p>

            </div>

            <div class="p-4 bg-slate-950/50 border-t border-slate-800 flex gap-3">
                <button (click)="downloadQr()" class="flex-1 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm transition flex items-center justify-center gap-2 border border-slate-700">
                    <lucide-icon [img]="Download" class="w-4 h-4"></lucide-icon>
                    Download Image
                </button>
                <button (click)="closeQr()" class="px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-medium text-sm transition border border-transparent hover:border-slate-700">
                    Close
                </button>
            </div>

        </div>
    </div>
  }

  @if (showShareModal()) {
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden relative">

            <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <lucide-icon [img]="Copy" class="w-5 h-5 text-slate-300"></lucide-icon>
                    <h3 class="font-bold text-white">Share Room Securely</h3>
                </div>
                <button (click)="closeShareModal()" class="text-slate-400 hover:text-white transition">
                    <lucide-icon [img]="X" class="w-5 h-5"></lucide-icon>
                </button>
            </div>

            <div class="p-6 flex flex-col gap-4">
                
                <div class="border border-emerald-500/30 bg-emerald-950/10 rounded-xl p-4 relative overflow-hidden group">
                    <div class="flex justify-between items-start mb-2 relative z-10">
                        <div>
                            <div class="flex items-center gap-2">
                                <lucide-icon [img]="Shield" class="w-4 h-4 text-emerald-400"></lucide-icon>
                                <h4 class="text-white font-bold text-sm">Maximum Security (Split)</h4>
                            </div>
                            <p class="text-xs text-slate-400 mt-1 leading-relaxed">
                                Copies the room URL <strong>without</strong> the decryption key. Send this link, then use the <em>"Link Key"</em> action to send the key via a separate, secure channel (e.g., Signal vs Email).
                            </p>
                        </div>
                    </div>
                    <button (click)="copySecureLink()" class="mt-3 w-full py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/20 transition flex items-center justify-center gap-2 relative z-10">
                        <lucide-icon [img]="secureLinkCopied() ? Check : Copy" class="w-4 h-4"></lucide-icon>
                        {{ secureLinkCopied() ? 'Secure Link Copied!' : 'Copy Link Only (No Key)' }}
                    </button>
                </div>

                <div class="border border-slate-700 bg-slate-900/50 rounded-xl p-4">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <div class="flex items-center gap-2">
                                <lucide-icon [img]="AlertTriangle" class="w-4 h-4 text-amber-500"></lucide-icon>
                                <h4 class="text-white font-bold text-sm">Standard (Combined)</h4>
                            </div>
                            <p class="text-xs text-slate-400 mt-1 leading-relaxed">
                                Copies the full URL including the decryption key (<code>#key</code>). Convenient for quick sharing, but if this single link is intercepted, the room is compromised.
                            </p>
                        </div>
                    </div>
                    <button (click)="copyFullLink()" class="mt-3 w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg border border-slate-700 transition flex items-center justify-center gap-2">
                        <lucide-icon [img]="fullLinkCopied() ? Check : Copy" class="w-4 h-4"></lucide-icon>
                        {{ fullLinkCopied() ? 'Full Link Copied!' : 'Copy Full Link (Link + Key)' }}
                    </button>
                </div>

            </div>
        </div>
    </div>
  }

  @if (showKeyModal()) {
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden relative">
            <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <lucide-icon [img]="Key" class="w-5 h-5 text-cyan-400"></lucide-icon>
                    <h3 class="font-bold text-white">Room Decryption Key</h3>
                </div>
                <button (click)="closeKeyModal()" class="text-slate-400 hover:text-white transition">
                    <lucide-icon [img]="X" class="w-5 h-5"></lucide-icon>
                </button>
            </div>
            <div class="p-6 flex flex-col gap-4">
                <div class="w-full bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3 flex items-start gap-3">
                    <lucide-icon [img]="AlertTriangle" class="w-5 h-5 text-cyan-400 shrink-0"></lucide-icon>
                    <p class="text-xs text-cyan-200 leading-relaxed">
                        <strong>Sensitive Data:</strong> This is the private encryption key for the room. Anyone with this key can decrypt and view the transaction details if they also have the room link.
                    </p>
                </div>
                <p class="text-xs text-slate-400 leading-relaxed">
                    For maximum operational security, send this key to signers using a different communication channel than the one used for the room link (e.g., Signal vs. Email).
                </p>
                <button (click)="copyKey()" class="mt-2 w-full py-2.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs font-bold rounded-lg border border-cyan-500/20 transition flex items-center justify-center gap-2">
                    <lucide-icon [img]="keyCopied() ? Check : Copy" class="w-4 h-4"></lucide-icon>
                    {{ keyCopied() ? 'Key Copied!' : 'Copy Decryption Key' }}
                </button>
            </div>
        </div>
    </div>
  }

  @if (showAdminModal()) {
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden relative">
            <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <lucide-icon [img]="FileKey" class="w-5 h-5 text-purple-400"></lucide-icon>
                    <h3 class="font-bold text-white">Backup Admin Token</h3>
                </div>
                <button (click)="closeAdminModal()" class="text-slate-400 hover:text-white transition">
                    <lucide-icon [img]="X" class="w-5 h-5"></lucide-icon>
                </button>
            </div>
            <div class="p-6 flex flex-col gap-4">
                <div class="w-full bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 flex items-start gap-3">
                    <lucide-icon [img]="AlertOctagon" class="w-5 h-5 text-purple-400 shrink-0"></lucide-icon>
                    <p class="text-xs text-purple-200 leading-relaxed">
                        <strong>High Privilege:</strong> This token allows any guest in the room to claim the "Coordinator" role.
                    </p>
                </div>
                <p class="text-xs text-slate-400 leading-relaxed">
                    Coordinators have the authority to manage whitelists, lock the room, verify inputs, and broadcast the final transaction. Only share this with trusted co-administrators.
                </p>
                <button (click)="copyAdminToken()" class="mt-2 w-full py-2.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-xs font-bold rounded-lg border border-purple-500/20 transition flex items-center justify-center gap-2">
                    <lucide-icon [img]="adminCopied() ? Check : Copy" class="w-4 h-4"></lucide-icon>
                    {{ adminCopied() ? 'Admin Token Copied!' : 'Copy Admin Token' }}
                </button>
            </div>
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
            
            <p class="text-slate-400 text-sm mb-6 leading-relaxed whitespace-pre-wrap break-words">{{confirmData().message }}
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

    <div class="max-w-7xl mx-auto px-6 py-8 relative min-h-[80vh]">
      
      <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div class="flex flex-col gap-6 mb-8 relative z-10">
        
        <div class="flex flex-wrap items-center gap-3">
            
            @if (isExpired()) {
                <span class="w-3 h-3 rounded-full bg-rose-600 shrink-0 shadow-[0_0_10px_#e11d48]" title="Room Expired"></span>
            } @else if (socket.roomState()?.isLocked) {
                <span class="w-3 h-3 rounded-full bg-amber-500 animate-pulse shadow-[0_0_10px_#f59e0b] shrink-0" title="Room Locked"></span>
            } @else {
                <span class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981] shrink-0" title="Room Active"></span>
            }
            
            <h1 class="text-2xl font-bold text-white truncate">
                {{ socket.roomState()?.roomName || 'Signing Room' }}
            </h1>

            @if (socket.isCoordinator()) {
                <button 
                    (click)="openRenameModal()" 
                    class="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
                    title="Rename Room">
                    <lucide-icon [img]="Edit2" class="w-4 h-4"></lucide-icon>
                </button>
            }

            <div class="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ml-1 flex items-center gap-1.5"
                 [class.bg-emerald-500\/10]="!socket.roomState()?.network || socket.roomState()?.network === 'bitcoin'"
                 [class.text-emerald-500]="!socket.roomState()?.network || socket.roomState()?.network === 'bitcoin'"
                 [class.border-emerald-500\/20]="!socket.roomState()?.network || socket.roomState()?.network === 'bitcoin'"

                 [class.bg-amber-500\/10]="socket.roomState()?.network === 'testnet'"
                 [class.text-amber-500]="socket.roomState()?.network === 'testnet'"
                 [class.border-amber-500\/20]="socket.roomState()?.network === 'testnet'"
                 
                 [class.bg-purple-500\/10]="socket.roomState()?.network === 'signet'"
                 [class.text-purple-500]="socket.roomState()?.network === 'signet'"
                 [class.border-purple-500\/20]="socket.roomState()?.network === 'signet'">
                <span class="opacity-70 font-medium">Network:</span>
                {{ socket.roomState()?.network === 'bitcoin' ? 'Mainnet' : (socket.roomState()?.network || 'Mainnet') }}
            </div>

            @if (socket.isCoordinator()) {
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-bold border border-indigo-500/20 ml-2">
                    <lucide-icon [img]="Crown" class="w-3 h-3"></lucide-icon> Coordinator
                </span>
            }
        </div>

        <div class="flex items-center gap-4 text-sm text-slate-500 bg-slate-900/50 w-fit px-4 py-2 rounded-xl border border-slate-800/50 backdrop-blur-sm">
            
            <div class="relative group">
                <button (click)="openRoomIdModal()" class="flex items-center gap-2 hover:bg-slate-800 p-1.5 -m-1.5 rounded-lg transition border border-transparent hover:border-slate-700 cursor-pointer">
                    <lucide-icon [img]="roomIdCopied() ? Check : Hash" class="w-4 h-4 transition-colors" 
                        [class.text-emerald-400]="roomIdCopied()" 
                        [class.text-slate-600]="!roomIdCopied()">
                    </lucide-icon>
                    <span class="font-mono transition font-bold" 
                        [class.text-emerald-400]="roomIdCopied()" 
                        [class.text-slate-300]="!roomIdCopied()"
                        [class.hover:text-white]="!roomIdCopied()">
                        {{ roomId() }}
                    </span>
                </button>
                
                <div class="absolute -top-9 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] font-bold px-2.5 py-1 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap border border-slate-700 shadow-xl">
                    {{ roomIdCopied() ? 'Copied!' : 'View Room ID' }}
                </div>
            </div>

            <div class="w-px h-4 bg-slate-800"></div>
            
            <div class="relative group">
                <button (click)="openSessionsModal()" class="relative group cursor-pointer hover:bg-slate-800 p-1.5 -m-1.5 rounded-lg transition border border-transparent hover:border-slate-700">
                    <div class="flex items-center gap-2">
                        <lucide-icon [img]="Users" class="w-4 h-4" 
                            [class.text-emerald-400]="(socket.roomState()?.connectedCount || 0) > 1"
                            [class.text-slate-500]="(socket.roomState()?.connectedCount || 0) <= 1">
                        </lucide-icon>
                        <span class="font-bold" [class.text-white]="(socket.roomState()?.connectedCount || 0) > 1">
                            {{ socket.roomState()?.connectedCount || 1 }} 
                        </span>
                    </div>
                </button>
                
                <div class="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] font-bold px-3 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-slate-700 shadow-xl z-[100]">
                    View Active Sessions
                </div>
            </div>

            <div class="w-px h-4 bg-slate-800"></div>

            <div class="relative group cursor-help">
                <div class="flex items-center gap-2" [class.text-rose-400]="isLowTime() || isExpired()" [class.text-slate-500]="!isLowTime() && !isExpired()">
                    <lucide-icon [img]="Clock" class="w-4 h-4"></lucide-icon>
                    @if (isExpired()) {
                        <span class="font-bold text-xs uppercase">Expired</span>
                    } @else {
                        <span class="font-mono font-bold">{{ timeRemaining() }}</span>
                    }
                </div>
                
                <div class="absolute -top-10 right-0 md:left-1/2 md:-translate-x-1/2 md:right-auto bg-slate-800 text-white text-[10px] font-bold px-3 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-slate-700 shadow-xl z-[100]">
                    Room auto-expires & securely wipes data
                </div>
            </div>
        </div>
        
        <div class="flex flex-col items-start gap-1">
            <div class="text-[10px] uppercase tracking-widest text-slate-500 font-bold ml-1">Room Actions</div>
            <div class="flex flex-wrap items-center p-1.5 bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-xl gap-2 shadow-xl">
                
                @if (!isExpired() && !socket.isClosed()) {
                    <div class="relative group">
                        <button (click)="promptAuditLogDownload()" class="px-3 py-2 text-emerald-400 hover:bg-emerald-950/30 hover:text-emerald-300 rounded-lg transition text-xs font-bold flex items-center gap-2 border border-transparent hover:border-emerald-500/20">
                            <lucide-icon [img]="FileCheck" class="w-4 h-4"></lucide-icon>
                            Audit Log
                        </button>
                    </div>

                    <div class="w-px h-6 bg-slate-800 mx-1"></div> 

                    <div class="relative group">
                        <button (click)="promptCsvDownload()" class="px-3 py-2 text-blue-400 hover:bg-blue-950/30 hover:text-blue-300 rounded-lg transition text-xs font-bold flex items-center gap-2 border border-transparent hover:border-blue-500/20">
                            <lucide-icon [img]="Download" class="w-4 h-4"></lucide-icon>
                            CSV
                        </button>
                    </div>
                    <div class="w-px h-6 bg-slate-800 mx-1"></div>
                }

                @if (socket.isCoordinator()) {
                    <div class="relative group">
                        <button (click)="openKeyModal()" class="px-3 py-2 text-cyan-400 hover:bg-cyan-950/30 hover:text-cyan-300 rounded-lg transition text-xs font-bold flex items-center gap-2 border border-transparent hover:border-cyan-500/20">
                            <lucide-icon [img]="keyCopied() ? Check : Key" class="w-4 h-4"></lucide-icon>
                            {{ keyCopied() ? 'Copied' : 'Link Key' }}
                        </button>
                    </div>

                    <div class="w-px h-6 bg-slate-800 mx-1"></div>

                    <div class="relative group">
                        <button (click)="openAdminModal()" class="px-3 py-2 text-purple-400 hover:bg-purple-950/30 hover:text-purple-300 rounded-lg transition text-xs font-bold flex items-center gap-2 border border-transparent hover:border-purple-500/20">
                            <lucide-icon [img]="adminCopied() ? Check : FileKey" class="w-4 h-4"></lucide-icon>
                            {{ adminCopied() ? 'Copied' : 'Backup Admin' }}
                        </button>
                    </div>
                    
                    <div class="w-px h-6 bg-slate-800 mx-1"></div>
                }

                <div class="relative group">
                    <button (click)="openShareModal()" class="px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition text-xs font-bold flex items-center gap-2 border border-transparent hover:border-slate-700">
                        <lucide-icon [img]="Copy" class="w-4 h-4"></lucide-icon>
                        Share Link
                    </button>
                </div>

                <div class="w-px h-6 bg-slate-800 mx-1"></div>

                <div class="relative group">
                    <button (click)="openQr()" class="px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition text-xs font-bold flex items-center gap-2 border border-transparent hover:border-slate-700">
                        <lucide-icon [img]="QrCode" class="w-4 h-4"></lucide-icon>
                        <span class="hidden sm:inline">QR Code</span>
                    </button>
                </div>

                @if (socket.isCoordinator()) {
                    <div class="w-px h-6 bg-slate-800 mx-1"></div>
                    <div class="relative group">
                        <button (click)="toggleLock()" 
                                class="px-3 py-2 rounded-lg transition text-xs font-bold flex items-center gap-2 border border-transparent"
                                [class.text-rose-400]="socket.roomState()?.isLocked"
                                [class.bg-rose-950\/30]="socket.roomState()?.isLocked"
                                [class.text-slate-400]="!socket.roomState()?.isLocked"
                                [class.hover:bg-slate-800]="!socket.roomState()?.isLocked">
                            <lucide-icon [img]="socket.roomState()?.isLocked ? Lock : Unlock" class="w-4 h-4"></lucide-icon>
                            {{ socket.roomState()?.isLocked ? 'Locked' : 'Lock Room' }}
                        </button>
                    </div>
                }

                @if (socket.isCoordinator() && !isExpired() && !socket.isClosed()) {
                    <div class="w-px h-6 bg-slate-800 mx-1"></div> 
                    <div class="relative group">
                        <button (click)="closeRoom()" class="px-3 py-2 bg-rose-950/30 text-rose-400 border border-rose-900/50 hover:bg-rose-900/50 hover:border-rose-500 hover:text-white rounded-lg transition text-xs font-bold flex items-center gap-2">
                            <lucide-icon [img]="Power" class="w-4 h-4"></lucide-icon>
                            Close
                        </button>
                    </div>
                }
            </div>
        </div>
      </div>

      @if (showSessionsModal()) {
        <div class="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-fade-in p-4">
            <div class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[80vh]">
                
                <div class="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900 z-10 shrink-0">
                    <div class="flex items-center gap-2">
                        <lucide-icon [img]="Users" class="w-5 h-5 text-emerald-400"></lucide-icon>
                        <h3 class="font-bold text-white">Active Sessions</h3>
                    </div>
                    <button (click)="showSessionsModal.set(false)" class="text-slate-400 hover:text-white transition">
                        <lucide-icon [img]="X" class="w-5 h-5"></lucide-icon>
                    </button>
                </div>

                <div class="p-4 border-b border-slate-800 bg-slate-950 shrink-0">
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">My Display Name</label>
                    <div class="flex gap-2">
                        <input type="text" [(ngModel)]="personalDisplayName" (keyup.enter)="savePersonalName()"
                            placeholder="e.g. Auditor Bob" maxlength="32"
                            class="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg block p-2.5 outline-none focus:border-emerald-500 transition"/>
                        <button (click)="savePersonalName()" class="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg transition text-sm">
                            Save
                        </button>
                    </div>
                    <p class="text-[10px] text-slate-500 mt-2">Your name is end-to-end encrypted and only visible to people currently in this room.</p>
                </div>

                <div class="p-4 overflow-y-auto custom-scrollbar flex-grow space-y-2">
                    @for (session of socket.activeSessions(); track session.id) {
                        <div class="flex items-center justify-between p-3 rounded-xl border transition-all"
                            [class.bg-emerald-900_10]="session.id === socket.currentSessionId()"
                            [class.border-emerald-500_30]="session.id === socket.currentSessionId()"
                            [class.bg-slate-950]="session.id !== socket.currentSessionId()"
                            [class.border-slate-800]="session.id !== socket.currentSessionId()">
                            
                            <div class="flex items-center gap-3 overflow-hidden">
                                <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                                    [class.bg-indigo-500_10]="session.role === 'admin'"
                                    [class.bg-slate-800]="session.role !== 'admin'">
                                    <lucide-icon [img]="session.role === 'admin' ? Crown : Users" 
                                                class="w-5 h-5"
                                                [class.text-indigo-400]="session.role === 'admin'"
                                                [class.text-slate-400]="session.role !== 'admin'"></lucide-icon>
                                </div>
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2">
                                        <span class="text-white font-bold text-sm truncate" [class.italic]="!session.displayName">
                                            {{ session.displayName || 'Anonymous Guest' }}
                                        </span>
                                        @if (session.id === socket.currentSessionId()) {
                                            <span class="text-[9px] uppercase tracking-wider font-bold bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">You</span>
                                        }
                                    </div>
                                    <div class="text-slate-500 text-[10px] font-mono mt-0.5">
                                        Session: {{ session.id }}
                                    </div>
                                </div>
                            </div>

                            <button class="transition p-2" 
                                [class.text-emerald-400]="copiedSessionId() === session.id"
                                [class.text-slate-600]="copiedSessionId() !== session.id"
                                [class.hover:text-white]="copiedSessionId() !== session.id"
                                title="Copy Session Details" 
                                (click)="copySessionId(session.id, session.displayName)">
                            <lucide-icon [img]="copiedSessionId() === session.id ? Check : Copy" class="w-3.5 h-3.5"></lucide-icon>
                            </button>
                        </div>
                    }
                    
                    @if (socket.activeSessions().length === 0) {
                        <div class="text-center py-6 text-slate-500 text-sm flex flex-col items-center gap-2">
                            <lucide-icon [img]="Loader2" class="w-5 h-5 animate-spin"></lucide-icon>
                            Syncing sessions...
                        </div>
                    }
                </div>
            </div>
        </div>
        }

      @if (socket.isClosed()) {
        <div class="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm rounded-3xl border border-slate-800 animate-fade-in-up">
            <div class="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
                <div class="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                    <lucide-icon [img]="Power" class="w-8 h-8 text-slate-400"></lucide-icon>
                </div>
                <h2 class="text-2xl font-bold text-white mb-2">Signing Room Closed</h2>
                <p class="text-slate-400 mb-8">The coordinator has ended this signing session. All data has been securely wiped.</p>
                <a routerLink="/create" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 border border-slate-700 decoration-0">
                    <lucide-icon [img]="Zap" class="w-4 h-4"></lucide-icon> Start New Signing
                </a>
            </div>
        </div>
      }

      @if (isExpired() && !socket.isClosed()) {
        <div class="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm rounded-3xl border border-slate-800">
            <div class="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
                <div class="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <lucide-icon [img]="AlertTriangle" class="w-8 h-8 text-rose-500"></lucide-icon>
                </div>
                <h2 class="text-2xl font-bold text-white mb-2">Room Expired</h2>
                <p class="text-slate-400 mb-8">This session has timed out. All ephemeral data has been wiped.</p>
                <a routerLink="/create" class="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition flex items-center justify-center gap-2 decoration-0">
                    <lucide-icon [img]="Zap" class="w-4 h-4"></lucide-icon> 
                    Start New Signing
                </a>
            </div>
        </div>
      }

      <div class="grid lg:grid-cols-3 gap-8 transition-all duration-500 relative z-10" 
           [class.opacity-20]="isExpired() || socket.isClosed()" 
           [class.pointer-events-none]="isExpired() || socket.isClosed()">
        
        <div class="lg:col-span-2 space-y-6">
            
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
                <div class="absolute top-0 right-0 p-4 opacity-10"><lucide-icon [img]="Shield" class="w-24 h-24 text-emerald-500"></lucide-icon></div>
                <h3 class="text-slate-500 text-xs font-bold uppercase tracking-wider mb-4">Transaction Proposal</h3>
                <div class="flex justify-between items-end relative z-10">
                    <div>
                        <div class="text-4xl font-bold text-white mb-1">{{ (socket.txDetails()?.amount || 0) / 100000000 | number:'1.8-8' }} <span class="text-slate-500 text-xl">BTC</span></div>
                        <div class="text-emerald-400 text-sm">~{{ ((socket.txDetails()?.amount || 0) / 100000000 * 95000) | currency:'USD' }}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-slate-400 text-sm">Network Fee</div>
                        <div class="text-white font-mono">{{ socket.txDetails()?.feeRate ?? '--' }} sats/vB</div>
                    </div>
                </div>
            </div>

            <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h3 class="text-slate-500 text-xs font-bold uppercase tracking-wider mb-4">Signer Actions</h3>
                <div class="grid md:grid-cols-2 gap-4">
                    <button (click)="promptPsbtDownload()" class="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-600 transition group text-left">
                        <div>
                            <div class="text-white font-bold text-sm mb-1 group-hover:text-emerald-400 transition-colors">Download Unsigned PSBT</div>
                            <div class="text-slate-500 text-xs">For Coldcard / Offline Signing</div>
                        </div>
                        <lucide-icon [img]="DownloadCloud" class="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors"></lucide-icon>
                    </button>
                    <label class="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-900/5 transition cursor-pointer group">
                        <div>
                            <div class="text-white font-bold text-sm mb-1 group-hover:text-emerald-400 transition-colors">Upload Signed PSBT</div>
                            <div class="text-slate-500 text-xs">Click to upload .psbt file here</div>
                        </div>
                        <lucide-icon [img]="UploadCloud" class="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors"></lucide-icon>
                        <input type="file" class="hidden" (change)="onFileSelected($event)" accept=".psbt,.txt">
                    </label>
                </div>
            </div>

            <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 min-h-[400px] flex flex-col">
          <div class="flex items-center justify-between mb-4">
              <h3 class="text-slate-500 text-xs font-bold uppercase tracking-wider">Transaction Details</h3>
              
              <div class="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button (click)="viewMode.set('inputs')" 
                          class="px-3 py-1 text-xs font-bold rounded-md transition-all"
                          [class.bg-slate-800]="viewMode() === 'inputs'"
                          [class.text-white]="viewMode() === 'inputs'"
                          [class.text-slate-500]="viewMode() !== 'inputs'">
                      Inputs ({{ socket.txDetails()?.inputs || 0 }})
                  </button>
                  <button (click)="viewMode.set('outputs')" 
                          class="px-3 py-1 text-xs font-bold rounded-md transition-all"
                          [class.bg-slate-800]="viewMode() === 'outputs'"
                          [class.text-white]="viewMode() === 'outputs'"
                          [class.text-slate-500]="viewMode() !== 'outputs'">
                      Outputs ({{ socket.txDetails()?.outputs?.length || 0 }})
                  </button>
              </div>
          </div>

          <div class="mb-4 relative">
              @if (viewMode() === 'inputs') {
                  <div class="relative flex items-center">
                      <lucide-icon [img]="Search" class="w-4 h-4 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"></lucide-icon>
                      
                      <input type="text" [(ngModel)]="inputSearchQuery" placeholder="Search input address..."
                             class="w-full bg-slate-950 border border-slate-800 text-white text-xs rounded-lg block py-2.5 pr-20 pl-10 outline-none focus:border-emerald-500/50 transition"/>
                      
                      <div class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 pointer-events-none"
                           title="Filtered Results">
                          {{ filteredInputs().length }}
                      </div>
                  </div>
              } @else {
                  <div class="relative flex items-center">
                      <lucide-icon [img]="Search" class="w-4 h-4 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"></lucide-icon>
                      
                      <input type="text" [(ngModel)]="outputSearchQuery" placeholder="Search output address..."
                             class="w-full bg-slate-950 border border-slate-800 text-white text-xs rounded-lg block py-2.5 pr-20 pl-10 outline-none focus:border-emerald-500/50 transition"/>
                      
                      <div class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 pointer-events-none"
                           title="Filtered Results">
                          {{ filteredOutputs().length }}
                      </div>
                  </div>
              }
          </div>

          @if (socket.isCoordinator()) {
            <div class="flex justify-end mb-2">
                @if (viewMode() === 'inputs' && (socket.txDetails()?.inputsList?.length || 0) > 3) {
                    <button (click)="verifyAllInputs()" class="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 px-2 py-1 rounded transition border border-transparent hover:border-emerald-500/20 flex items-center gap-1">
                        <lucide-icon [img]="CheckCircle" class="w-3 h-3"></lucide-icon> Verify All Inputs
                    </button>
                }
                @if (viewMode() === 'outputs' && (socket.txDetails()?.outputs?.length || 0) > 3) {
                    <button (click)="verifyAllOutputs()" class="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 px-2 py-1 rounded transition border border-transparent hover:border-cyan-500/20 flex items-center gap-1">
                        <lucide-icon [img]="CheckCircle" class="w-3 h-3"></lucide-icon> Verify All Outputs
                    </button>
                }
            </div>
          }

          <div class="space-y-3 flex-grow overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
              
              @if (viewMode() === 'inputs') {
                  @for (input of filteredInputs(); track $index) {
                      <div class="p-3 bg-slate-950 rounded border transition-all"
                           [class.border-emerald-500]="isWhitelisted(input.address)"
                           [class.border-slate-800]="!isWhitelisted(input.address)">
                          
                          <div class="flex justify-between items-start mb-2">
                              <div class="flex items-center gap-2 text-slate-400 text-xs">
                                <span class="font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">#{{ $index }}</span>
                                @if (input.txId && input.txId !== '????') {
                                    <span class="font-mono text-[10px] text-slate-600 truncate max-w-[120px]" title="TxID:Vout">{{ input.txId }}:{{ input.vout }}</span>
                                }
                            </div>
                            <div class="text-white font-bold text-sm">{{ input.amount / 100000000 | number:'1.8-8' }} <span class="text-slate-600 text-xs">BTC</span></div>
                          </div>
                          
                          <div class="flex items-start gap-2">
                              <lucide-icon [img]="ArrowDown" class="w-4 h-4 text-slate-600 mt-0.5 shrink-0"></lucide-icon>
                              <div class="flex-grow">
                                  <div class="font-mono text-xs text-slate-400 break-all leading-relaxed select-all">
                                      {{ input.address }}
                                  </div>
                                  
                                  @if (socket.isCoordinator()) {
                                      <div class="mt-2 flex items-center gap-2">
                                          @if (isWhitelisted(input.address)) {
                                              <span class="flex items-center gap-1 text-[10px] text-emerald-500 font-bold uppercase tracking-wider">
                                                  <lucide-icon [img]="Shield" class="w-3 h-3"></lucide-icon> Verified Source
                                              </span>
                                              <button (click)="toggleWhitelist(input.address)" class="text-[10px] text-slate-600 hover:text-rose-400 underline decoration-slate-800 underline-offset-2">Revoke</button>
                                          } @else {
                                              <button (click)="toggleWhitelist(input.address)" class="text-[10px] text-slate-500 hover:text-emerald-400 flex items-center gap-1 transition-colors">
                                                  <lucide-icon [img]="Shield" class="w-3 h-3"></lucide-icon> Approve Source
                                              </button>
                                          }
                                      </div>
                                  }
                              </div>
                          </div>
                      </div>
                  }
                  
                  @if ((socket.txDetails()?.inputsList?.length || 0) === 0) { 
                      <div class="text-center py-8 text-slate-600 text-sm">No input data available.</div> 
                  } @else if (filteredInputs().length === 0) {
                      <div class="text-center py-8 text-slate-500 text-sm">No inputs match your search.</div>
                  }
             }

             @if (viewMode() === 'outputs') {
                 @for (out of filteredOutputs(); track $index) {
                  <div class="p-3 bg-slate-950 rounded border transition-all"
                       [class.border-emerald-500]="isWhitelisted(out.address)"
                       [class.border-amber-500]="out.isChange" 
                       [class.border-rose-900]="!out.isChange && !isWhitelisted(out.address) && (socket.roomState()?.whitelist?.length || 0) > 0"
                       [class.border-slate-800]="!out.isChange && !isWhitelisted(out.address) && (!socket.roomState()?.whitelist || socket.roomState()?.whitelist?.length === 0)">
                      
                      <div class="flex justify-between items-start mb-2">
                          <div class="flex items-center gap-2 text-slate-400 text-xs">
                              <span class="font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">#{{ $index }}</span>
                              @if (out.isChange) {
                                  <span class="flex items-center gap-1 text-[10px] text-amber-500 font-bold uppercase tracking-wider bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                      <lucide-icon [img]="RefreshCw" class="w-3 h-3"></lucide-icon> Change
                                  </span>
                              } 
                              @else if (!isWhitelisted(out.address) && (socket.roomState()?.whitelist?.length || 0) > 0) {
                                  <span class="flex items-center gap-1 text-[10px] text-rose-500 font-bold uppercase tracking-wider">
                                      <lucide-icon [img]="AlertTriangle" class="w-3 h-3"></lucide-icon> Unverified
                                  </span>
                              }
                          </div>
                          <div class="text-white font-bold text-sm">{{ out.amount / 100000000 | number:'1.8-8' }} <span class="text-slate-600 text-xs">BTC</span></div>
                      </div>

                      <div class="flex items-start gap-2">
                          <lucide-icon [img]="out.isChange ? RefreshCw : ArrowRight" 
                                       class="w-4 h-4 mt-0.5 shrink-0"
                                       [class.text-amber-500]="out.isChange"
                                       [class.text-emerald-500]="!out.isChange">
                          </lucide-icon>
                          
                          <div class="flex-grow">
                              <div class="font-mono text-xs text-slate-300 break-all leading-relaxed select-all">{{ out.address }}</div>

                              @if (socket.isCoordinator()) {
                                  <div class="mt-2 flex items-center gap-2">
                                      @if (isWhitelisted(out.address)) {
                                          <span class="flex items-center gap-1 text-[10px] text-emerald-500 font-bold uppercase tracking-wider">
                                              <lucide-icon [img]="Shield" class="w-3 h-3"></lucide-icon> Verified Destination
                                          </span>
                                          <button (click)="toggleWhitelist(out.address)" class="text-[10px] text-slate-600 hover:text-rose-400 underline decoration-slate-800 underline-offset-2">Revoke</button>
                                      } @else {
                                          <button (click)="toggleWhitelist(out.address)" class="text-[10px] text-slate-500 hover:text-emerald-400 flex items-center gap-1 transition-colors">
                                              <lucide-icon [img]="Shield" class="w-3 h-3"></lucide-icon> Approve Destination
                                          </button>
                                      }
                                  </div>
                              }
                          </div>
                      </div>
                  </div>
                 }
                 
                 @if (!socket.txDetails()) { 
                     <div class="text-slate-500 text-sm text-center">Parsing transaction data...</div> 
                 } @else if (filteredOutputs().length === 0 && (socket.txDetails()?.outputs?.length || 0) > 0) {
                     <div class="text-center py-8 text-slate-500 text-sm">No outputs match your search.</div>
                 }
             }

          </div>
            </div>
        </div>

        <div class="lg:col-span-1">
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 h-full flex flex-col">
                <h3 class="text-slate-500 text-xs font-bold uppercase tracking-wider mb-6 flex justify-between">
                    <span>Signers</span>
                    <span class="text-white">{{ socket.signerCount() }} Signed</span>
                </h3>

                <div class="space-y-4 flex-grow">
                    @for (signer of socket.signers(); track signer.fingerprint) {
                        <div class="p-4 rounded-xl flex items-center justify-between border transition-all"
                             [class.bg-emerald-900_30]="signer.signed"
                             [class.border-emerald-500_30]="signer.signed"
                             [class.bg-slate-950]="!signer.signed"
                             [class.border-slate-800]="!signer.signed">
                             
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-full flex items-center justify-center"
                                     [class.bg-emerald-500_20]="signer.signed"
                                     [class.text-emerald-400]="signer.signed"
                                     [class.bg-slate-800]="!signer.signed"
                                     [class.text-slate-500]="!signer.signed">
                                    <lucide-icon [img]="signer.signed ? CheckCircle : Users" class="w-5 h-5"></lucide-icon>
                                </div>
                                <div>
                                    @if (socket.isCoordinator()) {
                                        <button (click)="openLabelModal(signer.fingerprint)" 
                                                class="text-sm font-mono flex items-center gap-2 hover:bg-slate-800/50 -ml-1 px-1 py-0.5 rounded transition group/label text-left">
                                            
                                            @if (getLabel(signer.fingerprint); as label) {
                                                <span class="text-white font-bold">{{ label }}</span>
                                                <span class="text-slate-500 text-xs">({{ signer.fingerprint }})</span>
                                                <lucide-icon [img]="Edit2" class="w-3 h-3 text-slate-600 group-hover/label:text-emerald-400 opacity-0 group-hover/label:opacity-100 transition"></lucide-icon>
                                            } @else {
                                                <span class="text-emerald-400/90 italic">Add Label</span>
                                                <span class="text-slate-500 text-xs">({{ signer.fingerprint }})</span>
                                                <lucide-icon [img]="Tag" class="w-3 h-3 text-emerald-400/50 group-hover/label:text-emerald-400"></lucide-icon>
                                            }
                                        </button>
                                    } @else {
                                        <div class="text-white font-medium text-sm font-mono">
                                            {{ getSignerLabel(signer.fingerprint) }}
                                        </div>
                                    }

                                    <div class="flex items-center gap-3">
                                        <div>
                                        <div class="flex items-center gap-2">
                                                <div class="text-xs" [class.text-emerald-400]="signer.signed" [class.text-slate-500]="!signer.signed">
                                                    {{ signer.signed ? 'Signed' : 'Waiting...' }}
                                                </div>

                                                @if (socket.isCoordinator() && !signer.signed) {
                                                    <button (click)="nudgeSigner(signer.fingerprint)" 
                                                            class="p-1 text-slate-600 hover:text-amber-400 transition cursor-pointer" 
                                                            title="Copy Nudge Message">
                                                        <lucide-icon [img]="Bell" class="w-3 h-3"></lucide-icon>
                                                    </button>
                                                }
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            @if (!signer.signed) { <lucide-icon [img]="Loader2" class="w-4 h-4 text-slate-600 animate-spin"></lucide-icon> }
                        </div>
                    }
                    @if (socket.signers().length === 0) { <div class="text-center p-4 text-slate-500 text-sm">Loading Signers...</div> }
                </div>

                <div class="mt-8 pt-6 border-t border-slate-800">
                    @if (finalHex()) {
                        <div class="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-4 animate-fade-in-up">
                            <div class="flex items-center gap-3 mb-4">
                                <div class="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/20">
                                    <lucide-icon [img]="Shield" class="w-5 h-5"></lucide-icon>
                                </div>
                                <div>
                                    <h4 class="text-white font-bold text-sm">Transaction Signed</h4>
                                    <p class="text-emerald-400 text-xs">
                                        {{ socket.isCoordinator() ? 'Ready to broadcast' : 'Awaiting Coordinator broadcast' }}
                                    </p>
                                </div>
                            </div>
                            
                            @if (socket.isCoordinator()) {
                                <div class="grid gap-3" [class.grid-cols-2]="!isEmbedded" [class.grid-cols-1]="isEmbedded">
                                    <button (click)="copyHex()" class="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg border border-slate-700 transition flex items-center justify-center gap-2">
                                        <lucide-icon [img]="copied() ? Check : Copy" class="w-3 h-3"></lucide-icon> {{ copied() ? 'Copied' : 'Copy Hex' }}
                                    </button>
                                    
                                    @if (!isEmbedded) {
                                        <button (click)="broadcastAndCopy()" class="py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 text-center decoration-0">
                                            Broadcast <lucide-icon [img]="ExternalLink" class="w-3 h-3"></lucide-icon>
                                        </button>
                                    }
                                </div>
                            }
                        </div>
                    } @else if (canFinalize) {  @if (socket.isCoordinator()) {
                        <button (click)="finalize()" class="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer">
                            <lucide-icon [img]="Shield" class="w-4 h-4"></lucide-icon> 
                            Finalize Transaction ({{ socket.signerCount() }}/{{ requiredSignatures }})
                        </button>
                        
                    } @else { <p class="text-xs text-center text-slate-500">Only the Coordinator can finalize.</p> }
                    } @else if (socket.isCoordinator()) {
                         <button disabled class="w-full py-3.5 bg-slate-800 text-slate-500 font-bold rounded-xl border border-slate-700 cursor-not-allowed flex items-center justify-center gap-2">
                             <lucide-icon [img]="Loader2" class="w-4 h-4 animate-spin"></lucide-icon> <span>Waiting for Signatures ({{ socket.signerCount() }} / {{ socket.signers().length }})</span>
                         </button>
                    } @else {
                        <div class="text-center p-4">
                            <p class="text-sm text-slate-400 font-medium mb-1">Waiting for Finalization</p>
                            <p class="text-xs text-slate-600 mb-4">{{ Math.max(0, requiredSignatures - (socket.signerCount() || 0)) }} more signatures required</p>
                            @if (!showClaimInput()) {
                                <button (click)="showClaimInput.set(true)" class="text-xs text-slate-500 hover:text-emerald-400 underline transition">Have the Admin Key? Claim Coordinator Role</button>
                            } @else {
                                <div class="flex gap-2 justify-center mt-2 animate-fade-in-up">
                                    <input type="password" [(ngModel)]="claimPassword" placeholder="Paste Admin Key here..." class="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-emerald-500 outline-none w-48 font-mono"/>
                                    <button (click)="claimRole()" class="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded hover:bg-emerald-500/30 transition border border-emerald-500/20">Claim</button>
                                </div>
                            }
                        </div>
                    }
                </div>
            </div>
        </div>
      </div>
    </div>
  `
})
export class RoomComponent implements OnInit, OnDestroy {

    @HostListener('window:beforeunload', ['$event'])
    unloadNotification($event: any) {
        if (this.socket.status() === 'connected' && !this.finalHex() && !this.socket.isClosed()) {
            $event.returnValue = true; 
        }
    }

    @HostListener('window:beforeunload')
    onBeforeUnload() {
        this.socket.gracefullyDisconnect();
    }

    // -------------------------------------------------------------------------
    // Icons
    // -------------------------------------------------------------------------

    readonly Shield = Shield;
    readonly Users = Users;
    readonly CheckCircle = CheckCircle;
    readonly Loader2 = Loader2;
    readonly Copy = Copy;
    readonly Clock = Clock;
    readonly ArrowRight = ArrowRight;
    readonly Hash = Hash;
    readonly Crown = Crown;
    readonly UploadCloud = UploadCloud;
    readonly DownloadCloud = DownloadCloud;
    readonly Download = Download;
    readonly ExternalLink = ExternalLink;
    readonly Check = Check;
    readonly Zap = Zap;
    readonly AlertTriangle = AlertTriangle;
    readonly Power = Power;
    readonly X = X;
    readonly Key = Key;
    readonly RefreshCw = RefreshCw;
    readonly AlertOctagon = AlertOctagon;
    readonly Math = Math;
    readonly FileKey = FileKey;
    readonly FileCheck = FileCheck;
    readonly Edit2 = Edit2;
    readonly Tag = Tag;
    readonly Lock = Lock;
    readonly Unlock = Unlock;
    readonly Bell = Bell;
    readonly Infinity = Infinity;
    readonly ArrowDown = ArrowDown;
    readonly QrCode = QrCode;
    readonly Eye = Eye;
    readonly EyeOff = EyeOff;
    readonly Search = Search;
    
    // -------------------------------------------------------------------------
    // Signals & UI State
    // -------------------------------------------------------------------------
    
    public roomId = signal<string | null>(null);
    public viewMode = signal<'inputs' | 'outputs'>('outputs');
    public isUploading = signal(false);
    public showRenameModal = signal(false);
    public newRoomName = signal('');

    public showQrModal = signal(false);
    public showSessionsModal = signal(false);
    public showKeyModal = signal(false);
    public showAdminModal = signal(false);
    public showRoomIdModal = signal(false);
    public showAuditModal = signal(false);
    public showCsvModal = signal(false);
    public showPsbtModal = signal(false);
    public personalDisplayName = signal('');
    public copiedSessionId = signal<string | null>(null);
    public isQrRevealed = signal(false);
    public qrDataUrl = signal<string | null>(null);
    public qrIncludesKey = signal(false);
    
    public timeRemaining = signal("Loading...");
    public isExpired = signal(false);
    public isLowTime = signal(false);
    private timerInterval: any;

    public inputSearchQuery = signal('');
    public outputSearchQuery = signal('');

    public filteredInputs = computed(() => {
        const inputs = this.socket.txDetails()?.inputsList || [];
        const query = this.inputSearchQuery().toLowerCase().trim();
        if (!query) return inputs;
        return inputs.filter(input => input.address.toLowerCase().includes(query));
    });

    public filteredOutputs = computed(() => {
        const outputs = this.socket.txDetails()?.outputs || [];
        const query = this.outputSearchQuery().toLowerCase().trim();
        if (!query) return outputs;
        return outputs.filter(output => output.address.toLowerCase().includes(query));
    });

    // -------------------------------------------------------------------------
    // Modals State
    // -------------------------------------------------------------------------
    public showLabelModal = signal(false);
    public showClaimInput = signal(false);
    
    // Unified Modal (Alerts & Confirms)
    public showConfirmModal = signal(false);
    public confirmData = signal({
        title: '',
        message: '',
        action: () => {},
        isDestructive: false,
        type: 'confirm' as 'confirm' | 'alert'
    });

    // -------------------------------------------------------------------------
    // Workflow Flags & Inputs
    // -------------------------------------------------------------------------
    public finalHex = computed(() => this.socket.roomState()?.finalTxHex || null);
    public copied = signal(false);
    public showShareModal = signal(false);
    public secureLinkCopied = signal(false);
    public fullLinkCopied = signal(false);
    public keyCopied = signal(false);
    public adminCopied = signal(false);
    public roomIdCopied = signal(false);
    
    public claimPassword = '';
    public manualKey = '';
    
    public editingFingerprint = signal<string | null>(null);
    public editingLabel = signal('');
    public saveToBook = signal(true);

    readonly icons = { Shield, Users, CheckCircle, Loader2, Copy, Clock, ArrowRight, Hash, Crown, UploadCloud, DownloadCloud, Download, ExternalLink, Check, Zap, AlertTriangle, Power, X, Key, RefreshCw, AlertOctagon, FileKey, FileCheck, Edit2, Tag, Lock, Unlock, Bell, Infinity, ArrowDown, Book };

    constructor(
        private route: ActivatedRoute,
        public socket: SocketService,
        private router: Router,
        private titleService: Title,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        effect(() => {
            const status = this.socket.status();
            const currentFragment = this.route.snapshot.fragment;

            if (status === 'connected' && currentFragment) {
                this.router.navigate([], {
                    relativeTo: this.route,
                    fragment: undefined,
                    replaceUrl: true 
                });
            }
        });

        effect(() => {
            if (!isPlatformBrowser(this.platformId)) return;
            const state = this.socket.roomState();

            if (this.socket.isLockedOut() || this.socket.roomNotFound() || this.socket.decryptionError() || this.socket.isRoomFull()) { 
                return; 
            }
            
            if (state) {
                if (state.createdAt) this.startTimer(state.expiresAt);
            }

            if (this.socket.isClosed()) {
                this.generateAuditLog(); 
            }
        });

        effect(() => {
            if (this.socket.isCoordinator()) {
                const _ = this.socket.signers(); 
                this.socket.checkAndApplyLocalLabels();
            }
        });

        effect(() => {
            const state = this.socket.roomState();
            const signers = this.socket.signers();
            
            // 1. Calculate Progress
            const signedCount = signers.filter(s => s.signed).length;
            const threshold = this.requiredSignatures; 
            const remaining = Math.max(0, threshold - signedCount);

            // 2. Determine State
            if (this.finalHex()) {
                // Stage 3: Done -> Green (Safe)
                this.titleService.setTitle("✅ Ready to Broadcast | Signing Room");
            } else if (signedCount >= threshold) {
                // Stage 2: Action Needed -> Orange (Alert)
                this.titleService.setTitle("🟠 Ready to Finalize | Signing Room");
            } else if (state?.isLocked) {
                this.titleService.setTitle("🔒 Room Locked | Signing Room");
            } else {
                // Stage 1: Waiting -> Red (Blocked)
                this.titleService.setTitle(`🔴 ${remaining} Needed | Signing Room`);
            }
        });
    }

    ngOnInit() {
        if (isPlatformBrowser(this.platformId)) {
            this.route.paramMap.subscribe(params => {
                const id = params.get('id');
                const fragmentKey = this.route.snapshot.fragment;

                if (id) {
                    this.roomId.set(id);

                    if (fragmentKey) {
                        this.socket.setRoomKey(fragmentKey);
                        
                        if (this.socket.status() !== 'connected' || this.roomId() !== id) {
                            this.socket.disconnect(false);
                            this.socket.connect(id, fragmentKey);
                        }
                    } else {
                        this.socket.decryptionError.set('Missing decryption key in URL'); 
                    }
                }
            });
        }
    }

    ngOnDestroy() {
        if (isPlatformBrowser(this.platformId)) {
            this.socket.gracefullyDisconnect();
            
            if (this.timerInterval) clearInterval(this.timerInterval);
        }
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    get requiredSignatures(): number {
      const psbt = this.socket.roomState()?.psbt;
      return psbt ? this.socket.getThreshold(psbt) : 0;
    }

    get canFinalize(): boolean {
        const state = this.socket.roomState();
        if (!state) return false;
        const signedCount = state.signatures.length; 
        const threshold = this.requiredSignatures;   
        return threshold > 0 && signedCount >= threshold;
    }

    get isEmbedded(): boolean {
        return window !== window.top;
    }

    isWhitelisted(address: string): boolean {
        return this.socket.roomState()?.whitelist?.includes(address) || false;
    }

    getSignerLabel(fingerprint: string): string {
        const labels = this.socket.roomState()?.signerLabels || {};
        const name = labels[fingerprint];
        return name ? `${name} (${fingerprint})` : fingerprint;
    }

    getLabel(fingerprint: string): string | undefined {
        return this.socket.roomState()?.signerLabels?.[fingerprint];
    }

    isSaved(fingerprint: string): boolean {
        return !!this.socket.getLocalLabel(fingerprint);
    }

    // -------------------------------------------------------------------------
    // Actions: File & PSBT
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

        this.isUploading.set(true); 

        try {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const isBinary = bytes[0] === 0x70 && bytes[1] === 0x73 && bytes[2] === 0x62 && bytes[3] === 0x74 && bytes[4] === 0xff;
            
            let content = isBinary 
                ? Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
                : new TextDecoder().decode(bytes).trim();

            if (content.startsWith('010000') || content.startsWith('020000')) {
                 this.openAlert("Invalid File", "This looks like a Raw Transaction. Please export as PSBT from your wallet.");
                 return;
            }

            await this.socket.uploadSignature(content);
            event.target.value = ''; 
        } catch (e) {
            console.error(e);
            this.openAlert("Read Error", "Failed to read file.");
        } finally {
            this.isUploading.set(false);
        }
    }

    promptPsbtDownload() {
        this.showPsbtModal.set(true);
    }

    async executePsbtDownload() {
        this.showPsbtModal.set(false);
        await this.socket.logAction('PSBT Downloaded', 'Unsigned file exported');
        this.downloadUnsignedPsbt();
    }

    downloadUnsignedPsbt() {
        this.socket.logAction('PSBT Downloaded', 'Unsigned file exported');
        const psbt = this.socket.roomState()?.psbt;
        if (!psbt) return;
        
        const blob = new Blob([psbt], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `unsigned_tx_${this.roomId()?.slice(0,8)}.psbt`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    // -------------------------------------------------------------------------
    // Actions: Room Management
    // -------------------------------------------------------------------------

    claimRole() {
        if (this.claimPassword) {
            const cleanToken = this.claimPassword.trim();
            sessionStorage.setItem(`admin_token_${this.roomId()}`, cleanToken);
            this.socket.claimCoordinator(cleanToken);
            this.showClaimInput.set(false);
            this.claimPassword = '';
        }
    }

    closeRoom() {
        this.openConfirm(
            'Close Room',
            'Are you sure you want to close this room? This action cannot be undone and will delete all data immediately.',
            () => {
                this.generateAuditLog();
                setTimeout(() => {
                    this.socket.closeRoom();
                    this.router.navigate(['/']); 
                }, 300);
            },
            true 
        );
    }

    openRenameModal() {
        const currentRoomName = this.socket.roomState()?.roomName;
        this.newRoomName.set(currentRoomName || '');
        this.showRenameModal.set(true);
    }

    closeRenameModal() {
        this.showRenameModal.set(false);
    }

    saveRoomName() {
        let name = this.newRoomName().trim();
        const MAX_LENGTH = 64;

        if (name.length > MAX_LENGTH) {
            name = name.slice(0, MAX_LENGTH);
        }

        if (!name) {
            return;
        }

        this.socket.renameRoom(name); 
        this.closeRenameModal();
    }

    toggleLock() {
        const current = this.socket.roomState()?.isLocked;
        const action = current ? 'Unlock' : 'LOCK';
        this.openConfirm(
            `${action} Room`,
            `Are you sure you want to ${action} this room? ${current ? 'New users will be able to join.' : 'No new users will be able to connect.'}`,
            () => this.socket.toggleLock(!current),
            !current 
        );
    }

    // -------------------------------------------------------------------------
    // Actions: Labeling & Whitelist
    // -------------------------------------------------------------------------

    openLabelModal(fingerprint: string) {
        const current = this.socket.roomState()?.signerLabels?.[fingerprint] || "";
        const saved = this.socket.getLocalLabel(fingerprint);
        
        this.editingFingerprint.set(fingerprint);
        this.editingLabel.set(current || saved || "");
        this.saveToBook.set(true); 
        this.showLabelModal.set(true);
    }

    saveLabel() {
    const fp = this.editingFingerprint();
    const label = this.editingLabel().trim();
    
    if (fp) {
        this.socket.updateSignerLabel(fp, label);

        if (this.saveToBook() && label) {
            this.socket.saveToAddressBook(fp, label);
        } else {
            this.socket.removeFromAddressBook(fp);
        }
    }
    this.closeLabelModal();
}

    closeLabelModal() {
        this.showLabelModal.set(false);
        this.editingFingerprint.set(null);
        this.editingLabel.set('');
    }

    toggleWhitelist(address: string) {
        const isPresent = this.isWhitelisted(address);
        // Addresses can be long, so we put them in the body message which wraps
        this.openConfirm(
            'Update Whitelist',
            `${isPresent ? 'Remove' : 'Add'} the following address ${isPresent ? 'from' : 'to'} the whitelist?\n\n${address}`,
            () => this.socket.updateWhitelist(address, isPresent),
            false
        );
    }

    openSessionsModal() {
        if (typeof localStorage !== 'undefined') {
            const savedName = localStorage.getItem(`display_name_${this.roomId()}`);
            this.personalDisplayName.set(savedName || '');
        }
        this.showSessionsModal.set(true);
    }

    savePersonalName() {
        const name = this.personalDisplayName().trim();
        this.socket.setDisplayName(name);
        const sid = this.socket.currentSessionId(); 
        const actionLabel = name ? `Identified as "${name}"` : 'Cleared display name';
        this.socket.logAction('Participant Identified', actionLabel);
        this.showSessionsModal.set(false);
    }

    copySessionId(id: string, displayName?: string) {
        const name = displayName || 'Anonymous Guest';
        const textToCopy = `${name} (Session: ${id})`;
        
        navigator.clipboard.writeText(textToCopy);
        this.copiedSessionId.set(id);
        
        // Reset it after 2 seconds
        setTimeout(() => this.copiedSessionId.set(null), 2000);
    }

    // -------------------------------------------------------------------------
    // BATCH ACTIONS
    // -------------------------------------------------------------------------

    verifyAllInputs() {
        const inputs = this.socket.txDetails()?.inputsList || [];
        if (inputs.length === 0) return;

        const toAdd = inputs
            .map(i => i.address)
            .filter(addr => !this.isWhitelisted(addr));

        if (toAdd.length > 0) {
            this.socket.updateWhitelistBatch(toAdd, false);
        }
    }

    verifyAllOutputs() {
        const outputs = this.socket.txDetails()?.outputs || [];
        if (outputs.length === 0) return;

        this.openConfirm(
            'Batch Verify Outputs',
            `Are you sure you want to verify all ${outputs.length} outputs?`,
            () => {
                const toAdd = outputs
                    .map(o => o.address)
                    .filter(addr => !this.isWhitelisted(addr));

                if (toAdd.length > 0) {
                    this.socket.updateWhitelistBatch(toAdd, false); 
                }
            },
            false
        );
    }

    // -------------------------------------------------------------------------
    // Actions: Finalization
    // -------------------------------------------------------------------------

    finalize() {
        if (this.isExpired()) return;
        const state = this.socket.roomState();
        
        const doFinalize = () => {
            const hex = this.socket.getFinalTxHex();
            const txId = this.socket.getFinalTxId();
            if (hex && txId) { 
                this.socket.broadcastFinalization(hex, txId);
                this.triggerConfetti();

                if (this.isEmbedded) {
                    window.parent.postMessage({
                        type: 'SIGNING_ROOM_EVENT',
                        action: 'transactionFinalized',
                        payload: { txHex: hex, txId: txId }
                    }, '*');
                }
            }
        };

        if (state?.whitelist && state.whitelist.length > 0) {
             const outputs = this.socket.txDetails()?.outputs || [];
             
             const unverified = outputs.filter(out => {
                 if (out.isChange) return false;
                 if (state.whitelist.includes(out.address)) return false;
                 return true;
             });

             if (unverified.length > 0) {
                 this.openConfirm(
                     'Security Warning',
                     `You are sending funds to ${unverified.length} unverified address(es). Are you sure you want to proceed?`,
                     () => doFinalize(),
                     true
                 );
                 return;
             }
        }

        doFinalize();
    }

    broadcastAndCopy() {
        this.socket.logAction('Broadcast', 'User clicked Broadcast button');
        if (this.finalHex()) {
            navigator.clipboard.writeText(this.finalHex()!);
            
            const rawNet = this.socket.roomState()?.network;
            const allowed = ['bitcoin', 'testnet', 'signet'];
            const net = allowed.includes(rawNet || '') ? rawNet : 'bitcoin';

            const baseUrl = net === 'bitcoin' ? 'https://mempool.space' 
                        : net === 'testnet' ? 'https://mempool.space/testnet' 
                        : 'https://mempool.space/signet';
            
            window.open(`${baseUrl}/tx/push`, '_blank');
        }
}

    // -------------------------------------------------------------------------
    // Actions: Unified Modal Logic (Alerts + Confirms)
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
        // Reset state
        this.confirmData.set({ title: '', message: '', action: () => {}, isDestructive: false, type: 'confirm' });
    }

    // -------------------------------------------------------------------------
    // Actions: QR Code Generation & Sharing
    // -------------------------------------------------------------------------

    async openQr() {
        this.showQrModal.set(true);
        this.isQrRevealed.set(false); 
        this.qrIncludesKey.set(false); 
        await this.generateQrData();
    }

    async toggleQrKey(includesKey: boolean) {
        this.qrIncludesKey.set(includesKey);
        this.isQrRevealed.set(false);
        await this.generateQrData();
    }

    private async generateQrData() {
        try {
            const link = this.qrIncludesKey() 
                ? this.getFullShareLink() 
                : window.location.href.split('#')[0];

            const dataUrl = await QRCode.toDataURL(link, {
                width: 400,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                },
                errorCorrectionLevel: 'M'
            });
            this.qrDataUrl.set(dataUrl);
        } catch (err) {
            console.error('QR Generation failed', err);
        }
    }

    closeQr() {
        this.showQrModal.set(false);
        this.qrDataUrl.set(null); 
    }

    toggleQrReveal() {
        const isRevealing = !this.isQrRevealed();
        this.isQrRevealed.update(v => !v);

        if (isRevealing) {
            const qrType = this.qrIncludesKey() ? 'Full (Link + Key)' : 'Link Only (No Key)';
            this.socket.logAction('QR Code Revealed', `${qrType} QR Code on screen`);
        }
    }

    downloadQr() {
        const url = this.qrDataUrl();
        if (!url) return;

        const qrType = this.qrIncludesKey() ? 'Full (Link + Key)' : 'Link Only (No Key)';
        this.socket.logAction('QR Code Downloaded', `${qrType} QR Code to their device`);

        const safeId = this.roomId() ?? 'unknown-room';

        const a = document.createElement('a');
        a.href = url;
        a.download = `signingroom-qr-${safeId.slice(0, 8)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }


    // -------------------------------------------------------------------------
    // Actions: Decryption & Keys
    // -------------------------------------------------------------------------

    submitKey() {
        if (!this.manualKey) return;
        let key = this.manualKey.trim();
        if (key.includes('#')) key = key.split('#')[1];
        this.socket.decryptionError.set('');
        this.socket.disconnect(false);
        this.socket.connect(this.roomId()!, key);
        this.manualKey = '';
    }

    // -------------------------------------------------------------------------
    // Actions: Downloads & Exports
    // -------------------------------------------------------------------------

    promptAuditLogDownload() {
        this.showAuditModal.set(true);
    }

    async executeAuditDownload() {
        this.showAuditModal.set(false);
        
        await this.socket.logAction('Audit Export', 'Downloaded audit log');

        await this.delay(1000);

        this.generateAuditLog();
    }

    promptCsvDownload() {
        this.showCsvModal.set(true);
    }

    async executeCsvDownload() {
        this.showCsvModal.set(false);
        await this.socket.logAction('CSV Export', 'Downloaded settlement data');
        await this.delay(1000);
        this.downloadCsv();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    generateAuditLog() {
        const state = this.socket.roomState();
        if (!state) return;

        const doc = new jsPDF();
        let y = 20;

        // Helper to check page bounds and add new pages automatically
        const checkPageBreak = (spaceNeeded: number) => {
            if (y + spaceNeeded > 280) {
                doc.addPage();
                y = 20;
            }
        };

        // Header
        doc.setFont('helvetica', 'bold'); 
        doc.setFontSize(24);
        doc.setTextColor(16, 185, 129);
        doc.text("SigningRoom.io", 20, y);
        
        // Subtitle
        doc.setFont('helvetica', 'normal'); 
        doc.setFontSize(16);
        doc.setTextColor(100);
        doc.text("Audit Log", 20, y + 10);
        y += 20;

        // Separator Line
        doc.setDrawColor(200); 
        doc.setLineWidth(0.5);
        doc.line(20, y, 190, y);
        y += 10;

        // Filename Construction
        const dateStr = new Date().toISOString().split('T')[0];
        const shortId = state.roomId.slice(0, 8);
        
        let txSuffix = "Pending";
        let partialHexDisplay = "Not yet finalized";
        
        const finalHex = this.finalHex();
        const finalTxId = this.socket.roomState()?.finalTxId;
        
        if (finalHex) {
            partialHexDisplay = `${finalHex.slice(0, 32)}...[${finalHex.length} bytes]...${finalHex.slice(-32)}`;
        }

        if (finalTxId) {
            txSuffix = finalTxId.slice(0, 8);
        }

        const filename = `SigningRoom_Audit_${dateStr}_Room-${shortId}_Tx-${txSuffix}.pdf`;

        // =========================================================
        // SECTION 1: ROOM METADATA & GOVERNANCE
        // =========================================================
        checkPageBreak(40);
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text("Room Info & Governance", 20, y); y += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(50);
        
        doc.text(`Room: ${state.roomName}`, 20, y); y += 6;
        doc.text(`Room ID: ${state.roomId}`, 20, y); y += 6;
        doc.text(`Network: ${(state.network || 'bitcoin').toUpperCase()}`, 20, y); y += 6;
        doc.text(`Created: ${new Date(state.createdAt).toLocaleString()}`, 20, y); y += 6;

        const lockStatus = state.isLocked ? "LOCKED (Secure)" : "UNLOCKED (Open)";
        doc.text(`Room Status: ${lockStatus}`, 20, y); y += 6;

        const whitelistCount = state.whitelist?.length || 0;
        doc.text(`Whitelist Enforcement: ${whitelistCount > 0 ? 'Active' : 'Disabled'}`, 20, y); 
        y += 15;

        // =========================================================
        // SECTION 2: TRANSACTION DATA
        // =========================================================
        checkPageBreak(40);
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text("Transaction Data", 20, y); y += 8;
        
        const txId = this.socket.roomState()?.finalTxId;
        if (txId) {
            doc.setFontSize(10);
            doc.setTextColor(50);
            doc.setFont('helvetica', 'bold');
            doc.text("Transaction ID (TXID):", 20, y); y += 5;
            
            doc.setFont('courier', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(0);
            doc.text(String(txId), 20, y); y += 8;
            
            // Add a clickable link hint
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(100);
            const explorerUrl = state.network === 'testnet' 
                ? 'mempool.space/testnet/tx/' 
                : state.network === 'signet' ? 'mempool.space/signet/tx/' : 'mempool.space/tx/';
            doc.text(`View on Explorer: ${explorerUrl}${txId.slice(0,8)}...`, 20, y); y += 10;
        }

        // B. Partial Hex (Visual Check)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(50);
        doc.text("Raw Hex Data (Partial):", 20, y); y += 5;

        doc.setFontSize(8);
        doc.setFont('courier', 'normal'); 
        doc.setTextColor(80);
        // Break long hex string if needed
        doc.text(partialHexDisplay, 20, y, { maxWidth: 170 });
        doc.setFont('helvetica', 'normal'); 
        y += 15;

        // =========================================================
        // SECTION 3: SIGNER ACTIVITY
        // =========================================================
        checkPageBreak(30);
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text("Signer Activity", 20, y); y += 10;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const signers = this.socket.signers();
        
        if (signers.length === 0) {
            doc.setTextColor(150);
            doc.text("No signers detected yet.", 20, y); y += 6;
        } else {
            signers.forEach((s, i) => {
                checkPageBreak(10);
                const status = s.signed ? "SIGNED" : "PENDING";
                
                const label = state.signerLabels?.[s.fingerprint];
                const displayName = label ? `${label} (${s.fingerprint})` : s.fingerprint;

                doc.setTextColor(50);
                doc.text(`${i+1}. ${displayName}`, 20, y);
                doc.text(status, 150, y);
                y += 6;
            });
        }
        y += 10;

        // =========================================================
        // SECTION 4: ROOM PARTICIPANTS
        // =========================================================
        checkPageBreak(30);
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text("Room Participants (Witnesses)", 20, y); y += 8;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        const participantsObj = state.participants || {};
        const historicalParticipants = Object.values(participantsObj);

        if (historicalParticipants.length === 0) {
            doc.setTextColor(150);
            doc.text("No participants recorded.", 20, y); y += 6;
        } else {
            historicalParticipants.forEach((p: any, i) => {
                checkPageBreak(10);
                doc.setTextColor(50);
                
                const roleBadge = p.role === 'admin' ? '[Coordinator]' : '[Guest]';
                const displayName = p.displayName ? p.displayName : 'Anonymous';
                
                doc.setFont('helvetica', 'bold');
                doc.text(`${i + 1}. ${displayName} ${roleBadge}`, 20, y);
                
                doc.setFont('courier', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(100);
                doc.text(`Session ID: ${p.id}`, 140, y);
                
                doc.setFontSize(10); 
                y += 6;
            });
        }
        y += 10;

        // =========================================================
        // SECTION 5: EVENT TIMELINE
        // =========================================================
        checkPageBreak(30);
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text("Event Timeline", 20, y); y += 10;
        
        doc.setFontSize(9);
        const logs = state.auditLog || [];
        
        if (logs.length === 0) {
            doc.setTextColor(150);
            doc.setFont('helvetica', 'italic');
            doc.text("No events logged yet.", 20, y); y += 6;
        } else {
            logs.forEach((log) => {
                if (!log) return;
                checkPageBreak(15);
                
                const safeEvent = log.event ? String(log.event) : 'System Event';
                const safeUser = log.user ? String(log.user) : 'System';
                
                const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '--:--';
                const date = log.timestamp ? new Date(log.timestamp).toLocaleDateString() : '--/--/--';
                
                doc.setTextColor(120);
                doc.setFont('helvetica', 'normal');
                doc.text(`${date} ${time}`, 20, y);
                
                doc.setTextColor(0);
                doc.setFont('helvetica', 'bold');
                doc.text(safeEvent, 65, y);
                
                doc.setFont('helvetica', 'normal');
                doc.text(safeUser, 110, y);
                
                if (log.detail) {
                    doc.setTextColor(100);
                    const detailStr = String(log.detail);
                    const detailText = detailStr.length > 30 ? detailStr.substring(0, 27) + '...' : detailStr;
                    doc.text(detailText, 150, y);
                }
                y += 7;
            });
        }
        y += 10;

        // =========================================================
        // SECTION 6: INPUT VERIFICATION (Appendix Data)
        // =========================================================
        checkPageBreak(30);
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text("Input Verification (Sources)", 20, y); y += 6;
        
        doc.setDrawColor(200);
        doc.line(20, y, 190, y); y += 5;

        const inputs = this.socket.txDetails()?.inputsList || [];
        const whitelist = state.whitelist || [];

        if (inputs.length === 0) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(150);
            doc.text("No input data parsed.", 20, y); y += 6;
        } else {
            inputs.forEach((inpt, i) => {
                checkPageBreak(15);
                const isWhitelisted = whitelist.includes(inpt.address);
                const amount = (inpt.amount / 100000000).toFixed(8);

                doc.setFontSize(8); 
                doc.setTextColor(50);
                doc.setFont('courier', 'normal');
                doc.text(`${i + 1}. ${inpt.address}`, 20, y);
                y += 4; 

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(0);
                doc.text(`${amount} BTC`, 25, y); 

                if (whitelist.length === 0) {
                     doc.setTextColor(100); 
                     doc.text("NO WHITELIST", 150, y);
                } else if (isWhitelisted) {
                     doc.setTextColor(16, 185, 129);
                     doc.text("VERIFIED SOURCE", 150, y);
                } else {
                     doc.setTextColor(220, 38, 38);
                     doc.text("UNVERIFIED", 150, y);
                }
                
                y += 8; // Spacing
            });
        }
        y += 10;

        // =========================================================
        // SECTION 7: OUTPUT VERIFICATION (Appendix Data)
        // =========================================================
        checkPageBreak(30);
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text("Output Verification", 20, y); y += 6;
        
        doc.setDrawColor(200);
        doc.line(20, y, 190, y); y += 5;
        
        const outputs = this.socket.txDetails()?.outputs || [];
        
        if (outputs.length === 0) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(150);
            doc.text("No output data available yet.", 20, y); y += 6;
        } else {
            outputs.forEach((out, i) => {
                checkPageBreak(15);
                const isWhitelisted = whitelist.includes(out.address);
                const amount = (out.amount / 100000000).toFixed(8);
                
                doc.setFontSize(8);
                doc.setTextColor(50);
                doc.setFont('courier', 'normal');
                doc.text(`${i + 1}. ${out.address}`, 20, y);
                y += 4; 

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(0);
                doc.text(`${amount} BTC`, 25, y);

                if (whitelist.length === 0) {
                    doc.setTextColor(100); 
                    doc.text("NO WHITELIST", 150, y);
                } else if (out.isChange) {
                    doc.setTextColor(245, 158, 11);
                    doc.text("CHANGE (VERIFIED)", 150, y);
                } else if (isWhitelisted) {
                    doc.setTextColor(16, 185, 129); // Green
                    doc.text("VERIFIED DESTINATION", 150, y); 
                } else {
                    doc.setTextColor(220, 38, 38); // Red
                    doc.text("UNVERIFIED", 150, y);
                }
                
                y += 8;
            });

            doc.setDrawColor(200);
            doc.line(20, y, 190, y); y += 8;
            
            doc.setFont('helvetica', 'normal'); 
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Total Outputs: ${outputs.length}`, 20, y); y += 15;
        }

        // =========================================================
        // FOOTER
        // =========================================================
        if (this.finalHex()) {
            checkPageBreak(20);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Final Tx Hash (SHA256 of Hex): Verified`, 20, y);
        }

        doc.save(filename);
    }

    downloadCsv() {
        const state = this.socket.roomState();
        const tx = this.socket.txDetails();
        if (!state || !tx) return;

        const headers = ["Date", "Room ID", "Network", "TXID", "Total Amount (BTC)", "Fee Rate (sats/vB)", "Inputs", "Outputs", "Signers", "Witnesses", "Status"];
        
        const signersList = this.socket.signers().map(s => `${s.fingerprint}${s.signed ? '(Signed)' : '(Pending)'}`).join("; ");
        
        const participantsObj = state.participants || {};
        const witnessesList = Object.values(participantsObj).map((p: any) => {
            const name = p.displayName || 'Anonymous';
            const role = p.role === 'admin' ? 'Coordinator' : 'Guest';
            return `${name} [${role}] (${p.id})`;
        }).join("; ")
        
        const row = [
            new Date().toISOString(),
            state.roomId,
            state.network,
            this.socket.getFinalTxId() || "Pending",
            (tx.amount / 100000000).toFixed(8),
            tx.feeRate,
            tx.inputsList?.length || 0,
            tx.outputs?.length || 0,
            `"${signersList}"`, 
            `"${witnessesList}"`,
            this.finalHex() ? "Signed & Ready" : "Pending Signatures"
        ];

        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n" 
            + row.join(",");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `settlement_${state.roomId}_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    private startTimer(expiryTime: number) {
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        this.timerInterval = setInterval(() => {
            const now = Date.now();
            const diff = expiryTime - now;

            if (diff <= 0) {
                this.timeRemaining.set("00 hrs 00 m 00 s");
                this.isExpired.set(true);
                clearInterval(this.timerInterval);
                this.socket.disconnect(); 
            } else {
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                const pad = (n: number) => n.toString().padStart(2, '0');
                
                this.timeRemaining.set(`${pad(hours)} hrs ${pad(minutes)} m ${pad(seconds)} s`);
                this.isLowTime.set(diff < 120000); 
            }
        }, 1000);
    }

    private triggerConfetti() {
        import('canvas-confetti').then(c => c.default());
    }

    copyHex() { this.doCopy(this.finalHex() || '', this.copied); }

    private doCopy(text: string, signalToToggle: any) {
        navigator.clipboard.writeText(text);
        if (signalToToggle) {
            signalToToggle.set(true);
            setTimeout(() => signalToToggle.set(false), 2000);
        }
    }

    private getFullShareLink(): string {
        const key = this.socket.getRoomKey();
        const baseUrl = window.location.href.split('#')[0];
        return `${baseUrl}${key ? '#' + key : ''}`;
    }

    nudgeSigner(fingerprint: string) {
        const label = this.getSignerLabel(fingerprint); 
        const msg = `Signature needed from: ${label}\n${this.getFullShareLink()}`;
        
        navigator.clipboard.writeText(msg).then(() => {
            this.openAlert('Nudge Message Copied', `Nudge message for ${label} copied! Paste it in your chat app.`);
        });
        this.socket.logAction('Nudge Sent', `Reminder sent to ${label}`);
    }

    // -------------------------------------------------------------------------
    // Actions: OpSec Link Sharing
    // -------------------------------------------------------------------------

    openShareModal() {
        this.showShareModal.set(true);
    }

    closeShareModal() {
        this.showShareModal.set(false);
    }

    copySecureLink() {
        const baseUrl = window.location.href.split('#')[0];
        this.doCopy(baseUrl, this.secureLinkCopied);
        this.socket.logAction('Link Copied (No Key)', 'User copied room link');
        this.closeShareModal();
    }

    copyFullLink() {
        this.doCopy(this.getFullShareLink(), this.fullLinkCopied);
         this.socket.logAction('Link Copied (With Key)', 'User copied room link');
        this.closeShareModal();
    }

    // -------------------------------------------------------------------------
    // Actions: OpSec Key & Admin Sharing
    // -------------------------------------------------------------------------

    openKeyModal() { this.showKeyModal.set(true); }
    closeKeyModal() { this.showKeyModal.set(false); }

    openAdminModal() { this.showAdminModal.set(true); }
    closeAdminModal() { this.showAdminModal.set(false); }

    openRoomIdModal() { this.showRoomIdModal.set(true); }
    closeRoomIdModal() { this.showRoomIdModal.set(false); }

    copyKey() { 
        this.doCopy(this.socket.getRoomKey() || '', this.keyCopied); 
        this.socket.logAction('Key Copied', 'Copied room decryption key')
        this.closeKeyModal();
    }

    copyAdminToken() { 
        const t = sessionStorage.getItem(`admin_token_${this.roomId()}`);
        if(t) this.doCopy(t, this.adminCopied);
        this.socket.logAction('Admin Token Copied', 'Backed up the admin token');
        this.closeAdminModal();
    }

    copyRoomId() {
        if (this.roomId()) {
            this.doCopy(this.roomId()!, this.roomIdCopied);
            this.socket.logAction('Room ID Copied', 'Copied the room identifier');
            this.closeRoomIdModal();
        }
    }
}
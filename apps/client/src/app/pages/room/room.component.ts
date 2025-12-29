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

import { Component, OnInit, signal, OnDestroy, effect, Inject, PLATFORM_ID, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router'; 
import { FormsModule } from '@angular/forms'; 
import { combineLatest } from 'rxjs'; 
import { 
    LucideAngularModule, Shield, Users, CheckCircle, Loader2, 
    Copy, Clock, ArrowRight, Hash, Crown, UploadCloud, DownloadCloud,
    Download, ExternalLink, Check, Zap, AlertTriangle, Power, X, Lock, Key, RefreshCw, AlertOctagon, FileKey, FileCheck,
    Edit2,
    Tag, Unlock, Bell, Infinity, ArrowDown, Book
} from 'lucide-angular';
import { SocketService } from '../../services/socket/socket.service'; 
import { jsPDF } from 'jspdf';

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
            <h2 class="text-2xl font-bold text-white mb-2">Decryption Failed</h2>
            <p class="text-slate-400 mb-6 text-sm">We successfully connected to the room, but your link is missing the correct decryption key.</p>
            <div class="flex gap-2 mb-4">
                <input type="text" [(ngModel)]="manualKey" placeholder="Enter decryption key..." class="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg block p-2.5 outline-none"/>
            </div>
            <button (click)="submitKey()" [disabled]="!manualKey" class="w-full py-3 bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white font-bold rounded-xl transition flex items-center justify-center gap-2">
                <lucide-icon [img]="RefreshCw" class="w-4 h-4"></lucide-icon> Decrypt Room
            </button>
        </div>
    </div>
    }
    @else if (showUnlockModal()) {
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl animate-fade-in">
        <div class="bg-slate-900 border border-emerald-500/30 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center relative overflow-hidden">
            
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-emerald-500"></div>

            <div class="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-emerald-500/50">
                <lucide-icon [img]="Shield" class="w-8 h-8 text-emerald-400"></lucide-icon>
            </div>

            <h2 class="text-2xl font-bold text-white mb-2">Enterprise Room</h2>
            <p class="text-slate-400 mb-6 text-sm">
                This transaction requires <strong>{{ socket.signers().length }} signers</strong>.
                <br>
                Unlock the Enterprise Room to coordinate up to 20 signers with Audit Logs.
            </p>

            @if (invoiceLoading()) {
                <div class="py-8 flex justify-center">
                    <lucide-icon [img]="Loader2" class="w-8 h-8 animate-spin text-emerald-500"></lucide-icon>
                </div>
            } @else {
                <div class="bg-white p-2 rounded-lg mx-auto w-fit mb-4">
                    <img [src]="'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + paymentRequest()" class="w-48 h-48">
                </div>

                <div class="bg-slate-950 border border-slate-800 rounded p-2 mb-4 flex items-center justify-between gap-2 max-w-xs mx-auto">
                    <div class="font-mono text-[10px] text-slate-500 truncate w-full text-left select-all">
                        {{ paymentRequest() }}
                    </div>
                    <button (click)="copyInvoice()" class="text-emerald-400 hover:text-emerald-300 p-1 hover:bg-emerald-900/20 rounded transition">
                        <lucide-icon [img]="Copy" class="w-4 h-4"></lucide-icon>
                    </button>
                </div>

                <div class="font-mono text-xs text-emerald-400 mb-2 px-4">
                    Pay 21,000 sats to unlock
                </div>
                <div class="flex items-center justify-center gap-2 text-[10px] text-slate-500 animate-pulse">
                    <lucide-icon [img]="Loader2" class="w-3 h-3 animate-spin"></lucide-icon>
                    Listening for payment...
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
                @if (socket.roomState()?.tier === 'enterprise') {
                    {{ socket.roomState()?.roomName || 'Untitled Boardroom' }}
                } @else {
                    Standard Room
                }
            </h1>

            @if (socket.isCoordinator() && socket.roomState()?.tier === 'enterprise') {
                <button (click)="renameRoom()" class="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition flex items-center justify-center cursor-pointer shrink-0" title="Rename Room">
                    <lucide-icon [img]="Edit2" class="w-3.5 h-3.5"></lucide-icon>
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

            @if (socket.roomState()?.isGenesis) {
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-200 to-yellow-400 text-slate-900 text-[10px] font-bold shadow-[0_0_15px_rgba(251,191,36,0.4)] ml-2">
                    <lucide-icon [img]="Infinity" class="w-3 h-3 fill-slate-900"></lucide-icon> Founder
                </span>
            }
        </div>

        <div class="flex items-center gap-4 text-sm text-slate-500 bg-slate-900/50 w-fit px-4 py-2 rounded-xl border border-slate-800/50 backdrop-blur-sm">
            
            <div class="relative group cursor-help">
                <div class="flex items-center gap-2">
                    <lucide-icon [img]="Hash" class="w-4 h-4 text-slate-600"></lucide-icon>
                    <span class="font-mono text-slate-300 select-all hover:text-white transition cursor-text font-bold">{{ roomId() }}</span>
                </div>
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-slate-200 text-[10px] rounded shadow-lg border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    Unique Room ID
                    <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700"></div>
                </div>
            </div>

            <div class="w-px h-4 bg-slate-800"></div>
            
            <div class="relative group cursor-help">
                <div class="flex items-center gap-2">
                    <lucide-icon [img]="Users" class="w-4 h-4" 
                        [class.text-emerald-400]="(socket.roomState()?.connectedCount || 0) > 1"
                        [class.text-slate-500]="(socket.roomState()?.connectedCount || 0) <= 1">
                    </lucide-icon>
                    <span class="font-bold" [class.text-white]="(socket.roomState()?.connectedCount || 0) > 1">
                        {{ socket.roomState()?.connectedCount || 1 }} 
                    </span>
                </div>
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-slate-200 text-[10px] rounded shadow-lg border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    Active Peers
                    <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700"></div>
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
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-slate-200 text-[10px] rounded shadow-lg border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    Time until data wipe
                    <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700"></div>
                </div>
            </div>
        </div>
        
        <div class="flex flex-col items-start gap-1">
            <div class="text-[10px] uppercase tracking-widest text-slate-500 font-bold ml-1">Room Actions</div>
            <div class="flex flex-wrap items-center p-1.5 bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-xl gap-2 shadow-xl">
                @if (!isExpired() && !socket.isClosed()) {
                    <div class="relative group">
                        <button (click)="openExtendModal()" class="px-3 py-2 text-amber-400 hover:bg-amber-950/30 hover:text-amber-300 rounded-lg transition text-xs font-bold flex items-center gap-2 border border-transparent hover:border-amber-500/20">
                            <lucide-icon [img]="Zap" class="w-4 h-4"></lucide-icon>
                            Extend
                        </button>
                        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1 bg-slate-800 text-slate-200 text-[10px] rounded shadow-lg border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            Add 24h (5000 sats)
                            <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700"></div>
                        </div>
                    </div>
                    <div class="w-px h-6 bg-slate-800 mx-1"></div> 
                }
                @if (socket.roomState()?.tier === 'enterprise') {
                    <div class="relative group">
                        <button (click)="generateAuditLog()" class="px-3 py-2 text-emerald-400 hover:bg-emerald-950/30 hover:text-emerald-300 rounded-lg transition text-xs font-bold flex items-center gap-2 border border-transparent hover:border-emerald-500/20">
                            <lucide-icon [img]="FileCheck" class="w-4 h-4"></lucide-icon>
                            Audit Log
                        </button>
                        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1 bg-slate-800 text-slate-200 text-[10px] rounded shadow-lg border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            Download PDF proof
                            <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700"></div>
                        </div>
                    </div>
                    <div class="w-px h-6 bg-slate-800 mx-1"></div> 
                }
                @if (socket.isCoordinator()) {
                    <div class="relative group">
                        <button (click)="copyKey()" class="px-3 py-2 text-cyan-400 hover:bg-cyan-950/30 hover:text-cyan-300 rounded-lg transition text-xs font-bold flex items-center gap-2 border border-transparent hover:border-cyan-500/20">
                            <lucide-icon [img]="keyCopied() ? Check : Key" class="w-4 h-4"></lucide-icon>
                            {{ keyCopied() ? 'Link Key' : 'Link Key' }}
                        </button>
                        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1 bg-slate-800 text-slate-200 text-[10px] rounded shadow-lg border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            Copy decryption key manually
                            <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700"></div>
                        </div>
                    </div>

                    <div class="relative group">
                        <button (click)="copyAdminToken()" class="px-3 py-2 text-purple-400 hover:bg-purple-950/30 hover:text-purple-300 rounded-lg transition text-xs font-bold flex items-center gap-2 border border-transparent hover:border-purple-500/20">
                            <lucide-icon [img]="adminCopied() ? Check : FileKey" class="w-4 h-4"></lucide-icon>
                            {{ adminCopied() ? 'Copied' : 'Backup Admin' }}
                        </button>
                        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1 bg-slate-800 text-slate-200 text-[10px] rounded shadow-lg border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            Save credential to claim role later
                            <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700"></div>
                        </div>
                    </div>
                    
                    <div class="w-px h-6 bg-slate-800 mx-1"></div>
                }
                <div class="relative group">
                    <button (click)="copyInvite()" class="px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition text-xs font-bold flex items-center gap-2 border border-transparent hover:border-slate-700">
                        <lucide-icon [img]="inviteCopied() ? Check : Copy" class="w-4 h-4"></lucide-icon>
                        {{ inviteCopied() ? 'Copied' : 'Share Link' }}
                    </button>
                    <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1 bg-slate-800 text-slate-200 text-[10px] rounded shadow-lg border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        Copy secure invite URL
                        <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700"></div>
                    </div>
                </div>
                @if (socket.isCoordinator() && socket.roomState()?.tier === 'enterprise') {
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
                        
                        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1 bg-slate-800 text-slate-200 text-[10px] rounded shadow-lg border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            {{ socket.roomState()?.isLocked ? 'Room is secure. No new joins.' : 'Prevent new connections' }}
                        </div>
                    </div>
                }
                @if (socket.isCoordinator() && !isExpired() && !socket.isClosed()) {
                    <div class="w-px h-6 bg-slate-800 mx-1"></div> 
                    <div class="relative group">
                        <button (click)="closeRoom()" class="px-3 py-2 bg-rose-950/30 text-rose-400 border border-rose-900/50 hover:bg-rose-900/50 hover:border-rose-500 hover:text-white rounded-lg transition text-xs font-bold flex items-center gap-2">
                            <lucide-icon [img]="Power" class="w-4 h-4"></lucide-icon>
                            Close
                        </button>
                        <div class="absolute bottom-full right-0 mb-3 px-2 py-1 bg-rose-950 text-rose-200 text-[10px] rounded shadow-lg border border-rose-800 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            Destroy room & data immediately
                            <div class="absolute top-full right-4 border-4 border-transparent border-t-rose-800"></div>
                        </div>
                    </div>
                }
            </div>
        </div>
      </div>

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

      @if (showPaymentModal()) {
        <div class="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm rounded-3xl border border-slate-800 animate-fade-in-up">
            <div class="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center relative">
                <button (click)="showPaymentModal.set(false)" class="absolute top-4 right-4 text-slate-500 hover:text-white"><lucide-icon [img]="X" class="w-5 h-5"></lucide-icon></button>
                <h3 class="text-xl font-bold text-white mb-1">Extend Session</h3>
                <p class="text-slate-400 text-xs mb-6">Pay 5000 sats via Lightning to add 24 hours.</p>
                @if (invoiceLoading()) {
                    <div class="py-12 flex justify-center"><lucide-icon [img]="Loader2" class="w-8 h-8 text-emerald-500 animate-spin"></lucide-icon></div>
                } @else if (paymentRequest()) {
                    <div class="bg-white p-2 rounded-lg mb-4 mx-auto w-fit"><img [src]="'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + paymentRequest()" class="w-48 h-48"></div>
                    <div class="bg-slate-950 border border-slate-800 rounded p-2 mb-4 flex items-center justify-between gap-2">
                        <div class="font-mono text-[10px] text-slate-500 truncate w-full text-left select-all">{{ paymentRequest() }}</div>
                        <button (click)="copyInvoice()" class="text-emerald-400 hover:text-emerald-300"><lucide-icon [img]="Copy" class="w-4 h-4"></lucide-icon></button>
                    </div>
                    <div class="flex items-center justify-center gap-2 text-xs text-emerald-400 animate-pulse"><lucide-icon [img]="Loader2" class="w-3 h-3 animate-spin"></lucide-icon>Waiting for payment...</div>
                }
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
                    <button (click)="downloadUnsignedPsbt()" class="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-600 transition group text-left">
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
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-slate-500 text-xs font-bold uppercase tracking-wider">Transaction Details</h3>
                    
                    <div class="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                        <button (click)="viewMode.set('inputs')" 
                                class="px-3 py-1 text-xs font-bold rounded-md transition-all"
                                [class.bg-slate-800]="viewMode() === 'inputs'"
                                [class.text-white]="viewMode() === 'inputs'"
                                [class.text-slate-500]="viewMode() !== 'inputs'"
                                [class.hover:text-slate-300]="viewMode() !== 'inputs'">
                            Inputs ({{ socket.txDetails()?.inputs || 0 }})
                        </button>
                        <button (click)="viewMode.set('outputs')" 
                                class="px-3 py-1 text-xs font-bold rounded-md transition-all"
                                [class.bg-slate-800]="viewMode() === 'outputs'"
                                [class.text-white]="viewMode() === 'outputs'"
                                [class.text-slate-500]="viewMode() !== 'outputs'"
                                [class.hover:text-slate-300]="viewMode() !== 'outputs'">
                            Outputs ({{ socket.txDetails()?.outputs?.length || 0 }})
                        </button>
                    </div>
                </div>

                <div class="space-y-3 flex-grow overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                   
                   @if (viewMode() === 'inputs') {
                        @for (input of socket.txDetails()?.inputsList; track $index) {
                            <div class="p-3 bg-slate-950 rounded border transition-all"
                                 [class.border-emerald-500]="isWhitelisted(input.address)"
                                 [class.border-slate-800]="!isWhitelisted(input.address)">
                                
                                <div class="flex justify-between items-start mb-2">
                                    <div class="flex items-center gap-2 text-slate-400 text-xs">
                                        <span class="font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">#{{ $index }}</span>
                                        <span class="font-mono text-[10px] text-slate-600 truncate max-w-[120px]" title="TxID:Vout">{{ input.txId }}:{{ input.vout }}</span>
                                    </div>
                                    <div class="text-white font-bold text-sm">{{ input.amount / 100000000 | number:'1.8-8' }} <span class="text-slate-600 text-xs">BTC</span></div>
                                </div>
                                
                                <div class="flex items-start gap-2">
                                    <lucide-icon [img]="ArrowDown" class="w-4 h-4 text-slate-600 mt-0.5 shrink-0"></lucide-icon>
                                    
                                    <div class="flex-grow">
                                        <div class="font-mono text-xs text-slate-400 break-all leading-relaxed select-all">
                                            {{ input.address }}
                                        </div>
                                        
                                        @if (socket.isCoordinator() && socket.roomState()?.tier === 'enterprise') {
                                            <div class="mt-2 flex items-center gap-2">
                                                @if (isWhitelisted(input.address)) {
                                                    <span class="flex items-center gap-1 text-[10px] text-emerald-500 font-bold uppercase tracking-wider">
                                                        <lucide-icon [img]="Shield" class="w-3 h-3"></lucide-icon> Verified Source
                                                    </span>
                                                    <button (click)="toggleWhitelist(input.address)" class="text-[10px] text-slate-600 hover:text-rose-400 underline decoration-slate-800 underline-offset-2">
                                                        Revoke
                                                    </button>
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
                        }
                   }

                   @if (viewMode() === 'outputs') {
                       @for (out of socket.txDetails()?.outputs; track $index) {
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
                                            <lucide-icon [img]="RefreshCw" class="w-3 h-3"></lucide-icon> Change (Back to Wallet)
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
                                    <div class="font-mono text-xs text-slate-300 break-all leading-relaxed select-all">
                                        {{ out.address }}
                                    </div>

                                    @if (socket.isCoordinator() && socket.roomState()?.tier === 'enterprise') {
                                        <div class="mt-2 flex items-center gap-2">
                                            @if (isWhitelisted(out.address)) {
                                                <span class="flex items-center gap-1 text-[10px] text-emerald-500 font-bold uppercase tracking-wider">
                                                    <lucide-icon [img]="Shield" class="w-3 h-3"></lucide-icon> Verified Destination
                                                </span>
                                                <button (click)="toggleWhitelist(out.address)" class="text-[10px] text-slate-600 hover:text-rose-400 underline decoration-slate-800 underline-offset-2">
                                                    Revoke
                                                </button>
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
                       @if (!socket.txDetails()) { <div class="text-slate-500 text-sm text-center">Parsing transaction data...</div> }
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
                                    @if (socket.roomState()?.tier === 'enterprise' && socket.isCoordinator()) {
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

                                                @if (socket.isCoordinator() && socket.roomState()?.tier === 'enterprise' && !signer.signed) {
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
                                    <p class="text-emerald-400 text-xs">Ready to broadcast</p>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <button (click)="copyHex()" class="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg border border-slate-700 transition flex items-center justify-center gap-2">
                                    <lucide-icon [img]="copied() ? Check : Copy" class="w-3 h-3"></lucide-icon> {{ copied() ? 'Copied' : 'Copy Hex' }}
                                </button>
                                <button (click)="broadcastAndCopy()" class="py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 text-center decoration-0">
                                    Broadcast <lucide-icon [img]="ExternalLink" class="w-3 h-3"></lucide-icon>
                                </button>
                            </div>
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
                            <p class="text-xs text-slate-600 mb-4">{{ Math.max(0, 2 - (socket.signerCount() || 0)) }} more signatures required</p>
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
    
    // -------------------------------------------------------------------------
    // Signals & UI State
    // -------------------------------------------------------------------------
    
    public roomId = signal<string | null>(null);
    public viewMode = signal<'inputs' | 'outputs'>('outputs');
    public isUploading = signal(false);
    
    public timeRemaining = signal("Loading...");
    public isExpired = signal(false);
    public isLowTime = signal(false);
    private timerInterval: any;

    // -------------------------------------------------------------------------
    // Modals State
    // -------------------------------------------------------------------------
    public showLabelModal = signal(false);
    public showPaymentModal = signal(false);
    public showUnlockModal = signal(false);
    public showClaimInput = signal(false);
    
    // Unified Modal (Alerts & Confirms)
    public showConfirmModal = signal(false);
    public confirmData = signal({
        title: '',
        message: '',
        action: () => {},
        isDestructive: false,
        type: 'confirm' as 'confirm' | 'alert' // New Type
    });

    // -------------------------------------------------------------------------
    // Workflow Flags & Inputs
    // -------------------------------------------------------------------------
    public finalHex = signal<string | null>(null);
    public copied = signal(false);
    public inviteCopied = signal(false);
    public keyCopied = signal(false);
    public adminCopied = signal(false);
    
    public claimPassword = '';
    public manualKey = '';
    
    public editingFingerprint = signal<string | null>(null);
    public editingLabel = signal('');
    public saveToBook = signal(true);

    public invoiceLoading = signal(false);
    public paymentRequest = signal<string | null>(null);

    readonly icons = { Shield, Users, CheckCircle, Loader2, Copy, Clock, ArrowRight, Hash, Crown, UploadCloud, DownloadCloud, Download, ExternalLink, Check, Zap, AlertTriangle, Power, X, Key, RefreshCw, AlertOctagon, FileKey, FileCheck, Edit2, Tag, Lock, Unlock, Bell, Infinity, ArrowDown, Book };

    constructor(
        private route: ActivatedRoute,
        public socket: SocketService,
        private router: Router,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        effect(() => {
            if (!isPlatformBrowser(this.platformId)) return;
            const state = this.socket.roomState();

            if (this.socket.isLockedOut() || this.socket.roomNotFound() || this.socket.decryptionError() || this.socket.isRoomFull()) { 
                this.showUnlockModal.set(false); 
                return; 
            }
            
            if (state) {
                if (state.tier === 'enterprise' && !state.isPaid) {
                    this.showUnlockModal.set(true);
                    this.initiateUnlockInvoice();
                } else {
                    this.showUnlockModal.set(false);
                }
                
                if (state.createdAt) this.startTimer(state.expiresAt);
            }

            if (this.socket.isClosed() && state?.tier === 'enterprise') {
                this.generateAuditLog(); 
            }
        });

        effect(() => {
            if (this.socket.isCoordinator()) {
                const _ = this.socket.signers(); 
                this.socket.checkAndApplyLocalLabels();
            }
        });
    }

    ngOnInit() {
        if (isPlatformBrowser(this.platformId)) {
            combineLatest([this.route.paramMap, this.route.fragment]).subscribe(([params, fragment]) => {
                const id = params.get('id');
                if (id && (this.roomId() !== id || this.socket.status() === 'disconnected')) {
                    this.roomId.set(id);
                    this.socket.disconnect(false); 
                    this.socket.connect(id, fragment);
                    
                    if (!fragment) this.socket.decryptionError.set("Decryption Key Missing");
                    
                    this.finalHex.set(null);
                    this.isExpired.set(false); 
                }
            });
        }
    }

    ngOnDestroy() {
        if (isPlatformBrowser(this.platformId)) {
            this.socket.disconnect(true); 
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
            this.socket.claimCoordinator(this.claimPassword);
            this.showClaimInput.set(false);
            this.claimPassword = '';
        }
    }

    closeRoom() {
        this.openConfirm(
            'Close Room',
            'Are you sure you want to close this room? This action cannot be undone and will delete all data immediately.',
            () => {
                this.socket.closeRoom();
                this.router.navigate(['/']); 
            },
            true 
        );
    }

    renameRoom() {
        const current = this.socket.roomState()?.roomName;
        // Prompt is acceptable for renaming as it's a simple text input, 
        // but could be modalized if desired. Keeping simple for now.
        const newName = prompt("Enter a name:", current);
        if (newName?.trim()) this.socket.renameRoom(newName.trim());
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
        
        if (fp && label) {
            this.socket.updateSignerLabel(fp, label);
            if (this.saveToBook()) {
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

    // -------------------------------------------------------------------------
    // Actions: Finalization
    // -------------------------------------------------------------------------

    finalize() {
        if (this.isExpired()) return;
        const state = this.socket.roomState();
        
        const doFinalize = () => {
            const hex = this.socket.getFinalTxHex();
            if (hex) {
                this.finalHex.set(hex);
                this.socket.logAction('Tx Finalized', 'Signatures merged successfully');
                this.triggerConfetti();
            }
        };

        if (state?.tier === 'enterprise' && state.whitelist?.length > 0) {
             const outputs = this.socket.txDetails()?.outputs || [];
             const unverified = outputs.filter(out => !state.whitelist.includes(out.address));
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
            const net = this.socket.roomState()?.network || 'bitcoin';
            const baseUrl = net === 'bitcoin' ? 'https://mempool.space' : net === 'testnet' ? 'https://mempool.space/testnet' : 'https://mempool.space/signet';
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
    // Actions: Payments & Keys
    // -------------------------------------------------------------------------

    async openExtendModal() {
        this.showPaymentModal.set(true);
        this.invoiceLoading.set(true);
        try {
            const res: any = await this.socket.createTimeExtensionInvoice(5000); 
            this.paymentRequest.set(res.payment_request);
            this.invoiceLoading.set(false);
            const paid = await this.socket.waitForPayment(this.roomId()!, res.payment_hash);
            if (paid) {
                this.showPaymentModal.set(false);
                this.paymentRequest.set(null);
                this.triggerConfetti();
            }
        } catch (e) {
            console.error("Failed to get invoice", e);
            this.showPaymentModal.set(false);
            this.openAlert("Error", "Could not generate invoice. Is the backend running?");
        } finally {
            this.invoiceLoading.set(false);
        }
    }

    async initiateUnlockInvoice() {
        if (this.paymentRequest() || this.invoiceLoading()) return; 
        
        this.invoiceLoading.set(true);
        try {
            const res: any = await this.socket.createInvoice(21000, "Unlock Enterprise Room"); 
            this.paymentRequest.set(res.payment_request);
            this.invoiceLoading.set(false); 
            
            const paid = await this.socket.waitForUnlock(this.roomId()!, res.payment_hash);
            if (paid) this.triggerConfetti();
        } catch (e) { 
            console.error(e); 
            this.invoiceLoading.set(false); 
        } 
    }

    submitKey() {
        if (!this.manualKey) return;
        let key = this.manualKey.trim();
        if (key.includes('#')) key = key.split('#')[1];
        this.socket.disconnect(false);
        this.socket.connect(this.roomId()!, key);
        this.manualKey = '';
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    generateAuditLog() {
        const state = this.socket.roomState();
        if (!state) return;

        const doc = new jsPDF();
        let y = 20;

        // 1. Header
        doc.setFont('helvetica', 'bold'); 
        doc.setFontSize(24);
        doc.setTextColor(16, 185, 129); // Emerald Green
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
        y += 15;

        // 2. Filename Construction
        const dateStr = new Date().toISOString().split('T')[0];
        const shortId = state.roomId.slice(0, 8);
        
        let txSuffix = "Pending";
        let partialHexDisplay = "Not yet finalized";
        
        const finalHex = this.finalHex();
        if (finalHex) {
            txSuffix = `${finalHex.slice(0,6)}...${finalHex.slice(-6)}`;
            partialHexDisplay = `${finalHex.slice(0, 32)}...[${finalHex.length} bytes]...${finalHex.slice(-32)}`;
        }

        const filename = `SigningRoom_Audit_${dateStr}_Room-${shortId}_Tx-${txSuffix}.pdf`;

        // 3. Room Metadata
        doc.setFontSize(10);
        doc.setTextColor(100);
        
        doc.text(`Room: ${state.roomName}`, 20, y); y += 6;
        doc.text(`Room ID: ${state.roomId}`, 20, y); y += 6;
        // NEW: Network Field
        doc.text(`Network: ${state.network.toUpperCase()}`, 20, y); y += 6;
        doc.text(`Created: ${new Date(state.createdAt).toLocaleString()}`, 20, y); y += 6;
        doc.text(`Room Type: ${state.tier === 'enterprise' ? 'Boardroom' : 'Standard'}`, 20, y); y += 15;

        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text("Governance & Security", 20, y); y += 8;
        doc.setFont('helvetica', 'normal');

        // Lock Status
        doc.setFontSize(10);
        doc.setTextColor(50);
        const lockStatus = state.isLocked ? "LOCKED (Secure)" : "UNLOCKED (Open)";
        doc.text(`Room Status: ${lockStatus}`, 20, y); y += 6;

        // Whitelist Status
        const whitelistCount = state.whitelist?.length || 0;
        doc.text(`Whitelist Enforcement: ${whitelistCount > 0 ? 'Active' : 'Disabled'}`, 20, y); y += 10;

        // ---------------------------------------------------------
        // 3.5 INPUT VERIFICATION TABLE
        // ---------------------------------------------------------
        doc.setFontSize(12);
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
        }

        inputs.forEach((inpt, i) => {
            const isWhitelisted = whitelist.includes(inpt.address);
            const amount = (inpt.amount / 100000000).toFixed(8);

            if (y > 270) { doc.addPage(); y = 20; }

            // Line 1: Index & Address
            doc.setFontSize(8); 
            doc.setTextColor(50);
            doc.setFont('courier', 'normal');
            doc.text(`${i + 1}. ${inpt.address}`, 20, y);
            y += 4; 

            // Line 2: Amount & Status
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(0);
            doc.text(`${amount} BTC`, 25, y); 

            if (whitelist.length === 0) {
                 doc.setTextColor(100); 
                 doc.text("NO WHITELIST", 150, y);
            } else if (isWhitelisted) {
                 doc.setTextColor(16, 185, 129); // Green
                 doc.text("VERIFIED SOURCE", 150, y);
            } else {
                 doc.setTextColor(220, 38, 38); // Red
                 doc.text("UNVERIFIED", 150, y);
            }
            
            y += 8; // Spacing
        });
        
        y += 5; 

        // ---------------------------------------------------------
        // 4. OUTPUT VERIFICATION TABLE
        // ---------------------------------------------------------
        doc.setFontSize(12);
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
        }

        outputs.forEach((out, i) => {
            const isWhitelisted = whitelist.includes(out.address);
            const amount = (out.amount / 100000000).toFixed(8);
            
            if (y > 270) { doc.addPage(); y = 20; }

            // Line 1: Index & Address (MATCHING INPUT STYLE)
            doc.setFontSize(8);
            doc.setTextColor(50);
            doc.setFont('courier', 'normal');
            doc.text(`${i + 1}. ${out.address}`, 20, y);
            y += 4; // Move down

            // Line 2: Amount
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(0);
            doc.text(`${amount} BTC`, 25, y);

            // C. Status Label
            if (whitelist.length === 0) {
                doc.setTextColor(100); 
                doc.text("NO WHITELIST", 150, y);
            } else if (isWhitelisted) {
                doc.setTextColor(16, 185, 129); 
                doc.text("VERIFIED DESTINATION", 150, y); // Changed text slightly to be specific
            } else {
                doc.setTextColor(220, 38, 38); 
                doc.text("UNVERIFIED", 150, y);
            }
            
            y += 8; // Spacing matching Inputs
        });

        doc.setDrawColor(200);
        doc.line(20, y, 190, y); y += 8;
        
        doc.setFont('helvetica', 'normal'); 
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Total Outputs: ${outputs.length}`, 20, y); y += 15;
        // ---------------------------------------------------------

        // 5. Signer Table
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("Signer Activity", 20, y); y += 10;
        
        doc.setFontSize(10);
        const signers = this.socket.signers();
        signers.forEach((s, i) => {
            const status = s.signed ? "SIGNED" : "PENDING";
            
            const label = state.signerLabels?.[s.fingerprint];
            const displayName = label ? `${label} (${s.fingerprint})` : s.fingerprint;

            doc.text(`${i+1}. ${displayName}`, 20, y);
            doc.text(status, 150, y);
            y += 6;
        });
        y += 10;

        // ---------------------------------------------------------
        // 6. Transaction Data (UPDATED)
        // ---------------------------------------------------------
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text("Transaction Data", 20, y); y += 8;
        
        // A. Transaction ID (The most important part)
        const txId = this.socket.getFinalTxId();
        if (txId) {
            doc.setFontSize(10);
            doc.setTextColor(50);
            doc.setFont('helvetica', 'bold');
            doc.text("Transaction ID (TXID):", 20, y); y += 5;
            
            doc.setFont('courier', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(0);
            doc.text(txId, 20, y); y += 8;
            
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
        // Break long hex string if needed, though here we use the partial display
        doc.text(partialHexDisplay, 20, y, { maxWidth: 170 });
        doc.setFont('helvetica', 'normal'); 
        y += 15;

        // 7. Detailed Event Log
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("Event Timeline", 20, y); y += 10;
        
        doc.setFontSize(9);
        const logs = state.auditLog || [];
        
        logs.forEach((log) => {
            if (y > 270) { doc.addPage(); y = 20; } 
            
            const time = new Date(log.timestamp).toLocaleTimeString();
            const date = new Date(log.timestamp).toLocaleDateString();
            
            doc.setTextColor(120);
            doc.text(`${date} ${time}`, 20, y);
            
            doc.setTextColor(0);
            doc.setFont('helvetica', 'bold');
            doc.text(log.event, 65, y);
            
            doc.setFont('helvetica', 'normal');
            doc.text(log.user, 110, y);
            
            if (log.detail) {
                doc.setTextColor(100);
                const detailText = log.detail.length > 30 ? log.detail.substring(0, 27) + '...' : log.detail;
                doc.text(detailText, 150, y);
            }
            y += 7;
        });

        // 8. Footer
        if (this.finalHex()) {
            y += 10;
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Final Tx Hash (SHA256 of Hex): Verified`, 20, y);
        }

        doc.save(filename);
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

    copyKey() { this.doCopy(this.route.snapshot.fragment || '', this.keyCopied); }
    copyInvite() { this.doCopy(window.location.href, this.inviteCopied); }
    copyInvoice() { this.doCopy(this.paymentRequest() || '', null); }
    copyHex() { this.doCopy(this.finalHex() || '', this.copied); }
    copyAdminToken() { 
        const t = sessionStorage.getItem(`admin_token_${this.roomId()}`);
        if(t) this.doCopy(t, this.adminCopied);
    }

    private doCopy(text: string, signalToToggle: any) {
        navigator.clipboard.writeText(text);
        if (signalToToggle) {
            signalToToggle.set(true);
            setTimeout(() => signalToToggle.set(false), 2000);
        }
    }

    nudgeSigner(fingerprint: string) {
        const label = this.getSignerLabel(fingerprint); 
        const msg = `Signature needed from: ${label}\n${window.location.href}`;
        navigator.clipboard.writeText(msg).then(() => {
            this.openAlert('Nudge Message Copied', `Nudge message for ${label} copied! Paste it in your chat app.`);
        });
        this.socket.logAction('Nudge Sent', `Reminder sent to ${label}`);
    }
}
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

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SocketService } from '../../services/socket/socket.service'; 
import { 
  LucideAngularModule, 
  Zap, 
  Users, 
  Shield, 
  Terminal, 
  ChevronRight, 
  Lock,
  Github,
  Code2,
  Eye,
  Trash2,
  UploadCloud,
  Share2,
  FileCheck,
  HelpCircle,
  Twitter,
  Heart,
  Briefcase,
  Landmark,
  Globe,
  XCircle,       
  CheckCircle2,  
  Clock,         
  AlertTriangle,
  Network,
  ArrowRight,
  FileKey,
  Cpu,
  Fingerprint,
  Crown,
  Infinity,
  Check,
  Maximize
} from 'lucide-angular';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  template: `
    <div class="max-w-6xl mx-auto text-center pt-24 px-6 relative">
       
       <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none"></div>

       <a href="https://github.com/scarlin90/SigningRoom" target="_blank" class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 backdrop-blur-md border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition mb-8 cursor-pointer group relative z-10">
        <lucide-icon [img]="Code2" class="w-3 h-3 text-emerald-400"></lucide-icon>
        <span class="text-xs font-medium">Open Source (AGPL v3) &bull; Verify the code</span>
        <lucide-icon [img]="ChevronRight" class="w-3 h-3 group-hover:translate-x-0.5 transition-transform"></lucide-icon>
      </a>

      <h1 class="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-tight relative z-10">
        The Real-Time <br />
        <span class="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Bitcoin Multisig Coordinator</span>
      </h1>

      <p class="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed relative z-10">
        Stop emailing PSBT files. Coordinate Bitcoin multisig teams instantly.
        <br class="hidden md:block" />
        <span class="text-slate-200 font-semibold">No accounts ~ </span> 
        <span class="text-slate-200 font-semibold">No database ~ </span> 
        <span class="text-slate-200 font-semibold">End-to-End Encrypted</span>
      </p>

      <div class="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
        <a routerLink="/create" class="px-8 py-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer w-full sm:w-auto justify-center hover:scale-105 transform duration-200">
          Start Signing
          <lucide-icon [img]="Zap" class="w-5 h-5 fill-slate-950"></lucide-icon>
        </a>
        
        <a href="https://github.com/scarlin90/SigningRoom" target="_blank" class="px-8 py-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-all flex items-center gap-2 border border-slate-700 w-full sm:w-auto justify-center">
          <lucide-icon [img]="Github" class="w-5 h-5"></lucide-icon>
          View Source
        </a>
      </div>
    </div>

    <div class="max-w-5xl mx-auto mt-16 px-6 relative z-10 animate-fade-in-up">
        
        <div #demoContainer class="rounded-2xl overflow-hidden border border-slate-800 shadow-2xl shadow-emerald-500/10 bg-slate-900/50 backdrop-blur-sm relative group">
            
            <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none z-10"></div>
            
            <img src="assets/multisig-demo.gif" alt="Real-time Multisig Signing Demo" class="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition duration-700">
            
            <button (click)="toggleFullscreen(demoContainer)" class="absolute top-4 right-4 z-30 p-2 rounded-lg bg-slate-900/50 hover:bg-emerald-500 hover:text-slate-950 border border-slate-700 hover:border-emerald-400 text-slate-300 transition-all opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 duration-300">
                <lucide-icon [img]="Maximize" class="w-5 h-5"></lucide-icon>
            </button>

            <div class="absolute bottom-6 left-6 z-20 flex items-center gap-3">
                <div class="px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-slate-700 text-xs text-white font-mono flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    Live Preview
                </div>
                <div class="px-3 py-1.5 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30 text-xs text-emerald-400 font-mono font-bold">
                    3-of-5 Multisig
                </div>
            </div>
        </div>
    </div>

    <div class="max-w-5xl mx-auto mt-24 px-6 relative z-10">
        <div class="text-center mb-12">
            <h2 class="text-3xl font-bold text-white mb-4">Built for Organizational Resilience</h2>
            <p class="text-slate-400 max-w-2xl mx-auto">
                Single-signature wallets are a liability for teams. 
                <br>Multisig ensures no single person—not even the CEO—is a single point of failure.
            </p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
            <div class="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl hover:bg-slate-900/60 transition group">
                <div class="w-12 h-12 bg-indigo-950/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <lucide-icon [img]="Users" class="w-6 h-6 text-indigo-400"></lucide-icon>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">Flexible "M-of-N" Consensus</h3>
                <p class="text-sm text-slate-400 leading-relaxed">
                    Don't be locked into a rigid structure. Whether you need a <strong>2-of-3</strong> for founders or a <strong>3-of-5</strong> for the board, you define the quorum required to authorize funds.
                </p>
            </div>

            <div class="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl hover:bg-slate-900/60 transition group">
                <div class="w-12 h-12 bg-rose-950/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <lucide-icon [img]="AlertTriangle" class="w-6 h-6 text-rose-500"></lucide-icon>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">Mitigate "Key Person" Risk</h3>
                <p class="text-sm text-slate-400 leading-relaxed">
                    What if the CEO is in an accident or loses access to their keys? In a multisig setup, the remaining board members can still approve payroll, ensuring business continuity.
                </p>
            </div>

            <div class="bg-emerald-950/10 border border-emerald-500/30 p-6 rounded-2xl hover:bg-emerald-950/20 transition group relative overflow-hidden">
                <div class="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 blur-xl rounded-full"></div>
                <div class="w-12 h-12 bg-emerald-950/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <lucide-icon [img]="Zap" class="w-6 h-6 text-emerald-400"></lucide-icon>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">Security without the friction</h3>
                <p class="text-sm text-slate-300 leading-relaxed">
                    Historically, coordinating a board vote on-chain was slow and painful. SigningRoom fixes this. We combine the <strong>governance</strong> of multisig with the <strong>speed</strong> of a real-time chat room.
                </p>
            </div>
        </div>
    </div>

    <div class="max-w-4xl mx-auto mt-24 px-6 relative z-10">
        <div class="text-center mb-10">
            <h2 class="text-3xl font-bold text-white mb-2">Why change your workflow?</h2>
            <p class="text-slate-400">Manual file merging is error-prone and slow. There is a better way.</p>
        </div>

        <div class="grid md:grid-cols-2 gap-8">
            <div class="p-8 rounded-2xl bg-slate-900/30 border border-red-900/20 relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500/0 via-red-500/50 to-red-500/0"></div>
                <h3 class="text-lg font-bold text-slate-300 mb-6 flex items-center gap-2">
                    <lucide-icon [img]="AlertTriangle" class="w-5 h-5 text-red-400"></lucide-icon>
                    The Old Way (Email/Slack)
                </h3>
                <ul class="space-y-4">
                    <li class="flex items-start gap-3 text-sm text-slate-400">
                        <lucide-icon [img]="XCircle" class="w-5 h-5 text-red-500 shrink-0"></lucide-icon>
                        <span>Manually merging 5 different email attachments.</span>
                    </li>
                    <li class="flex items-start gap-3 text-sm text-slate-400">
                        <lucide-icon [img]="XCircle" class="w-5 h-5 text-red-500 shrink-0"></lucide-icon>
                        <span>Files stored permanently on Slack/Google servers.</span>
                    </li>
                    <li class="flex items-start gap-3 text-sm text-slate-400">
                        <lucide-icon [img]="XCircle" class="w-5 h-5 text-red-500 shrink-0"></lucide-icon>
                        <span>Slow, asynchronous delays between signers.</span>
                    </li>
                </ul>
            </div>

            <div class="p-8 rounded-2xl bg-emerald-900/10 border border-emerald-500/20 relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0"></div>
                <h3 class="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <lucide-icon [img]="Zap" class="w-5 h-5 text-emerald-400"></lucide-icon>
                    The SigningRoom Way
                </h3>
                <ul class="space-y-4">
                    <li class="flex items-start gap-3 text-sm text-slate-200">
                        <lucide-icon [img]="CheckCircle2" class="w-5 h-5 text-emerald-400 shrink-0"></lucide-icon>
                        <span>Real-time merging. Everyone sees the same state.</span>
                    </li>
                    <li class="flex items-start gap-3 text-sm text-slate-200">
                        <lucide-icon [img]="CheckCircle2" class="w-5 h-5 text-emerald-400 shrink-0"></lucide-icon>
                        <span>Data lives in RAM, encrypted, and vanishes on expiry.</span>
                    </li>
                    <li class="flex items-start gap-3 text-sm text-slate-200">
                        <lucide-icon [img]="CheckCircle2" class="w-5 h-5 text-emerald-400 shrink-0"></lucide-icon>
                        <span>Instant broadcast once signatures are collected.</span>
                    </li>
                </ul>
            </div>
        </div>
    </div>

    <div class="max-w-5xl mx-auto mt-24 px-6 relative z-10">
        <div class="text-center mb-12">
            <h2 class="text-3xl font-bold text-white mb-4">Orchestrated in Real-Time</h2>
            <p class="text-slate-400">The room acts as a blind coordinator, merging signatures as they arrive.</p>
        </div>

        <div class="grid md:grid-cols-3 gap-8 relative mb-24">
            <div class="hidden md:block absolute top-8 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-slate-800 via-emerald-900 to-slate-800 -z-10"></div>

            <div class="text-center relative">
                <div class="w-16 h-16 mx-auto bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mb-6 shadow-xl relative z-10">
                    <lucide-icon [img]="UploadCloud" class="w-8 h-8 text-emerald-400"></lucide-icon>
                    <div class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-bold flex items-center justify-center">1</div>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">Upload PSBT</h3>
                <p class="text-slate-400 text-sm">Export from Sparrow/Electrum. We encrypt it locally.</p>
            </div>

            <div class="text-center relative">
                <div class="w-16 h-16 mx-auto bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mb-6 shadow-xl relative z-10">
                    <lucide-icon [img]="Share2" class="w-8 h-8 text-cyan-400"></lucide-icon>
                    <div class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-bold flex items-center justify-center">2</div>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">Share Link</h3>
                <p class="text-slate-400 text-sm">Send the secure link. The key is in the URL fragment.</p>
            </div>

            <div class="text-center relative">
                <div class="w-16 h-16 mx-auto bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mb-6 shadow-xl relative z-10">
                    <lucide-icon [img]="FileCheck" class="w-8 h-8 text-emerald-400"></lucide-icon>
                    <div class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-bold flex items-center justify-center">3</div>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">Sign & Merge</h3>
                <p class="text-slate-400 text-sm">Signatures are merged automatically. Broadcast once required signatures are collected.</p>
            </div>
        </div>

        <div class="text-center mb-10">
            <h2 class="text-3xl font-bold text-white mb-2">The Blind Relay</h2>
            <p class="text-slate-400">We forward your encrypted packets. We never hold the keys.</p>
        </div>

        <div class="relative group">
            <div class="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-xl blur-lg opacity-50 group-hover:opacity-70 transition duration-1000"></div>
            <div class="relative rounded-xl bg-slate-950/80 backdrop-blur-xl border border-slate-800 shadow-2xl overflow-hidden p-8 md:p-12">
                <div class="flex flex-col md:flex-row items-center justify-between gap-8">
                    
                    <div class="flex flex-col items-center text-center">
                        <div class="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center border border-slate-700 mb-4">
                            <lucide-icon [img]="Users" class="w-8 h-8 text-emerald-400"></lucide-icon>
                        </div>
                        <div class="text-sm font-bold text-white">Client Side</div>
                        <div class="text-xs text-slate-500">Encrypts with Key</div>
                    </div>

                    <div class="flex flex-col items-center gap-2 flex-1">
                        <div class="w-full h-0.5 bg-slate-800 relative">
                            <div class="absolute inset-0 bg-emerald-500/50 w-1/2 animate-pulse"></div>
                        </div>
                        <div class="px-3 py-1 bg-slate-900 rounded border border-slate-800 text-[10px] text-emerald-400 font-mono flex items-center gap-2">
                            <lucide-icon [img]="Lock" class="w-3 h-3"></lucide-icon> AES-256-GCM
                        </div>
                    </div>

                    <div class="flex flex-col items-center text-center">
                        <div class="w-20 h-20 bg-slate-900 rounded-xl flex items-center justify-center border border-slate-700 mb-4 relative">
                            <lucide-icon [img]="Network" class="w-10 h-10 text-slate-600"></lucide-icon>
                            <div class="absolute -top-3 -right-3 bg-rose-500/20 text-rose-400 text-[10px] px-2 py-0.5 rounded border border-rose-500/30">BLIND</div>
                        </div>
                        <div class="text-sm font-bold text-white">The Room (Server)</div>
                        <div class="text-xs text-slate-500">Stores Encrypted Blob</div>
                    </div>

                    <div class="flex flex-col items-center gap-2 flex-1">
                        <div class="w-full h-0.5 bg-slate-800 relative">
                            <div class="absolute right-0 top-0 bottom-0 bg-emerald-500/50 w-1/2 animate-pulse"></div>
                        </div>
                         <div class="px-3 py-1 bg-slate-900 rounded border border-slate-800 text-[10px] text-cyan-400 font-mono flex items-center gap-2">
                            <lucide-icon [img]="FileKey" class="w-3 h-3"></lucide-icon> Sync State
                        </div>
                    </div>

                    <div class="flex flex-col items-center text-center">
                        <div class="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center border border-slate-700 mb-4">
                            <lucide-icon [img]="Users" class="w-8 h-8 text-cyan-400"></lucide-icon>
                        </div>
                        <div class="text-sm font-bold text-white">Peer Side</div>
                        <div class="text-xs text-slate-500">Decrypts via Secret Link</div>
                    </div>

                </div>
            </div>
        </div>

    </div>

    <div class="max-w-4xl mx-auto mt-24 px-6 relative z-10">
        <div class="text-center mb-10">
            <h2 class="text-3xl font-bold text-white mb-2">Technical Standards</h2>
            <p class="text-slate-400">Built on open Bitcoin protocols and industrial encryption.</p>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
             <div class="p-4 rounded-lg bg-slate-900/30 border border-slate-800">
                <lucide-icon [img]="Cpu" class="w-6 h-6 text-slate-500 mx-auto mb-2"></lucide-icon>
                <div class="text-xs text-slate-500 font-mono">BIP-174</div>
                <div class="text-sm font-bold text-slate-300">PSBT Native</div>
             </div>
             <div class="p-4 rounded-lg bg-slate-900/30 border border-slate-800">
                <lucide-icon [img]="Lock" class="w-6 h-6 text-slate-500 mx-auto mb-2"></lucide-icon>
                <div class="text-xs text-slate-500 font-mono">AES-GCM</div>
                <div class="text-sm font-bold text-slate-300">End-to-End Encrypted</div>
             </div>
             <div class="p-4 rounded-lg bg-slate-900/30 border border-slate-800">
                <lucide-icon [img]="Network" class="w-6 h-6 text-slate-500 mx-auto mb-2"></lucide-icon>
                <div class="text-xs text-slate-500 font-mono">WebSocket</div>
                <div class="text-sm font-bold text-slate-300">Real-time</div>
             </div>
             <div class="p-4 rounded-lg bg-slate-900/30 border border-slate-800">
                <lucide-icon [img]="Fingerprint" class="w-6 h-6 text-slate-500 mx-auto mb-2"></lucide-icon>
                <div class="text-xs text-slate-500 font-mono">Ephemeral</div>
                <div class="text-sm font-bold text-slate-300">No Logs</div>
             </div>
        </div>
    </div>

    <div class="max-w-4xl mx-auto mt-24 px-6 text-center relative z-10">
        <p class="text-slate-500 text-sm font-semibold uppercase tracking-widest mb-8">Trusted architecture for</p>
        <div class="flex flex-wrap justify-center gap-4">
            <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800">
                <lucide-icon [img]="Briefcase" class="w-4 h-4 text-emerald-400"></lucide-icon>
                <span class="text-slate-300 text-sm font-bold">Corporate Treasuries</span>
            </div>
            <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800">
                <lucide-icon [img]="Landmark" class="w-4 h-4 text-cyan-400"></lucide-icon>
                <span class="text-slate-300 text-sm font-bold">Investment Committees</span>
            </div>
            <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800">
                <lucide-icon [img]="Globe" class="w-4 h-4 text-amber-400"></lucide-icon>
                <span class="text-slate-300 text-sm font-bold">Remote Teams</span>
            </div>
        </div>
    </div>

    <div class="max-w-6xl mx-auto mt-32 px-6 relative z-10">
         <div class="text-center mb-16">
            <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Trust through Architecture</h2>
            <p class="text-slate-400 max-w-2xl mx-auto">
                We don't ask you to trust us. We built a system where we don't need to be trusted.
            </p>
        </div>

        <div class="grid md:grid-cols-3 gap-8 mb-20">
            @for (feature of features; track feature.title) {
                <div class="p-8 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/30 transition group">
                <div class="mb-6 p-4 bg-slate-950 rounded-xl w-fit border border-slate-800 group-hover:scale-110 transition-transform">
                    <lucide-icon [img]="feature.icon" class="w-8 h-8" [class]="feature.color"></lucide-icon>
                </div>
                <h3 class="text-xl font-bold text-white mb-3">{{ feature.title }}</h3>
                <p class="text-slate-400 leading-relaxed">
                    {{ feature.desc }}
                </p>
                </div>
            }
        </div>
    </div>

    <div class="max-w-4xl mx-auto mt-12 px-6 text-center relative z-10">
        <p class="text-slate-500 text-sm font-semibold uppercase tracking-widest mb-8">Compatible with your Hardware Wallets & Software</p>
        <div class="flex flex-wrap justify-center gap-4">
            <span class="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-sm font-bold">Sparrow</span>
            <span class="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-sm font-bold">Electrum</span>
            <span class="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-sm font-bold">Coldcard</span>
            <span class="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-sm font-bold">Trezor</span>
            <span class="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-sm font-bold">Ledger</span>
            <span class="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-sm font-bold">Nunchuk</span>
            <span class="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-sm font-bold">BitBox02</span>
        </div>
    </div>

    <div class="max-w-7xl mx-auto mt-32 px-6 relative z-10 mb-32">
        <div class="text-center mb-16">
            <h2 class="text-3xl font-bold text-white mb-4">Choose your Security Model</h2>
            <p class="text-slate-400">From private individuals to corporate treasuries.</p>
        </div>

        <div class="grid lg:grid-cols-3 gap-8 items-start">
            
            <div class="p-8 rounded-3xl bg-slate-900/30 border border-slate-800 flex flex-col relative group hover:border-slate-700 transition h-full">
                <div class="mb-6">
                    <div class="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 text-slate-400 group-hover:text-white transition">
                        <lucide-icon [img]="Zap" class="w-6 h-6"></lucide-icon>
                    </div>
                    <h3 class="text-2xl font-bold text-white mb-2">Standard Room</h3>
                    <p class="text-slate-400 text-sm leading-relaxed">
                        Perfect for hobbyists and friends coordinating small multisigs. No account needed.
                    </p>
                </div>
                
                <div class="mb-8">
                    <span class="text-4xl font-bold text-white">Free</span>
                    <span class="text-slate-500 text-sm ml-2">/ forever</span>
                </div>

                <ul class="space-y-4 mb-8 flex-grow">
                    <li class="flex items-center gap-3 text-sm text-slate-300">
                        <lucide-icon [img]="Check" class="w-4 h-4 text-slate-500"></lucide-icon> Up to 3 Signers
                    </li>
                    <li class="flex items-center gap-3 text-sm text-slate-300">
                        <lucide-icon [img]="Check" class="w-4 h-4 text-slate-500"></lucide-icon> 20 Minute Ephemeral Window
                    </li>
                    <li class="flex items-center gap-3 text-sm text-slate-300">
                        <lucide-icon [img]="Check" class="w-4 h-4 text-slate-500"></lucide-icon> Zero-Knowledge Encryption
                    </li>
                </ul>

                <a routerLink="/create" class="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 border border-slate-700">
                    Launch Room
                </a>
            </div>

            <div class="p-8 rounded-3xl bg-slate-900/80 border border-emerald-500/30 flex flex-col relative group hover:border-emerald-500/50 transition h-full shadow-2xl shadow-emerald-900/10">
                <div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-950 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Most Popular
                </div>

                <div class="mb-6">
                    <div class="w-12 h-12 bg-emerald-950/30 rounded-2xl flex items-center justify-center mb-6 text-emerald-400 border border-emerald-500/20">
                        <lucide-icon [img]="Shield" class="w-6 h-6"></lucide-icon>
                    </div>
                    <h3 class="text-2xl font-bold text-white mb-2">One-Off Boardroom</h3>
                    <p class="text-slate-400 text-sm leading-relaxed">
                        Single-use session for critical transactions requiring audit trails and full board participation.
                    </p>
                </div>
                
                <div class="mb-8">
                    <span class="text-4xl font-bold text-white">21k</span>
                    <span class="text-slate-500 text-sm ml-2">sats / session</span>
                </div>

                <ul class="space-y-4 mb-8 flex-grow">
                    <li class="flex items-center gap-3 text-sm text-white">
                        <lucide-icon [img]="Check" class="w-4 h-4 text-emerald-400"></lucide-icon> <strong>Cryptographic Audit Log</strong> (PDF)
                    </li>
                    <li class="flex items-center gap-3 text-sm text-slate-300">
                        <lucide-icon [img]="Check" class="w-4 h-4 text-emerald-400"></lucide-icon> Unlimited Signers (M-of-N)
                    </li>
                    <li class="flex items-center gap-3 text-sm text-slate-300">
                        <lucide-icon [img]="Check" class="w-4 h-4 text-emerald-400"></lucide-icon> 24-Hour Persistence
                    </li>
                </ul>

                <a routerLink="/create" class="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20">
                    Start Boardroom
                </a>
            </div>

            <div class="p-8 rounded-3xl bg-gradient-to-b from-amber-950/20 to-slate-900 border border-amber-500/30 flex flex-col relative group hover:border-amber-500/50 transition h-full">
                
                <div class="absolute top-0 right-0 left-0 bg-amber-500/10 border-b border-amber-500/20 p-2 text-center rounded-t-3xl">
                    <div class="text-amber-400 text-[10px] font-bold tracking-widest uppercase mb-0.5">Genesis Keys Remaining</div>
                    <div class="text-xl font-black text-amber-500 tabular-nums">
                        {{ genesisStock() }} <span class="text-xs font-normal text-amber-200/50">/ 21</span>
                    </div>
                </div>

                <div class="mb-6 mt-10">
                    <div class="w-12 h-12 bg-amber-950/30 rounded-2xl flex items-center justify-center mb-6 text-amber-400 border border-amber-500/20">
                        <lucide-icon [img]="Crown" class="w-6 h-6"></lucide-icon>
                    </div>
                    <h3 class="text-2xl font-bold text-white mb-2">Licensed</h3>
                    <p class="text-slate-400 text-sm leading-relaxed">
                        For organizations and power users who need on-demand infrastructure.
                    </p>
                </div>
                
                <div class="mb-8">
                    <div class="flex items-baseline gap-2">
                        <span class="text-4xl font-bold text-white">300k</span>
                        <span class="text-slate-500 text-sm">sats / year</span>
                    </div>
                    <div class="text-xs text-amber-500 font-bold mt-1">
                        or 2.1M sats Lifetime (Genesis)
                    </div>
                </div>

                <ul class="space-y-4 mb-8 flex-grow">
                    <li class="flex items-center gap-3 text-sm text-slate-300">
                        <lucide-icon [img]="Infinity" class="w-4 h-4 text-amber-400"></lucide-icon> <strong>Unlimited</strong> Boardrooms
                    </li>
                    <li class="flex items-center gap-3 text-sm text-slate-300">
                        <lucide-icon [img]="Check" class="w-4 h-4 text-amber-400"></lucide-icon> Annual Subscription
                    </li>
                    <li class="flex items-center gap-3 text-sm text-slate-300">
                        <lucide-icon [img]="Check" class="w-4 h-4 text-amber-400"></lucide-icon> Lifetime Option Available
                    </li>
                </ul>

                <a routerLink="/create" class="w-full py-4 bg-slate-800 hover:bg-amber-950/30 text-amber-400 border border-amber-500/30 hover:border-amber-500/60 font-bold rounded-xl transition flex items-center justify-center gap-2">
                    Get License
                </a>
            </div>

        </div>
    </div>

    <div class="max-w-3xl mx-auto mt-20 mb-20 px-6 relative z-10">
      <h2 class="text-2xl font-bold text-white mb-8 text-center">Frequently Asked Questions</h2>
      <div class="space-y-4">
        
        <div class="p-6 bg-slate-900/50 rounded-xl border border-slate-800 hover:bg-slate-900 transition">
          <h3 class="font-bold text-white mb-2 flex items-center gap-2">
            <lucide-icon [img]="HelpCircle" class="w-4 h-4 text-emerald-400"></lucide-icon>
            Where is my private key?
          </h3>
          <p class="text-slate-400 text-sm leading-relaxed">
            It stays on your hardware wallet or signing device. You only upload a 
            <span class="text-slate-300">PSBT (Partially Signed Bitcoin Transaction)</span>, 
            which contains no private keys, only public data and signatures.
          </p>
        </div>

        <div class="p-6 bg-slate-900/50 rounded-xl border border-slate-800 hover:bg-slate-900 transition">
          <h3 class="font-bold text-white mb-2 flex items-center gap-2">
            <lucide-icon [img]="HelpCircle" class="w-4 h-4 text-emerald-400"></lucide-icon>
            Can you see my transaction details?
          </h3>
          <p class="text-slate-400 text-sm leading-relaxed">
            No. Your transaction is encrypted in your browser using a key that is contained in the URL link hash (fragment). 
            This key is never sent to our servers, so we literally cannot decrypt your data.
          </p>
        </div>

        <div class="p-6 bg-slate-900/50 rounded-xl border border-slate-800 hover:bg-slate-900 transition">
          <h3 class="font-bold text-white mb-2 flex items-center gap-2">
            <lucide-icon [img]="HelpCircle" class="w-4 h-4 text-emerald-400"></lucide-icon>
            Is it really free?
          </h3>
          <div class="text-slate-400 text-sm leading-relaxed">
            <p class="mb-2">
              <strong class="text-slate-200">Yes, for standard use.</strong> Basic rooms (max 3 signers, 20 minutes) are free forever.
            </p>
            <ul class="list-disc pl-4 space-y-1">
                <li>Need more time? Extend any room for <span class="text-emerald-400">5,000 sats</span>.</li>
                <li>Need a pro room? Get a 24-hour Boardroom with unlimited signers for <span class="text-emerald-400">21,000 sats</span>.</li>
                <li>Team? Grab an annual Corporate License above.</li>
            </ul>
          </div>
        </div>

      </div>
    </div>

    <div class="border-t border-slate-800 bg-slate-900/50 py-20 text-center px-6 relative z-10">
        <h2 class="text-3xl font-bold text-white mb-6">Ready to coordinate?</h2>
        <p class="text-slate-400 mb-8 max-w-lg mx-auto">
            No accounts required. Just upload a PSBT and share the secure link.
        </p>
        <a routerLink="/create" class="inline-flex px-8 py-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer">
          Start New Signing
          <lucide-icon [img]="ChevronRight" class="w-5 h-5"></lucide-icon>
        </a>
    </div>
  `
})
export class HomeComponent implements OnInit {
  readonly Zap = Zap;
  readonly Users = Users;
  readonly Shield = Shield;
  readonly Terminal = Terminal;
  readonly ChevronRight = ChevronRight;
  readonly Lock = Lock;
  readonly Github = Github;
  readonly Code2 = Code2;
  readonly Eye = Eye;
  readonly Trash2 = Trash2;
  readonly UploadCloud = UploadCloud;
  readonly Share2 = Share2;
  readonly FileCheck = FileCheck;
  readonly HelpCircle = HelpCircle;
  readonly Twitter = Twitter;
  readonly Heart = Heart;
  readonly Briefcase = Briefcase;
  readonly Landmark = Landmark;
  readonly Globe = Globe;
  readonly XCircle = XCircle;
  readonly CheckCircle2 = CheckCircle2;
  readonly AlertTriangle = AlertTriangle;
  readonly Network = Network;
  readonly ArrowRight = ArrowRight;
  readonly FileKey = FileKey;
  readonly Cpu = Cpu;
  readonly Fingerprint = Fingerprint;
  readonly Crown = Crown;
  readonly Infinity = Infinity;
  readonly Check = Check;
  readonly Maximize = Maximize;

  socket = inject(SocketService);
  genesisStock = signal(21);

  features = [
    {
      title: "Zero Knowledge",
      desc: "Encryption happens in your browser before data leaves. The backend only sees encrypted blobs and cannot read your transaction details.",
      icon: Eye, 
      color: "text-emerald-400"
    },
    {
      title: "No Database",
      desc: "Rooms exist only in RAM. There is no persistent database. Once the session expires, the data is gone forever.",
      icon: Trash2,
      color: "text-rose-400"
    },
    {
      title: "Verifiable Code",
      desc: "The client is open source (GPL v3). You can inspect the cryptography code yourself or build the app locally to verify our claims.",
      icon: Code2,
      color: "text-cyan-400"
    }
  ];

  ngOnInit() {
    this.fetchStock();
  }

  async fetchStock() {
    try {
        const res = await firstValueFrom(this.socket.getGenesisStock());
        this.genesisStock.set(res.remaining);
    } catch (e) { console.error("Failed to fetch stock", e); }
  }

  toggleFullscreen(element: HTMLElement) {
    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(err => {
        console.error(`Error enabling fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }
}
/*
 * Copyright (C) 2025 Sean Carlin
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { 
  LucideAngularModule, Zap, Users, Shield, ChevronRight, Lock, Github, Code2,
  Eye, Trash2, UploadCloud, Share2, FileCheck, HelpCircle, Maximize,
  Server, Network, Key, Cpu, Fingerprint, Globe, AlertTriangle
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
        The Blind <br />
        <span class="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Bitcoin Relay</span>
      </h1>

      <p class="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed relative z-10">
        A stateless coordination layer for Bitcoin multisig.
        <br class="hidden md:block" />
        <span class="text-slate-200 font-semibold">Client-Side Encryption.</span> 
        <span class="text-slate-200 font-semibold">Ephemeral RAM.</span> 
        <span class="text-slate-200 font-semibold">Zero Logs.</span>
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
        </div>
    </div>

    <div class="max-w-6xl mx-auto mt-24 px-6 relative z-10">
        <div class="grid md:grid-cols-3 gap-6">
            <div class="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl hover:bg-slate-900/60 transition group">
                <div class="w-12 h-12 bg-emerald-950/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <lucide-icon [img]="Eye" class="w-6 h-6 text-emerald-400"></lucide-icon>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">Blind Relay</h3>
                <p class="text-sm text-slate-400 leading-relaxed">The server is blind. It relays encrypted blobs between peers without ever seeing the PSBT content or xpubs.</p>
            </div>
            <div class="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl hover:bg-slate-900/60 transition group">
                <div class="w-12 h-12 bg-rose-950/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <lucide-icon [img]="Trash2" class="w-6 h-6 text-rose-500"></lucide-icon>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">No Database</h3>
                <p class="text-sm text-slate-400 leading-relaxed">Rooms exist only in RAM (Cloudflare Durable Objects). Once the session expires, data is wiped instantly.</p>
            </div>
            <div class="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl hover:bg-slate-900/60 transition group">
                <div class="w-12 h-12 bg-cyan-950/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <lucide-icon [img]="Code2" class="w-6 h-6 text-cyan-400"></lucide-icon>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">Verifiable</h3>
                <p class="text-sm text-slate-400 leading-relaxed">The code is AGPLv3. You can verify that the encryption happens client-side before any data leaves your browser.</p>
            </div>
        </div>
    </div>

    <div class="max-w-6xl mx-auto mt-32 px-6 relative z-10">
        <h2 class="text-3xl font-bold text-white mb-12 text-center">Why use a Stateless Room?</h2>
        
        <div class="grid md:grid-cols-3 gap-8">
            <div class="p-8 bg-slate-900 border border-slate-800 rounded-2xl relative group hover:border-emerald-500/30 transition">
                <div class="w-14 h-14 bg-slate-800 rounded-xl flex items-center justify-center mb-6 group-hover:bg-slate-700 transition">
                    <lucide-icon [img]="Cpu" class="w-7 h-7 text-emerald-400"></lucide-icon>
                </div>
                <h3 class="text-xl font-bold text-white mb-3">Device Coordination</h3>
                <p class="text-slate-400 text-sm leading-relaxed">
                    Easily pass PSBTs between different hardware devices (Coldcard, Trezor, Ledger) without shuffling SD cards or USB cables.
                </p>
            </div>

            <div class="p-8 bg-slate-900 border border-slate-800 rounded-2xl relative group hover:border-cyan-500/30 transition">
                <div class="w-14 h-14 bg-slate-800 rounded-xl flex items-center justify-center mb-6 group-hover:bg-slate-700 transition">
                    <lucide-icon [img]="Globe" class="w-7 h-7 text-cyan-400"></lucide-icon>
                </div>
                <h3 class="text-xl font-bold text-white mb-3">Remote Signing</h3>
                <p class="text-slate-400 text-sm leading-relaxed">
                    Collaborate on transactions with other signers in different physical locations in real-time. No accounts required.
                </p>
            </div>

            <div class="p-8 bg-slate-900 border border-slate-800 rounded-2xl relative group hover:border-purple-500/30 transition">
                <div class="w-14 h-14 bg-slate-800 rounded-xl flex items-center justify-center mb-6 group-hover:bg-slate-700 transition">
                    <lucide-icon [img]="Fingerprint" class="w-7 h-7 text-purple-400"></lucide-icon>
                </div>
                <h3 class="text-xl font-bold text-white mb-3">Metadata Protection</h3>
                <p class="text-slate-400 text-sm leading-relaxed">
                    Because the room is encrypted client-side, the relay cannot see your XPUBs or transaction details, preserving your network privacy.
                </p>
            </div>
        </div>
    </div>

    
    <div class="max-w-5xl mx-auto mt-32 px-6 relative z-10">
        <div class="text-center mb-16">
            <h2 class="text-3xl font-bold text-white mb-4">Trust No One</h2>
            <p class="text-slate-400">How Signing Room protects your data.</p>
        </div>

        <div class="grid md:grid-cols-3 gap-4 items-center justify-center text-center font-mono text-xs">
            
            <div class="p-6 bg-slate-950 border border-slate-800 rounded-xl relative group hover:border-emerald-500/50 transition">
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900 px-2 text-slate-500">Browser A</div>
                <div class="mb-4 text-emerald-400"><lucide-icon [img]="Lock" class="w-8 h-8 mx-auto"></lucide-icon></div>
                <div class="bg-slate-900 p-2 rounded mb-2">PSBT</div>
                <div class="text-slate-500">Encrypts with Key (URL Fragment)</div>
                <div class="mt-4 text-emerald-500">Sends Encrypted Blob -></div>
            </div>

            <div class="p-6 bg-slate-900/50 border border-slate-700 border-dashed rounded-xl relative opacity-70">
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900 px-2 text-slate-400">SigningRoom.io</div>
                <div class="mb-4 text-slate-600"><lucide-icon [img]="Server" class="w-8 h-8 mx-auto"></lucide-icon></div>
                <div class="bg-slate-800 p-2 rounded mb-2 text-slate-500">Blob (???)</div>
                <div class="text-slate-600">"I can't read this."</div>
                <div class="mt-4 text-slate-500">-> Relays Blob -></div>
            </div>

            <div class="p-6 bg-slate-950 border border-slate-800 rounded-xl relative group hover:border-emerald-500/50 transition">
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900 px-2 text-slate-500">Browser B</div>
                <div class="mb-4 text-emerald-400"><lucide-icon [img]="Lock" class="w-8 h-8 mx-auto"></lucide-icon></div>
                <div class="bg-slate-900 p-2 rounded mb-2">PSBT</div>
                <div class="text-slate-500">Decrypts with Key (URL Fragment)</div>
                <div class="mt-4 text-emerald-500"><- Receives Blob</div>
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
              <strong class="text-slate-200">Yes.</strong> SigningRoom is a 100% free, open-source public good for the Bitcoin community. 
            </p>
            <p>
              There are no paid tiers, no "enterprise" locks, and no hidden fees. All features—including 20-signer rooms and Audit Logs—are available to everyone.
            </p>
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
  readonly Zap = Zap; readonly Users = Users; readonly Shield = Shield;
  readonly ChevronRight = ChevronRight; readonly Lock = Lock; readonly Github = Github;
  readonly Code2 = Code2; readonly Eye = Eye; readonly Trash2 = Trash2;
  readonly UploadCloud = UploadCloud; readonly Share2 = Share2;
  readonly FileCheck = FileCheck; readonly HelpCircle = HelpCircle;
  readonly AlertTriangle = AlertTriangle; readonly Maximize = Maximize;
  readonly Server = Server; readonly Network = Network; readonly Key = Key;
  readonly Cpu = Cpu; readonly Fingerprint = Fingerprint; readonly Globe = Globe;

  ngOnInit() {}

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
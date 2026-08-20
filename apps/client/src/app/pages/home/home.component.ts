/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  LucideZap,
  LucideUsers,
  LucideTerminal,
  LucideChevronRight,
  LucideLock,
  LucideCode2,
  LucideHelpCircle,
  LucideGlobe,
  LucideXCircle,
  LucideCheckCircle2,
  LucideAlertTriangle,
  LucideNetwork,
  LucideFileKey,
  LucideCpu,
  LucideFingerprint,
  LucideMaximize,
  LucideScale,
  LucideEyeOff,
  LucideShieldCheck,
  LucideFileText,
  LucideBuilding2,
  LucideExternalLink,
} from '@lucide/angular';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterModule,
    LucideZap,
    LucideUsers,
    LucideTerminal,
    LucideChevronRight,
    LucideLock,
    LucideCode2,
    LucideHelpCircle,
    LucideGlobe,
    LucideXCircle,
    LucideCheckCircle2,
    LucideAlertTriangle,
    LucideNetwork,
    LucideFileKey,
    LucideCpu,
    LucideFingerprint,
    LucideMaximize,
    LucideScale,
    LucideEyeOff,
    LucideShieldCheck,
    LucideFileText,
    LucideBuilding2,
    LucideExternalLink,
  ],
  template: `
    <div class="max-w-6xl mx-auto text-center pt-24 px-6 relative">
       
       <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none"></div>

       <a href="https://github.com/scarlin90/SigningRoom" target="_blank" class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 backdrop-blur-md border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition mb-8 cursor-pointer group relative z-10">
        <svg lucideCode2 class="w-3 h-3 text-emerald-400"></svg>
        <span class="text-xs font-medium">Open Source (AGPL v3) &bull; Verify the code</span>
        <svg lucideChevronRight class="w-3 h-3 group-hover:translate-x-0.5 transition-transform"></svg>
      </a>

      <h1 class="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-tight relative z-10">
        Signing Room® <br />
        <span class="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 text-3xl md:text-5xl">
          The Real-Time Bitcoin Multisig Coordinator
        </span>
      </h1>

      <p class="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed relative z-10">
        Stop emailing PSBT files. Coordinate Bitcoin multisig teams instantly.
        <br class="hidden md:block" />
        <span class="text-slate-200 font-semibold">No accounts.</span> 
        <span class="text-slate-200 font-semibold">No database.</span> 
        <span class="text-slate-200 font-semibold">End-to-End Encrypted.</span>
      </p>

      <div class="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
        <a routerLink="/create" class="px-8 py-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer w-full sm:w-auto justify-center hover:scale-105 transform duration-200">
          <svg lucideZap class="w-5 h-5 fill-slate-950"></svg>
          Start Signing
        </a>
        
        <a href="https://arxiv.org/abs/2601.17875" target="_blank" class="px-8 py-4 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-medium transition-all flex items-center gap-2 border border-slate-700 hover:border-slate-600 w-full sm:w-auto justify-center">
          <svg lucideFileText class="w-5 h-5 text-emerald-400"></svg>
          Whitepaper
        </a>

        <a href="https://github.com/scarlin90/signingroom/tree/main/libs/sdk" target="_blank" class="px-8 py-4 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-white font-medium transition-all flex items-center gap-2 border border-slate-700 hover:border-slate-600 w-full sm:w-auto justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
          TypeScript SDK
        </a>

        <a href="/webcomponent-demo.html?ngsw-bypass=true" target="_blank" rel="external noopener noreferrer"  class="px-8 py-4 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-white font-medium transition-all flex items-center gap-2 border border-slate-700 hover:border-slate-600 w-full sm:w-auto justify-center">
          <svg lucideTerminal class="w-4 h-4"></svg>
          Web Component Demo
      </a>
      </div>
    </div>

    <div class="max-w-5xl mx-auto mt-16 px-6 relative z-10 animate-fade-in-up">
        <div #demoContainer class="rounded-2xl overflow-hidden border border-slate-800 shadow-2xl shadow-emerald-500/10 bg-slate-900/50 backdrop-blur-sm relative group">
            
            <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none z-10"></div>
            
            <img src="assets/multisig-demo.gif" alt="Real-time Multisig Signing Demo" class="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition duration-700">
            
            <button (click)="toggleFullscreen(demoContainer)" class="absolute top-4 right-4 z-30 p-2 rounded-lg bg-slate-900/50 hover:bg-emerald-500 hover:text-slate-950 border border-slate-700 hover:border-emerald-400 text-slate-300 transition-all opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 duration-300">
                <svg lucideMaximize class="w-5 h-5"></svg>
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

    <div class="max-w-4xl mx-auto mt-24 px-6 relative z-10">
        <div class="text-center mb-10">
            <h2 class="text-3xl font-bold text-white mb-2">Why change your workflow?</h2>
            <p class="text-slate-400">Manual file merging is error-prone and slow. There is a better way.</p>
        </div>

        <div class="grid md:grid-cols-2 gap-8">
            <div class="p-8 rounded-2xl bg-slate-900/30 border border-red-900/20 relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500/0 via-red-500/50 to-red-500/0"></div>
                <h3 class="text-lg font-bold text-slate-300 mb-6 flex items-center gap-2">
                    <svg lucideAlertTriangle class="w-5 h-5 text-red-400"></svg>
                    The Old Way (Email/Slack)
                </h3>
                <ul class="space-y-4">
                    <li class="flex items-start gap-3 text-sm text-slate-400">
                        <svg lucideXCircle class="w-5 h-5 text-red-500 shrink-0"></svg>
                        <span>Manually merging 5 different email attachments.</span>
                    </li>
                    <li class="flex items-start gap-3 text-sm text-slate-400">
                        <svg lucideXCircle class="w-5 h-5 text-red-500 shrink-0"></svg>
                        <span>Files stored permanently on Slack/Google servers.</span>
                    </li>
                    <li class="flex items-start gap-3 text-sm text-slate-400">
                        <svg lucideXCircle class="w-5 h-5 text-red-500 shrink-0"></svg>
                        <span>Slow, asynchronous delays between signers.</span>
                    </li>
                </ul>
            </div>

            <div class="p-8 rounded-2xl bg-emerald-900/10 border border-emerald-500/20 relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0"></div>
                <h3 class="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <svg lucideZap class="w-5 h-5 text-emerald-400"></svg>
                    The Signing Room® Way
                </h3>
                <ul class="space-y-4">
                    <li class="flex items-start gap-3 text-sm text-slate-200">
                        <svg lucideCheckCircle2 class="w-5 h-5 text-emerald-400 shrink-0"></svg>
                        <span>Real-time merging. Everyone sees the same state.</span>
                    </li>
                    <li class="flex items-start gap-3 text-sm text-slate-200">
                        <svg lucideCheckCircle2 class="w-5 h-5 text-emerald-400 shrink-0"></svg>
                        <span>Data lives in RAM, encrypted, and vanishes on expiry.</span>
                    </li>
                    <li class="flex items-start gap-3 text-sm text-slate-200">
                        <svg lucideCheckCircle2 class="w-5 h-5 text-emerald-400 shrink-0"></svg>
                        <span>Instant broadcast once signatures are collected.</span>
                    </li>
                </ul>
            </div>
        </div>
    </div>

    <section class="mt-32 border-y border-slate-800/60 bg-slate-900/30 backdrop-blur-sm py-20 relative overflow-hidden">
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>

      <div class="max-w-6xl mx-auto px-6 relative z-10">
        <div class="text-center mb-16">
          <h2 class="text-3xl font-bold text-white mb-4">Code is Law. Physics is Enforcement.</h2>
          <p class="text-slate-400 max-w-2xl mx-auto">
            We enforce the <span class="text-emerald-400 font-medium">Universal Declaration of Human Rights</span> 
            not through policy, but through cryptographic guarantees.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          
          <div class="p-6 rounded-2xl bg-slate-950/50 border border-slate-800 hover:border-emerald-500/50 transition group">
            <div class="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <svg lucideEyeOff class="w-6 h-6 text-emerald-400"></svg>
            </div>
            <h3 class="text-lg font-bold text-white mb-1">Article 12</h3>
            <div class="text-xs font-mono text-emerald-500 mb-3 uppercase tracking-wider">Privacy</div>
            <p class="text-slate-400 text-sm leading-relaxed">
              "No one shall be subjected to arbitrary interference with his privacy."
              <br/><span class="opacity-50 mt-2 block border-t border-slate-800 pt-2">Enforced via AES-256-GCM.</span>
            </p>
          </div>

          <div class="p-6 rounded-2xl bg-slate-950/50 border border-slate-800 hover:border-emerald-500/50 transition group">
            <div class="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <svg lucideScale class="w-6 h-6 text-emerald-400"></svg>
            </div>
            <h3 class="text-lg font-bold text-white mb-1">Article 20</h3>
            <div class="text-xs font-mono text-emerald-500 mb-3 uppercase tracking-wider">Assembly</div>
            <p class="text-slate-400 text-sm leading-relaxed">
              "Everyone has the right to freedom of peaceful assembly and association."
              <br/><span class="opacity-50 mt-2 block border-t border-slate-800 pt-2">Enforced via Ephemeral Rooms.</span>
            </p>
          </div>

          <div class="p-6 rounded-2xl bg-slate-950/50 border border-slate-800 hover:border-emerald-500/50 transition group">
            <div class="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <svg lucideShieldCheck class="w-6 h-6 text-emerald-400"></svg>
            </div>
            <h3 class="text-lg font-bold text-white mb-1">Article 17</h3>
            <div class="text-xs font-mono text-emerald-500 mb-3 uppercase tracking-wider">Property</div>
            <p class="text-slate-400 text-sm leading-relaxed">
              "No one shall be arbitrarily deprived of his property."
              <br/><span class="opacity-50 mt-2 block border-t border-slate-800 pt-2">Enforced via Non-Custodial Multisig.</span>
            </p>
          </div>

          <div class="p-6 rounded-2xl bg-slate-950/50 border border-slate-800 hover:border-emerald-500/50 transition group">
            <div class="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <svg lucideGlobe class="w-6 h-6 text-emerald-400"></svg>
            </div>
            <h3 class="text-lg font-bold text-white mb-1">Article 19</h3>
            <div class="text-xs font-mono text-emerald-500 mb-3 uppercase tracking-wider">Expression</div>
            <p class="text-slate-400 text-sm leading-relaxed">
              "Right to freedom of opinion and expression... through any media."
              <br/><span class="opacity-50 mt-2 block border-t border-slate-800 pt-2">Enforced via Unstoppable Code.</span>
            </p>
          </div>

        </div>
      </div>
    </section>

    <div class="max-w-6xl mx-auto mt-24 px-6 relative z-10">
        
        <div class="text-center mb-10">
            <h2 class="text-3xl font-bold text-white mb-2">The Blind Relay</h2>
            <p class="text-slate-400">We forward your encrypted packets. We never hold the keys.</p>
        </div>

        <div class="relative group mb-32">
            <div class="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-xl blur-lg opacity-50 group-hover:opacity-70 transition duration-1000"></div>
            <div class="relative rounded-xl bg-slate-950/80 backdrop-blur-xl border border-slate-800 shadow-2xl overflow-hidden p-8 md:p-12">
                <div class="flex flex-col md:flex-row items-center justify-between gap-8">
                    
                    <div class="flex flex-col items-center text-center">
                        <div class="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center border border-slate-700 mb-4">
                            <svg lucideUsers class="w-8 h-8 text-emerald-400"></svg>
                        </div>
                        <div class="text-sm font-bold text-white">Client Side</div>
                        <div class="text-xs text-slate-500">Encrypts with Key</div>
                    </div>

                    <div class="flex flex-col items-center gap-2 flex-1">
                        <div class="w-full h-0.5 bg-slate-800 relative">
                            <div class="absolute inset-0 bg-emerald-500/50 w-1/2 animate-pulse"></div>
                        </div>
                        <div class="px-3 py-1 bg-slate-900 rounded border border-slate-800 text-[10px] text-emerald-400 font-mono flex items-center gap-2">
                            <svg lucideLock class="w-3 h-3"></svg> AES-256-GCM
                        </div>
                    </div>

                    <div class="flex flex-col items-center text-center">
                        <div class="w-20 h-20 bg-slate-900 rounded-xl flex items-center justify-center border border-slate-700 mb-4 relative">
                            <svg lucideNetwork class="w-10 h-10 text-slate-600"></svg>
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
                            <svg lucideFileKey class="w-3 h-3"></svg> Sync State
                        </div>
                    </div>

                    <div class="flex flex-col items-center text-center">
                        <div class="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center border border-slate-700 mb-4">
                            <svg lucideUsers class="w-8 h-8 text-cyan-400"></svg>
                        </div>
                        <div class="text-sm font-bold text-white">Peer Side</div>
                        <div class="text-xs text-slate-500">Decrypts via Secret Link</div>
                    </div>

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
                    <svg lucideUsers class="w-6 h-6 text-indigo-400"></svg>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">Flexible "M-of-N" Consensus</h3>
                <p class="text-sm text-slate-400 leading-relaxed">
                    Don't be locked into a rigid structure. Whether you need a <strong>2-of-3</strong> for founders or a <strong>3-of-5</strong> for the board, you define the quorum required to authorize funds.
                </p>
            </div>

            <div class="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl hover:bg-slate-900/60 transition group">
                <div class="w-12 h-12 bg-rose-950/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <svg lucideAlertTriangle class="w-6 h-6 text-rose-500"></svg>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">Mitigate "Key Person" Risk</h3>
                <p class="text-sm text-slate-400 leading-relaxed">
                    What if the CEO is in an accident or loses access to their keys? In a multisig setup, the remaining board members can still approve payroll, ensuring business continuity.
                </p>
            </div>

            <div class="bg-emerald-950/10 border border-emerald-500/30 p-6 rounded-2xl hover:bg-emerald-950/20 transition group relative overflow-hidden">
                <div class="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 blur-xl rounded-full"></div>
                <div class="w-12 h-12 bg-emerald-950/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <svg lucideZap class="w-6 h-6 text-emerald-400"></svg>
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
            <h2 class="text-3xl font-bold text-white mb-2">Build with Signing Room SDK</h2>
            <p class="text-slate-400">Integrate our robust multisig coordination logic into your own applications.</p>
        </div>

        <div class="p-8 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 flex flex-col md:flex-row items-center gap-8 shadow-2xl">
            <div class="flex-1 text-left">
                <h3 class="text-xl font-bold text-white mb-3 flex items-center gap-2">
                    <svg lucideCode2 class="w-6 h-6 text-emerald-400"></svg>
                    Signing Room SDK
                </h3>
                <p class="text-sm text-slate-400 leading-relaxed mb-6">
                    A framework-agnostic TypeScript SDK for managing end-to-end encrypted multisig ceremonies. 
                    Handle room lifecycle, PSBT merging, and audit trail generation programmatically.
                </p>
                <div class="flex flex-wrap gap-3">
                    <a href="https://www.npmjs.com/package/@signing-room/sdk" target="_blank" class="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition flex items-center gap-2">
                        <svg lucideExternalLink class="w-4 h-4"></svg>
                        View on NPM
                    </a>
                    <a href="https://github.com/scarlin90/signingroom/tree/main/libs/sdk" target="_blank" class="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm transition border border-slate-700 flex items-center gap-2">
                        <svg lucideFileText class="w-4 h-4"></svg>
                        Read Docs
                    </a>
                    <a href="https://youtu.be/yzcFlK6c6t0" target="_blank" class="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm transition border border-slate-700 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>
                        Watch
                    </a>
                </div>
            </div>
            <div class="w-full md:w-1/3 bg-black rounded-lg p-4 font-mono text-[10px] text-emerald-400 border border-slate-800 overflow-x-auto">
                npm install @signing-room/sdk<br><br>
                const client = new SigningRoomClient(&#123;<br>
                &nbsp;&nbsp;apiUrl: '...'<br>
                &#125;);<br><br>
                await client.createRoomAndJoin(...);
            </div>
        </div>
    </div>

    <div class="max-w-4xl mx-auto mt-24 px-6 relative z-10">
        <div class="text-center mb-10">
            <h2 class="text-3xl font-bold text-white mb-2">Commercial Whitelabeling</h2>
            <p class="text-slate-400">Deploy a dedicated, branded instance for your enterprise or institution.</p>
        </div>

        <div class="p-8 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 flex flex-col md:flex-row items-center gap-8 shadow-2xl">
            <div class="flex-1 text-left">
                <h3 class="text-xl font-bold text-white mb-3 flex items-center gap-2">
                    <svg lucideBuilding2 class="w-6 h-6 text-cyan-400"></svg>
                    Enterprise Self-Hosting
                </h3>
                <p class="text-sm text-slate-400 leading-relaxed mb-6">
                    Maintain complete sovereignty over your coordination layer. 
                    Deploy Signing Room to your own infrastructure with a custom domain, tailored branding, and full commercial support via an AGPL waiver.
                </p>
                <div class="flex flex-wrap gap-3">
                    <a href="https://staging-branded.signingroom.io" target="_blank" class="px-5 py-2.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-medium text-sm transition flex items-center gap-2">
                        <!-- Small fallback SVG if branded-logo is missing in the unbranded environment -->
                        <img src="brand/branded-logo.svg" alt="Zoros Financial" class="w-4 h-4 object-contain" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMjJkM2VlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIgMTJoMjAiLz48cGF0aCBkPSJNMjIgNkgzIi8+PHBhdGggZD0iTTIgMThoMjAiLz48L3N2Zz4='">
                        Zoros Financial (Demo)
                    </a>
                    <a href="https://statelessresearch.com" target="_blank" class="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm transition border border-slate-700 flex items-center gap-2">
                        <svg lucideExternalLink class="w-4 h-4"></svg>
                        Contact Sales
                    </a>
                </div>
            </div>
            <div class="w-full md:w-1/3 flex justify-center">
                 <a href="https://staging-branded.signingroom.io" target="_blank" class="relative w-48 h-48 block group cursor-pointer">
                    <div class="absolute inset-0 bg-cyan-500/20 rounded-full blur-2xl animate-pulse group-hover:bg-cyan-500/40 transition-all duration-500"></div>
                    <div class="relative w-full h-full bg-slate-900 border border-slate-700 group-hover:border-cyan-500/50 rounded-xl flex flex-col items-center justify-center p-6 shadow-xl transition-all duration-300 transform group-hover:-translate-y-2">
                         <img src="brand/branded-logo.svg" alt="Custom Branding" class="w-16 h-16 object-contain mb-4" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMjJkM2VlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIgMTJoMjAiLz48cGF0aCBkPSJNMjIgNkgzIi8+PHBhdGggZD0iTTIgMThoMjAiLz48L3N2Zz4='">
                         <div class="font-bold text-white text-lg tracking-tight leading-none mb-1">Zoros</div>
                         <div class="text-xs text-cyan-400 font-medium tracking-widest uppercase">Financial</div>
                    </div>
                 </a>
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
                <svg lucideCpu class="w-6 h-6 text-slate-500 mx-auto mb-2"></svg>
                <div class="text-xs text-slate-500 font-mono">BIP-174</div>
                <div class="text-sm font-bold text-slate-300">PSBT Native</div>
             </div>
             <div class="p-4 rounded-lg bg-slate-900/30 border border-slate-800">
                <svg lucideLock class="w-6 h-6 text-slate-500 mx-auto mb-2"></svg>
                <div class="text-xs text-slate-500 font-mono">AES-GCM</div>
                <div class="text-sm font-bold text-slate-300">End-to-End Encrypted</div>
             </div>
             <div class="p-4 rounded-lg bg-slate-900/30 border border-slate-800">
                <svg lucideNetwork class="w-6 h-6 text-slate-500 mx-auto mb-2"></svg>
                <div class="text-xs text-slate-500 font-mono">WebSocket</div>
                <div class="text-sm font-bold text-slate-300">Real-time</div>
             </div>
             <div class="p-4 rounded-lg bg-slate-900/30 border border-slate-800">
                <svg lucideFingerprint class="w-6 h-6 text-slate-500 mx-auto mb-2"></svg>
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
            <svg lucideHelpCircle class="w-4 h-4 text-emerald-400"></svg>
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
            <svg lucideHelpCircle class="w-4 h-4 text-emerald-400"></svg>
            Can you see my transaction details?
          </h3>
          <p class="text-slate-400 text-sm leading-relaxed">
            No. Your transaction is encrypted in your browser using a key that is contained in the URL link hash (fragment). 
            This key is never sent to our servers, so we literally cannot decrypt your data.
          </p>
        </div>

        <div class="p-6 bg-slate-900/50 rounded-xl border border-slate-800 hover:bg-slate-900 transition">
          <h3 class="font-bold text-white mb-2 flex items-center gap-2">
            <svg lucideHelpCircle class="w-4 h-4 text-emerald-400"></svg>
            Is it really free?
          </h3>
          <div class="text-slate-400 text-sm leading-relaxed">
            <p class="mb-2">
              <strong class="text-slate-200">Yes.</strong> SigningRoom.io is a 100% free, open-source public good.
            </p>
            <p>
              We cover our costs through optional donations and enterprise licensing. There are no paid tiers for the public service.
            </p>
          </div>
        </div>

        <div class="p-6 bg-slate-900/50 rounded-xl border border-slate-800 hover:bg-slate-900 transition">
          <h3 class="font-bold text-white mb-2 flex items-center gap-2">
            <svg lucideBuilding2 class="w-4 h-4 text-cyan-400"></svg>
            Can I host this myself? (Enterprise)
          </h3>
          <div class="text-slate-400 text-sm leading-relaxed">
            <p class="mb-2">
              <strong class="text-slate-200">Yes.</strong> The code is open source (AGPL v3), so you can audit and run it yourself.
            </p>
            <p>
              For institutions requiring a commercial license (AGPL waiver) to integrate into proprietary, closed-source infrastructure, please contact 
              <a href="https://statelessresearch.com" target="_blank" class="text-emerald-400 hover:underline">Stateless Research Ltd</a>.
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
          Start Signing
          <svg lucideChevronRight class="w-5 h-5"></svg>
        </a>
    </div>
  `,
})
export class HomeComponent implements OnInit {
  ngOnInit() {}

  toggleFullscreen(element: HTMLElement) {
    if (!document.fullscreenElement) {
      element.requestFullscreen().catch((err) => {
        console.error(`Error enabling fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }
}

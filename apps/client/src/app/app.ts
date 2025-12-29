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

import { Component, ViewEncapsulation, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  LucideAngularModule, 
  Shield, 
  Lock, 
  Zap, 
  Users, 
  Terminal, 
  ChevronRight, 
  Github, 
  Twitter,
  Key,
  Mail,
  Globe
} from 'lucide-angular';
import { RouterModule, Router, NavigationEnd } from '@angular/router'; 
import { filter } from 'rxjs/operators'; 

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, RouterModule],
  encapsulation: ViewEncapsulation.None,
  template: `
<body class="min-h-screen flex flex-col">

    <nav class="w-full border-b border-slate-800/60 backdrop-blur-md fixed top-0 z-50 bg-slate-950/50">
        <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            
            <div class="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" routerLink="/">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 409 445" class="w-7 h-7 text-emerald-400 fill-current" preserveAspectRatio="xMidYMid meet">
                     <g>
                      <path d="M185.5 425.7 c-35.4 -17.3 -72 -43.4 -98.2 -69.9 -31.6 -31.9 -50.3 -62.5 -59.1 -96.8 -5.6 -21.7 -5.7 -23.4 -5.7 -101 0 -66.6 0.1 -71.7 1.8 -75.1 2.3 -4.6 6.1 -6.7 22.2 -12.2 7.2 -2.5 31.9 -11.3 55 -19.7 79.4 -28.7 97.6 -35 100.4 -35 2.8 0 27.5 8.3 53.6 18 21.3 7.9 70.6 25.7 92 33.1 11 3.9 21.4 7.5 23 8.1 4.4 1.6 8.4 5.7 9.5 9.7 1.3 4.9 1.3 136.8 0 148.6 -4.9 42.6 -21.2 76.1 -55.1 113.1 -21 23 -49.7 46 -79.4 63.9 -15.9 9.6 -40.1 21.5 -43.6 21.5 -2.1 0 -8.2 -2.3 -16.4 -6.3z m24.6 -28.8 c31.4 -15.7 71.7 -45.6 92 -68 26.9 -29.8 39.3 -52 47.2 -84.4 2.1 -8.8 2.2 -10.3 2.2 -76.9 l0 -67.9 -17 -6.2 c-48.5 -17.7 -84.6 -30.6 -116 -41.6 l-16.9 -6 -20.1 7.1 c-11 4 -26.5 9.6 -34.5 12.5 -8 2.9 -18.3 6.7 -23 8.3 -11.6 4 -36.2 12.9 -43.5 15.7 -3.3 1.3 -10.9 4 -17 6.1 -6 2.1 -11.2 4.1 -11.5 4.5 -1 1.4 -1 113.3 -0.1 124.9 0.5 6.3 1.7 15.1 2.6 19.5 10.6 52.1 52.2 101.4 119 141 11.4 6.8 27 15.3 28.3 15.5 0.1 0 3.9 -1.8 8.3 -4.1z"/>
                      <path d="M191.3 318.3 c-7.6 -7.4 -8.1 -8.1 -8.6 -12.8 -0.2 -2.7 -0.5 -27.9 -0.6 -55.9 0 -28 -0.2 -51 -0.3 -51.1 -0.2 -0.1 -2.5 -1.4 -5.1 -2.9 -7 -4 -11.1 -8 -16.1 -15.4 -5.9 -8.9 -8.6 -17.5 -8.6 -27.1 0 -27 19.5 -48.5 45.9 -50.7 13 -1.1 26.1 3.5 36.6 12.9 19.8 17.6 21.8 50.3 4.4 70.1 -4.1 4.6 -14.8 12.6 -16.8 12.6 -0.7 0 -1.1 6.3 -1.1 19 l0 19 -6.1 6.6 -6 6.7 6 6.1 c8.2 8.3 8.2 10.1 0 18.3 l-6 6 6 5.8 6.1 5.8 0 8.3 0 8.2 -9 9.1 c-5 5 -9.9 9.1 -10.9 9.1 -1 0 -5.4 -3.5 -9.8 -7.7z m17.7 -175 c3.6 -2.4 4.8 -4.3 5.5 -8.3 1 -5.7 -1.4 -11.1 -6 -13.7 -4.9 -2.8 -8.4 -2.9 -13.4 -0.3 -3.8 1.9 -4.5 2.8 -6.2 8.4 -1.2 4.1 0.8 10.2 4.4 13.2 3.6 3 11.8 3.4 15.7 0.7z"/>
                      <path d="M130.1 304.2 l-7.1 -6.7 0 -48.2 0 -48.2 -5.5 -3.5 c-36.6 -23.5 -23.7 -79.4 19.1 -82.4 6.5 -0.4 17.4 1.2 17.4 2.5 0 0.3 -1.5 3.6 -3.2 7.4 -2.4 5 -3.7 6.6 -4.8 6.2 -0.8 -0.4 -3.6 -0.8 -6.3 -1.1 -4.3 -0.4 -5 -0.1 -8.2 3.1 -2.9 2.9 -3.5 4.2 -3.5 7.9 0 2.4 0.7 5.4 1.6 6.6 2 2.9 6.6 5.2 10.4 5.2 2.6 0 3 0.3 3 2.8 0 4.7 4 17.3 7.6 24.2 1.9 3.6 5.4 8.9 7.9 11.7 l4.6 5.2 -3.1 1.6 c-3.3 1.7 -3.4 2.4 -3 24.1 l0.2 9.1 -5.1 5.8 c-2.8 3.2 -5.1 6.1 -5.1 6.4 0 0.4 2.3 3.1 5 6.1 3 3.3 5 6.4 5 7.8 0 1.3 -1.9 4.3 -4.5 7.1 -2.5 2.6 -4.5 5.4 -4.5 6.1 0 0.7 2 3.5 4.5 6.1 4.4 4.7 4.5 4.9 4.5 11.6 l0 6.7 -7.9 7.8 c-4.5 4.4 -8.8 7.8 -9.9 7.8 -1.1 0 -5.2 -3 -9.1 -6.8z"/>
                      <path d="M254.3 303.8 l-7.3 -7.1 0 -47.9 0 -47.9 -3.5 -2 c-1.9 -1.2 -3.5 -2.2 -3.5 -2.3 0 -0.1 2.1 -2.4 4.8 -5.2 8.2 -8.6 14.1 -22.8 14.2 -34.1 l0 -4.3 4.6 0 c3.9 0 5.1 -0.5 8 -3.4 2.8 -2.8 3.4 -4.2 3.4 -7.6 0 -9.6 -8.1 -14.6 -17.1 -10.6 -1.3 0.6 -2.5 -0.7 -5.3 -6 -3.9 -7.4 -3.8 -7.6 2.4 -9.4 7.4 -2.1 20 -0.5 28.8 3.7 10.4 4.9 20.7 19.4 23.2 32.5 1.5 7.5 0.3 17.7 -3 25.3 -2.7 6.4 -10.5 15.1 -17 19.1 l-6 3.7 0 16.1 0 16.2 -5.5 5.4 -5.5 5.4 5.5 5.6 c7 7.1 7.2 9.3 1 15.9 -2.5 2.6 -4.5 5.5 -4.5 6.2 0 0.8 2 3.5 4.5 5.9 4.5 4.4 4.5 4.4 4.5 11.5 l0 7.2 -7.9 7.6 c-4.3 4.2 -8.7 7.7 -9.7 7.7 -1.1 0 -5.2 -3.2 -9.1 -7.2z"/>
                     </g>
                </svg>
                
                <span class="text-xl font-bold tracking-tight text-slate-100">
                    SigningRoom<span class="text-emerald-400">.io</span>
                </span>
            </div>
            <div class="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
                <span>Stateless</span>
                <span>Non-Custodial</span>
                <span>Real-time</span>
            </div>
        </div>
    </nav>
    
    <div class="flex-grow pt-20">
        <router-outlet></router-outlet>
    </div>

    <footer class="border-t border-slate-800 bg-slate-950 py-12">
      <div class="max-w-5xl mx-auto px-6">
        
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-8">
            <div class="text-center md:text-left">
              <div class="font-bold text-white text-lg mb-1">SigningRoom.io</div>
              <p class="text-xs text-slate-500">
                Open Source &bull; Zero Knowledge &bull; Bitcoin Only
              </p>
            </div>

            <div class="flex items-center gap-6">
              <a href="mailto:support@signingroom.io" class="text-slate-500 hover:text-white transition">
                <lucide-icon [img]="Mail" class="w-5 h-5"></lucide-icon>
              </a>

              <a href="https://github.com/scarlin90/SigningRoom" target="_blank" class="text-slate-500 hover:text-white transition">
                <lucide-icon [img]="Github" class="w-5 h-5"></lucide-icon>
              </a>
              
              <a href="https://x.com/SigningRoom" target="_blank" class="text-slate-500 hover:text-white transition">
                <lucide-icon [img]="Twitter" class="w-5 h-5"></lucide-icon>
              </a>

              <a href="https://njump.me/npub1a6tk6kcs2p40eumeu2mru4jwqssnhvc8xtupwlpc6l3gymjha03sek436a" target="_blank" class="text-slate-500 hover:text-white transition" title="Nostr">
                <lucide-icon [img]="Globe" class="w-5 h-5"></lucide-icon>
              </a>
            </div>
        </div>

        <div class="border-t border-slate-900 pt-8">
            <p class="text-[10px] text-slate-600 leading-relaxed text-justify">
                <strong>DISCLAIMER:</strong> This software is provided "as is", without warranty of any kind, express or implied. 
                SigningRoom.io does not hold custody of funds, private keys, or unencrypted transaction data at any time. 
                You are solely responsible for verifying the details of your transaction before broadcasting. 
                Use at your own risk. Always verify PSBT details on your hardware device screen.
            </p>
            
            <div class="flex flex-col items-center justify-center gap-3 mt-6">
              <div class="flex items-center gap-1 text-xs text-slate-700">
                <p>&copy; {{ currentYear }} Sean Carlin. Released under AGPL v3.</p>
                <span class="mx-1">&bull;</span>
                <p>Built for Bitcoiners.</p>
              </div>

              <div class="flex items-center gap-3">
                  <a href="/security.txt" target="_blank" class="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-600 hover:text-emerald-400 transition group">
                    <lucide-icon [img]="Shield" class="w-3 h-3 group-hover:text-emerald-400 transition"></lucide-icon>
                    Warrant Canary
                  </a>
                  
                  <span class="text-slate-700 text-[10px]">&bull;</span>

                  <a href="/pgp-key.asc" target="_blank" class="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-600 hover:text-cyan-400 transition group">
                    <lucide-icon [img]="Key" class="w-3 h-3 group-hover:text-cyan-400 transition"></lucide-icon>
                    PGP Key
                  </a>
              </div>
            </div>
        </div>

      </div>
    </footer>

  </body>
  `
})
export class App implements OnInit {

  readonly icons = {
    Shield,
    Lock,
    Zap,
    Users,
    Terminal,
    ChevronRight,
    Github,
    Twitter
  };
  readonly Github = Github;
  readonly Twitter = Twitter;
  readonly Shield = Shield; 
  readonly Key = Key;
  readonly Mail = Mail;
  readonly Globe = Globe;

  readonly currentYear = new Date().getFullYear();

  private router = inject(Router);

  constructor() {
    this.router.events.pipe(
        filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
        if (typeof window !== 'undefined') {
            window.scrollTo(0, 0);
        }
    });
  }

  ngOnInit() {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
          document.body.innerHTML = `
              <div style="background:#020617; color:#f43f5e; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif; text-align:center; padding:20px;">
                  <h1 style="margin-bottom:10px;">Security Error</h1>
                  <p>SigningRoom requires a Secure Context (HTTPS).</p>
                  <p style="color:#94a3b8; font-size:14px;">The Web Cryptography API is disabled in insecure environments.</p>
              </div>
          `;
          throw new Error("Insecure Context - Crypto API disabled");
      }
  }

  readonly features = [
    {
      title: "Stateless Architecture",
      desc: "We don't store your data. Rooms exist in RAM and vanish after 1 hour. Zero database liability.",
      icon: Zap,
      iconColor: "text-amber-400"
    },
    {
      title: "Real-Time Sync",
      desc: "See signatures appear instantly. No more refreshing, no more emailing .psbt files back and forth.",
      icon: Users,
      iconColor: "text-cyan-400"
    },
    {
      title: "Audit Ready",
      desc: "Generate cryptographically verifiable PDF audit logs client-side for your compliance team.",
      icon: Shield,
      iconColor: "text-emerald-400"
    }
  ];
}
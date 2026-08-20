/*
 * Copyright (C) 2026 Stateless Research Ltd
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

import { Component, ViewEncapsulation, inject, OnInit, Renderer2 } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ConfigService } from './services/config/config.service';
import { Title, Meta } from '@angular/platform-browser';
import {
  LucideShield,
  LucideUsers,
  LucideZap,
  LucideKey,
  LucideGlobe,
  LucideMail,
} from '@lucide/angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    LucideShield,
    LucideZap,
    LucideKey,
    LucideGlobe,
    LucideMail,
  ],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="min-h-screen flex flex-col bg-brand-bg text-brand-text">
      @if (!isEmbedded) {
        <nav class="w-full border-b border-brand-card-border/60 backdrop-blur-md fixed top-0 z-50 bg-brand-bg/80">
          <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            
            <div class="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" routerLink="/">
              @if (configService.config().whitelabel) {
                <img [src]="configService.config().logoUrl" [alt]="configService.config().brandName" class="w-7 h-7 object-contain" />
              } @else {
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 409 445" class="w-7 h-7 text-brand-accent fill-current" preserveAspectRatio="xMidYMid meet">
                  <g>
                    <path d="M185.5 425.7 c-35.4 -17.3 -72 -43.4 -98.2 -69.9 -31.6 -31.9 -50.3 -62.5 -59.1 -96.8 -5.6 -21.7 -5.7 -23.4 -5.7 -101 0 -66.6 0.1 -71.7 1.8 -75.1 2.3 -4.6 6.1 -6.7 22.2 -12.2 7.2 -2.5 31.9 -11.3 55 -19.7 79.4 -28.7 97.6 -35 100.4 -35 2.8 0 27.5 8.3 53.6 18 21.3 7.9 70.6 25.7 92 33.1 11 3.9 21.4 7.5 23 8.1 4.4 1.6 8.4 5.7 9.5 9.7 1.3 4.9 1.3 136.8 0 148.6 -4.9 42.6 -21.2 76.1 -55.1 113.1 -21 23 -49.7 46 -79.4 63.9 -15.9 9.6 -40.1 21.5 -43.6 21.5 -2.1 0 -8.2 -2.3 -16.4 -6.3z m24.6 -28.8 c31.4 -15.7 71.7 -45.6 92 -68 26.9 -29.8 39.3 -52 47.2 -84.4 2.1 -8.8 2.2 -10.3 2.2 -76.9 l0 -67.9 -17 -6.2 c-48.5 -17.7 -84.6 -30.6 -116 -41.6 l-16.9 -6 -20.1 7.1 c-11 4 -26.5 9.6 -34.5 12.5 -8 2.9 -18.3 6.7 -23 8.3 -11.6 4 -36.2 12.9 -43.5 15.7 -3.3 1.3 -10.9 4 -17 6.1 -6 2.1 -11.2 4.1 -11.5 4.5 -1 1.4 -1 113.3 -0.1 124.9 0.5 6.3 1.7 15.1 2.6 19.5 10.6 52.1 52.2 101.4 119 141 11.4 6.8 27 15.3 28.3 15.5 0.1 0 3.9 -1.8 8.3 -4.1z"/>
                    <path d="M191.3 318.3 c-7.6 -7.4 -8.1 -8.1 -8.6 -12.8 -0.2 -2.7 -0.5 -27.9 -0.6 -55.9 0 -28 -0.2 -51 -0.3 -51.1 -0.2 -0.1 -2.5 -1.4 -5.1 -2.9 -7 -4 -11.1 -8 -16.1 -15.4 -5.9 -8.9 -8.6 -17.5 -8.6 -27.1 0 -27 19.5 -48.5 45.9 -50.7 13 -1.1 26.1 3.5 36.6 12.9 19.8 17.6 21.8 50.3 4.4 70.1 -4.1 4.6 -14.8 12.6 -16.8 12.6 -0.7 0 -1.1 6.3 -1.1 19 l0 19 -6.1 6.6 -6 6.7 6 6.1 c8.2 8.3 8.2 10.1 0 18.3 l-6 6 6 5.8 6.1 5.8 0 8.3 0 8.2 -9 9.1 c-5 5 -9.9 9.1 -10.9 9.1 -1 0 -5.4 -3.5 -9.8 -7.7z m17.7 -175 c3.6 -2.4 4.8 -4.3 5.5 -8.3 1 -5.7 -1.4 -11.1 -6 -13.7 -4.9 -2.8 -8.4 -2.9 -13.4 -0.3 -3.8 1.9 -4.5 2.8 -6.2 8.4 -1.2 4.1 0.8 10.2 4.4 13.2 3.6 3 11.8 3.4 15.7 0.7z"/>
                    <path d="M130.1 304.2 l-7.1 -6.7 0 -48.2 0 -48.2 -5.5 -3.5 c-36.6 -23.5 -23.7 -79.4 19.1 -82.4 6.5 -0.4 17.4 1.2 17.4 2.5 0 0.3 -1.5 3.6 -3.2 7.4 -2.4 5 -3.7 6.6 -4.8 6.2 -0.8 -0.4 -3.6 -0.8 -6.3 -1.1 -4.3 -0.4 -5 -0.1 -8.2 3.1 -2.9 2.9 -3.5 4.2 -3.5 7.9 0 2.4 0.7 5.4 1.6 6.6 2 2.9 6.6 5.2 10.4 5.2 2.6 0 3 0.3 3 2.8 0 4.7 4 17.3 7.6 24.2 1.9 3.6 5.4 8.9 7.9 11.7 l4.6 5.2 -3.1 1.6 c-3.3 1.7 -3.4 2.4 -3 24.1 l0.2 9.1 -5.1 5.8 c-2.8 3.2 -5.1 6.1 -5.1 6.4 0 0.4 2.3 3.1 5 6.1 3 3.3 5 6.4 5 7.8 0 1.3 -1.9 4.3 -4.5 7.1 -2.5 2.6 -4.5 5.4 -4.5 6.1 0 0.7 2 3.5 4.5 6.1 4.4 4.7 4.5 4.9 4.5 11.6 l0 6.7 -7.9 7.8 c-4.5 4.4 -8.8 7.8 -9.9 7.8 -1.1 0 -5.2 -3 -9.1 -6.8z"/>
                    <path d="M254.3 303.8 l-7.3 -7.1 0 -47.9 0 -47.9 -3.5 -2 c-1.9 -1.2 -3.5 -2.2 -3.5 -2.3 0 -0.1 2.1 -2.4 4.8 -5.2 8.2 -8.6 14.1 -22.8 14.2 -34.1 l0 -4.3 4.6 0 c3.9 0 5.1 -0.5 8 -3.4 2.8 -2.8 3.4 -4.2 3.4 -7.6 0 -9.6 -8.1 -14.6 -17.1 -10.6 -1.3 0.6 -2.5 -0.7 -5.3 -6 -3.9 -7.4 -3.8 -7.6 2.4 -9.4 7.4 -2.1 20 -0.5 28.8 3.7 10.4 4.9 20.7 19.4 23.2 32.5 1.5 7.5 0.3 17.7 -3 25.3 -2.7 6.4 -10.5 15.1 -17 19.1 l-6 3.7 0 16.1 0 16.2 -5.5 5.4 -5.5 5.4 5.5 5.6 c7 7.1 7.2 9.3 1 15.9 -2.5 2.6 -4.5 5.5 -4.5 6.2 0 0.8 2 3.5 4.5 5.9 4.5 4.4 4.5 4.4 4.5 11.5 l0 7.2 -7.9 7.6 c-4.3 4.2 -8.7 7.7 -9.7 7.7 -1.1 0 -5.2 -3.2 -9.1 -7.2z"/>
                  </g>
                </svg>
              }
              
              <span class="text-xl font-bold tracking-tight text-brand-text">
                {{ configService.config().brandName }}<span class="text-brand-accent">{{ configService.config().brandSuffix || '' }}</span>
                
              </span>
            </div>

            @if (!configService.config().hideNetworkBadges) {
              <div class="hidden md:flex items-center gap-6 text-sm font-medium text-brand-text-muted">
                <span>Stateless</span>
                <span>Non-Custodial</span>
                <span>Real-time</span>
              </div>
            }
          </div>
        </nav>
      }

      @if (isEmbedded && !hideHeader) {
        <nav class="w-full border-b border-brand-card-border/60 backdrop-blur-md fixed top-0 z-50 bg-brand-bg/80">
          <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            
            <div class="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
              <img [src]="configService.config().logoUrl" [alt]="configService.config().brandName" class="w-7 h-7 object-contain" />
              
              <span class="text-xl font-bold tracking-tight text-brand-text">
                  {{ configService.config().brandName }}<span class="text-brand-accent">{{ configService.config().brandSuffix || '' }}</span>
              </span>
            </div>

            @if (!configService.config().hideNetworkBadges) {
              <div class="hidden md:flex items-center gap-6 text-sm font-medium text-brand-text-muted">
                <span>Stateless</span>
                <span>Non-Custodial</span>
                <span>Real-time</span>
              </div>
            }
          </div>
        </nav>
      }

      <div class="flex-grow" [ngClass]="{ 'pt-20': !isEmbedded || (isEmbedded && !hideHeader) }">
        <router-outlet></router-outlet>
      </div>

      @if (!isEmbedded && !configService.config().hideFooter) {
        <footer class="border-t border-brand-card-border bg-brand-bg py-12 mt-auto relative z-20">
          <div class="max-w-5xl mx-auto px-6">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-10">
              <div class="text-center md:text-left">
                <div class="font-bold text-brand-text text-lg mb-1 flex items-center">
                  {{ configService.config().brandName }}<span class="text-brand-accent">{{ configService.config().brandSuffix || '' }}</span>
                  @if (configService.config().whitelabel && configService.config().useTradeMark) {
                    &nbsp;<span class="text-brand-accent">Signing Room®</span>
                  }
                </div>
                <p class="text-xs text-brand-text-muted">
                  100% Free &bull; Zero Knowledge &bull; Bitcoin Only
                </p>
              </div>

              <div class="flex items-center gap-6">
                <!-- The Donate Button -->
                <button
                  onclick="document.getElementById('donate-modal').classList.remove('hidden')"
                  class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-card border border-brand-card-border hover:border-yellow-500/50 hover:bg-yellow-500/10 transition group text-xs font-medium text-brand-text-muted hover:text-yellow-400">
                  <svg lucideZap class="w-3.5 h-3.5 text-yellow-500 group-hover:fill-yellow-500 transition"></svg>
                  <span>Donate</span>
                </button>

                <!-- The Modal / Popover Overlay -->
                <div id="donate-modal" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                  <div class="bg-brand-card border border-brand-card-border p-6 rounded-2xl max-w-sm w-full mx-4 shadow-2xl relative">
                    
                    <!-- Close Button -->
                    <button 
                      onclick="document.getElementById('donate-modal').classList.add('hidden')"
                      class="absolute top-4 right-4 text-brand-text-muted hover:text-white transition">
                      ✕
                    </button>

                    <div class="text-center">
                      <h3 class="text-lg font-semibold text-white mb-2">Support {{ configService.config().brandName }}</h3>
                      <p class="text-sm text-brand-text-muted mb-6">Scan with any Lightning wallet</p>
                      
                      <!-- QR Code Image -->
                      <div class="bg-white p-2 rounded-xl inline-block mb-6 shadow-sm">
                        <img src="/assets/address.png" alt="Lightning QR Code" class="w-48 h-48 object-contain" />
                      </div>

                      <!-- Lightning Address -->
                      <div class="mb-4">
                        <label class="block text-xs font-medium text-brand-text-muted mb-1 uppercase tracking-wider">Lightning Address</label>
                        <div class="bg-brand-bg text-brand-text px-3 py-2 rounded-lg text-sm font-mono select-all">
                          seancarlin@walletofsatoshi.com
                        </div>
                      </div>

                      <!-- LNURL Fallback -->
                      <div>
                        <label class="block text-xs font-medium text-brand-text-muted mb-1 uppercase tracking-wider">LNURL</label>
                        <div class="bg-brand-bg text-brand-text-muted px-3 py-2 rounded-lg text-[10px] font-mono break-all select-all">
                          lnurl1dp68gurn8ghj7ampd3kx2ar0veekzar0wd5xjtnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhhxetpde3kzunvd9hqmzg7zp
                        </div>
                      </div>
                      
                    </div>
                  </div>
                </div>

                <a
                  href="mailto:support@signingroom.io"
                  class="text-brand-text-muted hover:text-white transition">
                  <svg lucideMail class="w-5 h-5"></svg>
                </a>

                <a
                  href="https://github.com/scarlin90/SigningRoom"
                  target="_blank"
                  class="text-brand-text-muted hover:text-white transition">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="w-5 h-5">
                    <path
                      d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                    <path d="M9 18c-4.51 2-5-2-7-2" />
                  </svg>
                </a>

                <a
                  href="https://x.com/SigningRoom"
                  target="_blank"
                  class="text-brand-text-muted hover:text-white transition">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="w-5 h-5">
                    <path
                      d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
                  </svg>
                </a>

                <a
                  href="https://www.youtube.com/@SigningRoom"
                  target="_blank"
                  class="text-brand-text-muted hover:text-white transition">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="w-5 h-5">
                    <path
                      d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
                    <path d="m10 15 5-3-5-3z" />
                  </svg>
                </a>

                <a
                  href="https://njump.me/npub1a6tk6kcs2p40eumeu2mru4jwqssnhvc8xtupwlpc6l3gymjha03sek436a"
                  target="_blank"
                  class="text-brand-text-muted hover:text-white transition"
                  title="Nostr">
                  <svg lucideGlobe class="w-5 h-5"></svg>
                </a>
              </div>
            </div>

            <div class="border-t border-brand-card-border pt-8">
              <div class="bg-brand-card/30 p-4 rounded-xl border border-brand-card-border/50 mb-6">
                <p class="text-[10px] text-brand-text-muted leading-relaxed text-justify font-mono">
                  <strong>DISCLAIMER OF WARRANTY:</strong> This is free, open-source software
                  released under the
                  <a
                    href="https://www.gnu.org/licenses/agpl-3.0.html"
                    target="_blank"
                    class="underline hover:text-white"
                    >AGPLv3 License</a
                  >. It is provided "as is", without warranty of any kind. <br /><br />
                  <strong>NON-CUSTODIAL:</strong> {{ configService.config().brandName }} is a stateless coordination tool,
                  not a wallet or financial institution. We do not have access to your private keys,
                  funds, or unencrypted transaction data. We do not maintain user accounts or
                  historical logs. <br /><br />
                  <strong>USER RESPONSIBILITY:</strong> You are solely responsible for verifying
                  transaction details (addresses, amounts, fees) on your hardware device screen
                  before signing. The developers assume no liability for lost funds or software
                  errors.
                </p>
              </div>

              <div class="flex flex-col items-center justify-center gap-4">
                <div class="flex flex-col items-center gap-1 text-xs text-brand-text-muted">
                  <div class="flex flex-wrap justify-center items-center gap-x-4">
                    <p>
                      &copy; {{ currentYear }}
                      <strong
                        ><a
                          href="https://statelessresearch.com"
                          target="_blank"
                          class="hover:text-brand-accent transition"
                          >Stateless Research Ltd</a
                        ></strong
                      >
                    </p>
                    @if (configService.config().useTradeMark) {
                      <span class="hidden sm:inline">&bull;</span>
                      <p>Signing Room® is a registered trademark of Stateless Research Ltd.</p>
                    }
                    <span class="hidden sm:inline">&bull;</span>
                    <p>Made for Bitcoiners</p>
                    <span class="hidden sm:inline">&bull;</span>
                    <p>No Tracking / No Cookies</p>
                  </div>
                  <p class="text-[10px] opacity-60">Registered in England & Wales (No. 16990515)</p>
                </div>

                <div class="flex items-center gap-4 opacity-70 hover:opacity-100 transition">
                  <a
                    href="/security.txt"
                    target="_blank"
                    class="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-brand-text-muted hover:text-brand-accent transition group">
                    <svg lucideShield class="w-3 h-3 group-hover:text-brand-accent transition"></svg>
                    Warrant Canary
                  </a>

                  <span class="text-brand-card-border text-[10px]">&bull;</span>

                  <a
                    href="/pgp-key.asc"
                    target="_blank"
                    class="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-brand-text-muted hover:text-brand-accent transition group">
                    <svg lucideKey class="w-3 h-3 group-hover:text-brand-accent transition"></svg>
                    PGP Key
                  </a>
                </div>
              </div>
            </div>
          </div>
        </footer>
      }

      @if (isEmbedded && !configService.config().hideFooter) {
        <div class="w-full py-3 flex justify-center mt-auto pb-4">
          <a
            href="https://signingroom.io?utm_source=widget&utm_medium=embed"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-1.5 text-[11px] font-medium text-brand-text-muted hover:text-brand-accent transition-colors opacity-80 hover:opacity-100">
            <svg lucideShield class="w-3.5 h-3.5"></svg>
            Powered by Signing Room
          </a>
        </div>
      }
  `,
})
export class App implements OnInit {
  isEmbedded = false;
  hideHeader = false;

  readonly currentYear = new Date().getFullYear();

  private router = inject(Router);
  public readonly configService = inject(ConfigService);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private document = inject(DOCUMENT);
  private renderer = inject(Renderer2);

  constructor() {
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0);
      }
    });
  }

  ngOnInit() {
    this.applyBrandMetadata();

    if (typeof window !== 'undefined') {
      this.isEmbedded = window !== window.parent || window !== window.top;

      const urlParams = new URLSearchParams(window.location.search);
      this.hideHeader = urlParams.get('hideHeader') === 'true';

      if (!window.isSecureContext) {
        document.body.innerHTML = `
                <div style="background:#020617; color:#f43f5e; height:100vh; display:flex; flex-direction:column; items-center; justify-content:center; font-family:sans-serif; text-align:center; padding:20px;">
                    <h1 style="margin-bottom:10px;">Security Error</h1>
                    <p>SigningRoom requires a Secure Context (HTTPS).</p>
                    <p style="color:#94a3b8; font-size:14px;">The Web Cryptography API is disabled in insecure environments.</p>
                </div>
            `;
        throw new Error('Insecure Context - Crypto API disabled');
      }
    }
  }

  private applyBrandMetadata() {
    const config = this.configService.config();
    const brandFullName = config.brandName + (config.brandSuffix ? config.brandSuffix : '');

    const pageTitle = `${brandFullName} | ${config.tagline || 'Real-Time Multisig Coordinator'}`;
    const pageDesc =
      config.subTagline || 'The stateless, zero-knowledge Bitcoin multisig coordinator.';

    this.titleService.setTitle(pageTitle);
    this.metaService.updateTag({ name: 'description', content: pageDesc });

    if (config.brandColorHex) {
      this.metaService.updateTag({ name: 'theme-color', content: config.brandColorHex });
    }

    this.metaService.updateTag({ property: 'og:title', content: pageTitle });
    this.metaService.updateTag({ property: 'og:description', content: pageDesc });
    this.metaService.updateTag({ property: 'og:site_name', content: brandFullName });

    this.metaService.updateTag({ name: 'twitter:title', content: pageTitle });
    this.metaService.updateTag({ name: 'twitter:description', content: pageDesc });

    // Inject Dynamic JSON-LD Structured Data Safely
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: brandFullName,
      operatingSystem: 'Any',
      applicationCategory: 'FinanceApplication',
      description: pageDesc,
      featureList: [
        'Real-time PSBT Merging',
        'Zero-Knowledge Encryption',
        'Stateless Architecture',
        'Cryptographic Audit Logs',
        'Hardware Wallet Compatibility',
      ],
      url: this.document.defaultView?.location.href || '',
      author: {
        '@type': 'Organization',
        name: config.useTradeMark ? 'Stateless Research Ltd' : brandFullName,
      },
    };

    const script = this.renderer.createElement('script');
    this.renderer.setAttribute(script, 'type', 'application/ld+json');
    this.renderer.setProperty(script, 'text', JSON.stringify(schema));

    this.renderer.appendChild(this.document.head, script);
  }
}

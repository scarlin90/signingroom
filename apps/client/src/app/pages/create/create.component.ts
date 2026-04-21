/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Component, OnInit, signal, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Title, Meta } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { Transaction } from '@scure/btc-signer';
import { base64, hex } from '@scure/base';

import { 
  LucideAngularModule, Zap, Check, Loader2, 
  X, UploadCloud, FileJson, AlertTriangle, Shield, Key, Users,
  Eye, EyeOff,
} from 'lucide-angular';

import { PROTOCOL_VERSION, SocketService } from '../../services/socket/socket.service';
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
    <div class="min-h-screen bg-slate-950 text-white flex flex-col items-center p-6 relative"
        [class.pt-32]="!isEmbedded" [class.pt-6]="isEmbedded">
    @if (viewMode === 'inject') {
          <div class="flex flex-col items-center justify-center h-full min-h-[400px] text-center relative z-10 animate-fade-in">
              
              <div class="flex items-center gap-2 mb-10 opacity-60">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 409 445" class="w-8 h-8 text-emerald-400 fill-current">
                    <g>
                      <path d="M185.5 425.7 c-35.4 -17.3 -72 -43.4 -98.2 -69.9 -31.6 -31.9 -50.3 -62.5 -59.1 -96.8 -5.6 -21.7 -5.7 -23.4 -5.7 -101 0 -66.6 0.1 -71.7 1.8 -75.1 2.3 -4.6 6.1 -6.7 22.2 -12.2 7.2 -2.5 31.9 -11.3 55 -19.7 79.4 -28.7 97.6 -35 100.4 -35 2.8 0 27.5 8.3 53.6 18 21.3 7.9 70.6 25.7 92 33.1 11 3.9 21.4 7.5 23 8.1 4.4 1.6 8.4 5.7 9.5 9.7 1.3 4.9 1.3 136.8 0 148.6 -4.9 42.6 -21.2 76.1 -55.1 113.1 -21 23 -49.7 46 -79.4 63.9 -15.9 9.6 -40.1 21.5 -43.6 21.5 -2.1 0 -8.2 -2.3 -16.4 -6.3z m24.6 -28.8 c31.4 -15.7 71.7 -45.6 92 -68 26.9 -29.8 39.3 -52 47.2 -84.4 2.1 -8.8 2.2 -10.3 2.2 -76.9 l0 -67.9 -17 -6.2 c-48.5 -17.7 -84.6 -30.6 -116 -41.6 l-16.9 -6 -20.1 7.1 c-11 4 -26.5 9.6 -34.5 12.5 -8 2.9 -18.3 6.7 -23 8.3 -11.6 4 -36.2 12.9 -43.5 15.7 -3.3 1.3 -10.9 4 -17 6.1 -6 2.1 -11.2 4.1 -11.5 4.5 -1 1.4 -1 113.3 -0.1 124.9 0.5 6.3 1.7 15.1 2.6 19.5 10.6 52.1 52.2 101.4 119 141 11.4 6.8 27 15.3 28.3 15.5 0.1 0 3.9 -1.8 8.3 -4.1z"/>
                      <path d="M191.3 318.3 c-7.6 -7.4 -8.1 -8.1 -8.6 -12.8 -0.2 -2.7 -0.5 -27.9 -0.6 -55.9 0 -28 -0.2 -51 -0.3 -51.1 -0.2 -0.1 -2.5 -1.4 -5.1 -2.9 -7 -4 -11.1 -8 -16.1 -15.4 -5.9 -8.9 -8.6 -17.5 -8.6 -27.1 0 -27 19.5 -48.5 45.9 -50.7 13 -1.1 26.1 3.5 36.6 12.9 19.8 17.6 21.8 50.3 4.4 70.1 -4.1 4.6 -14.8 12.6 -16.8 12.6 -0.7 0 -1.1 6.3 -1.1 19 l0 19 -6.1 6.6 -6 6.7 6 6.1 c8.2 8.3 8.2 10.1 0 18.3 l-6 6 6 5.8 6.1 5.8 0 8.3 0 8.2 -9 9.1 c-5 5 -9.9 9.1 -10.9 9.1 -1 0 -5.4 -3.5 -9.8 -7.7z m17.7 -175 c3.6 -2.4 4.8 -4.3 5.5 -8.3 1 -5.7 -1.4 -11.1 -6 -13.7 -4.9 -2.8 -8.4 -2.9 -13.4 -0.3 -3.8 1.9 -4.5 2.8 -6.2 8.4 -1.2 4.1 0.8 10.2 4.4 13.2 3.6 3 11.8 3.4 15.7 0.7z"/>
                      <path d="M130.1 304.2 l-7.1 -6.7 0 -48.2 0 -48.2 -5.5 -3.5 c-36.6 -23.5 -23.7 -79.4 19.1 -82.4 6.5 -0.4 17.4 1.2 17.4 2.5 0 0.3 -1.5 3.6 -3.2 7.4 -2.4 5 -3.7 6.6 -4.8 6.2 -0.8 -0.4 -3.6 -0.8 -6.3 -1.1 -4.3 -0.4 -5 -0.1 -8.2 3.1 -2.9 2.9 -3.5 4.2 -3.5 7.9 0 2.4 0.7 5.4 1.6 6.6 2 2.9 6.6 5.2 10.4 5.2 2.6 0 3 0.3 3 2.8 0 4.7 4 17.3 7.6 24.2 1.9 3.6 5.4 8.9 7.9 11.7 l4.6 5.2 -3.1 1.6 c-3.3 1.7 -3.4 2.4 -3 24.1 l0.2 9.1 -5.1 5.8 c-2.8 3.2 -5.1 6.1 -5.1 6.4 0 0.4 2.3 3.1 5 6.1 3 3.3 5 6.4 5 7.8 0 1.3 -1.9 4.3 -4.5 7.1 -2.5 2.6 -4.5 5.4 -4.5 6.1 0 0.7 2 3.5 4.5 6.1 4.4 4.7 4.5 4.9 4.5 11.6 l0 6.7 -7.9 7.8 c-4.5 4.4 -8.8 7.8 -9.9 7.8 -1.1 0 -5.2 -3 -9.1 -6.8z"/>
                      <path d="M254.3 303.8 l-7.3 -7.1 0 -47.9 0 -47.9 -3.5 -2 c-1.9 -1.2 -3.5 -2.2 -3.5 -2.3 0 -0.1 2.1 -2.4 4.8 -5.2 8.2 -8.6 14.1 -22.8 14.2 -34.1 l0 -4.3 4.6 0 c3.9 0 5.1 -0.5 8 -3.4 2.8 -2.8 3.4 -4.2 3.4 -7.6 0 -9.6 -8.1 -14.6 -17.1 -10.6 -1.3 0.6 -2.5 -0.7 -5.3 -6 -3.9 -7.4 -3.8 -7.6 2.4 -9.4 7.4 -2.1 20 -0.5 28.8 3.7 10.4 4.9 20.7 19.4 23.2 32.5 1.5 7.5 0.3 17.7 -3 25.3 -2.7 6.4 -10.5 15.1 -17 19.1 l-6 3.7 0 16.1 0 16.2 -5.5 5.4 -5.5 5.4 5.5 5.6 c7 7.1 7.2 9.3 1 15.9 -2.5 2.6 -4.5 5.5 -4.5 6.2 0 0.8 2 3.5 4.5 5.9 4.5 4.4 4.5 4.4 4.5 11.5 l0 7.2 -7.9 7.6 c-4.3 4.2 -8.7 7.7 -9.7 7.7 -1.1 0 -5.2 -3.2 -9.1 -7.2z"/>
                    </g>
                  </svg>
                  <h3 class="text-2xl font-bold text-white tracking-tight">Signing Room®<span class="text-emerald-400">.io</span></h3>
              </div>

              <lucide-icon [img]="Loader2" class="w-12 h-12 text-emerald-500 animate-spin mb-6"></lucide-icon>
              <h2 class="text-2xl font-bold text-white mb-2 tracking-tight">Waiting for Data...</h2>
              <p class="text-slate-400 text-sm max-w-sm">Please initialize the signing ceremony or pass the transaction payload from your host application.</p>
          </div>
      } 
      @else {
    @if (!isEmbedded) {
        <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div class="max-w-3xl w-full text-center mb-12 relative z-10">
        <div class="flex justify-center mb-6">
           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 409 445" class="w-16 h-16 text-emerald-400 fill-current drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">
              <g>
                <path d="M185.5 425.7 c-35.4 -17.3 -72 -43.4 -98.2 -69.9 -31.6 -31.9 -50.3 -62.5 -59.1 -96.8 -5.6 -21.7 -5.7 -23.4 -5.7 -101 0 -66.6 0.1 -71.7 1.8 -75.1 2.3 -4.6 6.1 -6.7 22.2 -12.2 7.2 -2.5 31.9 -11.3 55 -19.7 79.4 -28.7 97.6 -35 100.4 -35 2.8 0 27.5 8.3 53.6 18 21.3 7.9 70.6 25.7 92 33.1 11 3.9 21.4 7.5 23 8.1 4.4 1.6 8.4 5.7 9.5 9.7 1.3 4.9 1.3 136.8 0 148.6 -4.9 42.6 -21.2 76.1 -55.1 113.1 -21 23 -49.7 46 -79.4 63.9 -15.9 9.6 -40.1 21.5 -43.6 21.5 -2.1 0 -8.2 -2.3 -16.4 -6.3z m24.6 -28.8 c31.4 -15.7 71.7 -45.6 92 -68 26.9 -29.8 39.3 -52 47.2 -84.4 2.1 -8.8 2.2 -10.3 2.2 -76.9 l0 -67.9 -17 -6.2 c-48.5 -17.7 -84.6 -30.6 -116 -41.6 l-16.9 -6 -20.1 7.1 c-11 4 -26.5 9.6 -34.5 12.5 -8 2.9 -18.3 6.7 -23 8.3 -11.6 4 -36.2 12.9 -43.5 15.7 -3.3 1.3 -10.9 4 -17 6.1 -6 2.1 -11.2 4.1 -11.5 4.5 -1 1.4 -1 113.3 -0.1 124.9 0.5 6.3 1.7 15.1 2.6 19.5 10.6 52.1 52.2 101.4 119 141 11.4 6.8 27 15.3 28.3 15.5 0.1 0 3.9 -1.8 8.3 -4.1z"/>
                <path d="M191.3 318.3 c-7.6 -7.4 -8.1 -8.1 -8.6 -12.8 -0.2 -2.7 -0.5 -27.9 -0.6 -55.9 0 -28 -0.2 -51 -0.3 -51.1 -0.2 -0.1 -2.5 -1.4 -5.1 -2.9 -7 -4 -11.1 -8 -16.1 -15.4 -5.9 -8.9 -8.6 -17.5 -8.6 -27.1 0 -27 19.5 -48.5 45.9 -50.7 13 -1.1 26.1 3.5 36.6 12.9 19.8 17.6 21.8 50.3 4.4 70.1 -4.1 4.6 -14.8 12.6 -16.8 12.6 -0.7 0 -1.1 6.3 -1.1 19 l0 19 -6.1 6.6 -6 6.7 6 6.1 c8.2 8.3 8.2 10.1 0 18.3 l-6 6 6 5.8 6.1 5.8 0 8.3 0 8.2 -9 9.1 c-5 5 -9.9 9.1 -10.9 9.1 -1 0 -5.4 -3.5 -9.8 -7.7z m17.7 -175 c3.6 -2.4 4.8 -4.3 5.5 -8.3 1 -5.7 -1.4 -11.1 -6 -13.7 -4.9 -2.8 -8.4 -2.9 -13.4 -0.3 -3.8 1.9 -4.5 2.8 -6.2 8.4 -1.2 4.1 0.8 10.2 4.4 13.2 3.6 3 11.8 3.4 15.7 0.7z"/>
                <path d="M130.1 304.2 l-7.1 -6.7 0 -48.2 0 -48.2 -5.5 -3.5 c-36.6 -23.5 -23.7 -79.4 19.1 -82.4 6.5 -0.4 17.4 1.2 17.4 2.5 0 0.3 -1.5 3.6 -3.2 7.4 -2.4 5 -3.7 6.6 -4.8 6.2 -0.8 -0.4 -3.6 -0.8 -6.3 -1.1 -4.3 -0.4 -5 -0.1 -8.2 3.1 -2.9 2.9 -3.5 4.2 -3.5 7.9 0 2.4 0.7 5.4 1.6 6.6 2 2.9 6.6 5.2 10.4 5.2 2.6 0 3 0.3 3 2.8 0 4.7 4 17.3 7.6 24.2 1.9 3.6 5.4 8.9 7.9 11.7 l4.6 5.2 -3.1 1.6 c-3.3 1.7 -3.4 2.4 -3 24.1 l0.2 9.1 -5.1 5.8 c-2.8 3.2 -5.1 6.1 -5.1 6.4 0 0.4 2.3 3.1 5 6.1 3 3.3 5 6.4 5 7.8 0 1.3 -1.9 4.3 -4.5 7.1 -2.5 2.6 -4.5 5.4 -4.5 6.1 0 0.7 2 3.5 4.5 6.1 4.4 4.7 4.5 4.9 4.5 11.6 l0 6.7 -7.9 7.8 c-4.5 4.4 -8.8 7.8 -9.9 7.8 -1.1 0 -5.2 -3 -9.1 -6.8z"/>
                <path d="M254.3 303.8 l-7.3 -7.1 0 -47.9 0 -47.9 -3.5 -2 c-1.9 -1.2 -3.5 -2.2 -3.5 -2.3 0 -0.1 2.1 -2.4 4.8 -5.2 8.2 -8.6 14.1 -22.8 14.2 -34.1 l0 -4.3 4.6 0 c3.9 0 5.1 -0.5 8 -3.4 2.8 -2.8 3.4 -4.2 3.4 -7.6 0 -9.6 -8.1 -14.6 -17.1 -10.6 -1.3 0.6 -2.5 -0.7 -5.3 -6 -3.9 -7.4 -3.8 -7.6 2.4 -9.4 7.4 -2.1 20 -0.5 28.8 3.7 10.4 4.9 20.7 19.4 23.2 32.5 1.5 7.5 0.3 17.7 -3 25.3 -2.7 6.4 -10.5 15.1 -17 19.1 l-6 3.7 0 16.1 0 16.2 -5.5 5.4 -5.5 5.4 5.5 5.6 c7 7.1 7.2 9.3 1 15.9 -2.5 2.6 -4.5 5.5 -4.5 6.2 0 0.8 2 3.5 4.5 5.9 4.5 4.4 4.5 4.4 4.5 11.5 l0 7.2 -7.9 7.6 c-4.3 4.2 -8.7 7.7 -9.7 7.7 -1.1 0 -5.2 -3.2 -9.1 -7.2z"/>
              </g>
           </svg>
        </div>
        <h1 class="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
          Launch a <span class="text-emerald-400">Signing Room®</span>
        </h1>
        <p class="text-slate-400 text-lg">The secure coordination layer for Bitcoin multisig ceremonies.</p>
      </div>

      <div class="w-full relative z-10 flex justify-center max-w-xl"> 
        <div class="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 flex flex-col hover:border-emerald-500/30 transition-all group w-full shadow-2xl">
            
            <div class="flex items-center gap-5 mb-8">
                <div class="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 shrink-0 group-hover:scale-110 transition-transform duration-300">
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 409 445" class="w-8 h-8 text-emerald-400 fill-current">
                      <g>
                        <path d="M185.5 425.7 c-35.4 -17.3 -72 -43.4 -98.2 -69.9 -31.6 -31.9 -50.3 -62.5 -59.1 -96.8 -5.6 -21.7 -5.7 -23.4 -5.7 -101 0 -66.6 0.1 -71.7 1.8 -75.1 2.3 -4.6 6.1 -6.7 22.2 -12.2 7.2 -2.5 31.9 -11.3 55 -19.7 79.4 -28.7 97.6 -35 100.4 -35 2.8 0 27.5 8.3 53.6 18 21.3 7.9 70.6 25.7 92 33.1 11 3.9 21.4 7.5 23 8.1 4.4 1.6 8.4 5.7 9.5 9.7 1.3 4.9 1.3 136.8 0 148.6 -4.9 42.6 -21.2 76.1 -55.1 113.1 -21 23 -49.7 46 -79.4 63.9 -15.9 9.6 -40.1 21.5 -43.6 21.5 -2.1 0 -8.2 -2.3 -16.4 -6.3z m24.6 -28.8 c31.4 -15.7 71.7 -45.6 92 -68 26.9 -29.8 39.3 -52 47.2 -84.4 2.1 -8.8 2.2 -10.3 2.2 -76.9 l0 -67.9 -17 -6.2 c-48.5 -17.7 -84.6 -30.6 -116 -41.6 l-16.9 -6 -20.1 7.1 c-11 4 -26.5 9.6 -34.5 12.5 -8 2.9 -18.3 6.7 -23 8.3 -11.6 4 -36.2 12.9 -43.5 15.7 -3.3 1.3 -10.9 4 -17 6.1 -6 2.1 -11.2 4.1 -11.5 4.5 -1 1.4 -1 113.3 -0.1 124.9 0.5 6.3 1.7 15.1 2.6 19.5 10.6 52.1 52.2 101.4 119 141 11.4 6.8 27 15.3 28.3 15.5 0.1 0 3.9 -1.8 8.3 -4.1z"/>
                        <path d="M191.3 318.3 c-7.6 -7.4 -8.1 -8.1 -8.6 -12.8 -0.2 -2.7 -0.5 -27.9 -0.6 -55.9 0 -28 -0.2 -51 -0.3 -51.1 -0.2 -0.1 -2.5 -1.4 -5.1 -2.9 -7 -4 -11.1 -8 -16.1 -15.4 -5.9 -8.9 -8.6 -17.5 -8.6 -27.1 0 -27 19.5 -48.5 45.9 -50.7 13 -1.1 26.1 3.5 36.6 12.9 19.8 17.6 21.8 50.3 4.4 70.1 -4.1 4.6 -14.8 12.6 -16.8 12.6 -0.7 0 -1.1 6.3 -1.1 19 l0 19 -6.1 6.6 -6 6.7 6 6.1 c8.2 8.3 8.2 10.1 0 18.3 l-6 6 6 5.8 6.1 5.8 0 8.3 0 8.2 -9 9.1 c-5 5 -9.9 9.1 -10.9 9.1 -1 0 -5.4 -3.5 -9.8 -7.7z m17.7 -175 c3.6 -2.4 4.8 -4.3 5.5 -8.3 1 -5.7 -1.4 -11.1 -6 -13.7 -4.9 -2.8 -8.4 -2.9 -13.4 -0.3 -3.8 1.9 -4.5 2.8 -6.2 8.4 -1.2 4.1 0.8 10.2 4.4 13.2 3.6 3 11.8 3.4 15.7 0.7z"/>
                        <path d="M130.1 304.2 l-7.1 -6.7 0 -48.2 0 -48.2 -5.5 -3.5 c-36.6 -23.5 -23.7 -79.4 19.1 -82.4 6.5 -0.4 17.4 1.2 17.4 2.5 0 0.3 -1.5 3.6 -3.2 7.4 -2.4 5 -3.7 6.6 -4.8 6.2 -0.8 -0.4 -3.6 -0.8 -6.3 -1.1 -4.3 -0.4 -5 -0.1 -8.2 3.1 -2.9 2.9 -3.5 4.2 -3.5 7.9 0 2.4 0.7 5.4 1.6 6.6 2 2.9 6.6 5.2 10.4 5.2 2.6 0 3 0.3 3 2.8 0 4.7 4 17.3 7.6 24.2 1.9 3.6 5.4 8.9 7.9 11.7 l4.6 5.2 -3.1 1.6 c-3.3 1.7 -3.4 2.4 -3 24.1 l0.2 9.1 -5.1 5.8 c-2.8 3.2 -5.1 6.1 -5.1 6.4 0 0.4 2.3 3.1 5 6.1 3 3.3 5 6.4 5 7.8 0 1.3 -1.9 4.3 -4.5 7.1 -2.5 2.6 -4.5 5.4 -4.5 6.1 0 0.7 2 3.5 4.5 6.1 4.4 4.7 4.5 4.9 4.5 11.6 l0 6.7 -7.9 7.8 c-4.5 4.4 -8.8 7.8 -9.9 7.8 -1.1 0 -5.2 -3 -9.1 -6.8z"/>
                        <path d="M254.3 303.8 l-7.3 -7.1 0 -47.9 0 -47.9 -3.5 -2 c-1.9 -1.2 -3.5 -2.2 -3.5 -2.3 0 -0.1 2.1 -2.4 4.8 -5.2 8.2 -8.6 14.1 -22.8 14.2 -34.1 l0 -4.3 4.6 0 c3.9 0 5.1 -0.5 8 -3.4 2.8 -2.8 3.4 -4.2 3.4 -7.6 0 -9.6 -8.1 -14.6 -17.1 -10.6 -1.3 0.6 -2.5 -0.7 -5.3 -6 -3.9 -7.4 -3.8 -7.6 2.4 -9.4 7.4 -2.1 20 -0.5 28.8 3.7 10.4 4.9 20.7 19.4 23.2 32.5 1.5 7.5 0.3 17.7 -3 25.3 -2.7 6.4 -10.5 15.1 -17 19.1 l-6 3.7 0 16.1 0 16.2 -5.5 5.4 -5.5 5.4 5.5 5.6 c7 7.1 7.2 9.3 1 15.9 -2.5 2.6 -4.5 5.5 -4.5 6.2 0 0.8 2 3.5 4.5 5.9 4.5 4.4 4.5 4.4 4.5 11.5 l0 7.2 -7.9 7.6 c-4.3 4.2 -8.7 7.7 -9.7 7.7 -1.1 0 -5.2 -3.2 -9.1 -7.2z"/>
                      </g>
                   </svg>
                </div>
                <div>
                    <h3 class="text-2xl font-bold text-white tracking-tight">Signing Room®<span class="text-emerald-400">.io</span></h3>
                    <div class="text-emerald-500/60 text-xs font-mono uppercase tracking-widest">Multi-Signature Consensus</div>
                </div>
            </div>

            <ul class="space-y-4 mb-10 flex-grow">
                <li class="flex items-center gap-3 text-slate-300">
                  <lucide-icon [img]="Check" class="w-5 h-5 text-emerald-500"></lucide-icon> 
                  <span>Stateless Blind Relay (RAM-Only)</span>
                </li>
                <li class="flex items-center gap-3 text-slate-300">
                  <lucide-icon [img]="Check" class="w-5 h-5 text-emerald-500"></lucide-icon> 
                  <span>End-to-End AES-GCM Encryption</span>
                </li>
                <li class="flex items-center gap-3 text-slate-300">
                  <lucide-icon [img]="Check" class="w-5 h-5 text-emerald-500"></lucide-icon> 
                  <span>Ceremony Audit Logs</span>
                </li>
            </ul>
            
            <button (click)="showCreateModal.set(true)" class="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 group/btn">
                <lucide-icon [img]="Shield" class="w-4 h-4 fill-slate-950 group-hover/btn:scale-125 transition-transform"></lucide-icon>
                <span>Launch Signing Room®</span>
            </button>
        </div>
      </div>
    }

    @if (isEmbedded) {
        <div class="w-full max-w-xl z-10 animate-fade-in">
            
            @if (psbtAnalysis()) {
                <div class="bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl">
                    <div class="flex items-center gap-3 mb-6">
                        <lucide-icon [img]="Shield" class="w-6 h-6 text-emerald-400"></lucide-icon>
                        <h3 class="text-white font-bold text-xl">Confirm Ceremony</h3>
                    </div>

                    <div class="bg-slate-950 border border-slate-800 rounded-xl p-5 mb-6">
                        <div class="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">Total Amount</div>
                        <div class="text-3xl font-bold text-white mb-4">{{ psbtAnalysis()?.amountBtc }} <span class="text-slate-600 text-lg">BTC</span></div>
                        
                        <div class="grid grid-cols-2 gap-4">
                            <div class="text-sm">
                                <span class="text-slate-500 block">Signers</span>
                                <span class="text-white font-bold">{{ psbtAnalysis()?.signerCount }} Required</span>
                            </div>
                            <div class="text-sm">
                                <span class="text-slate-500 block">Network</span>
                                <span class="text-emerald-400 font-bold capitalize">{{ selectedNetwork() }}</span>
                            </div>
                        </div>
                    </div>

                    <button (click)="launchRoom()" [disabled]="isLoading()" class="w-full py-4 bg-emerald-500 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2">
                        @if (isLoading()) { <lucide-icon [img]="Loader2" class="w-4 h-4 animate-spin"></lucide-icon> }
                        {{ isLoading() ? 'Securing Room...' : 'Start Signing Ceremony' }}
                    </button>
                    <button (click)="clearPsbt()" class="w-full mt-3 text-xs text-slate-500 hover:text-white transition">Cancel and go back</button>
                </div>
            }

            @else {
                <div class="w-full relative z-10 flex justify-center max-w-xl"> 
                    <div class="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 flex flex-col hover:border-emerald-500/30 transition-all group w-full shadow-2xl">
                        
                        <div class="flex items-center gap-5 mb-8">
                            <div class="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 shrink-0 group-hover:scale-110 transition-transform duration-300">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 409 445" class="w-8 h-8 text-emerald-400 fill-current">
                                <g>
                                    <path d="M185.5 425.7 c-35.4 -17.3 -72 -43.4 -98.2 -69.9 -31.6 -31.9 -50.3 -62.5 -59.1 -96.8 -5.6 -21.7 -5.7 -23.4 -5.7 -101 0 -66.6 0.1 -71.7 1.8 -75.1 2.3 -4.6 6.1 -6.7 22.2 -12.2 7.2 -2.5 31.9 -11.3 55 -19.7 79.4 -28.7 97.6 -35 100.4 -35 2.8 0 27.5 8.3 53.6 18 21.3 7.9 70.6 25.7 92 33.1 11 3.9 21.4 7.5 23 8.1 4.4 1.6 8.4 5.7 9.5 9.7 1.3 4.9 1.3 136.8 0 148.6 -4.9 42.6 -21.2 76.1 -55.1 113.1 -21 23 -49.7 46 -79.4 63.9 -15.9 9.6 -40.1 21.5 -43.6 21.5 -2.1 0 -8.2 -2.3 -16.4 -6.3z m24.6 -28.8 c31.4 -15.7 71.7 -45.6 92 -68 26.9 -29.8 39.3 -52 47.2 -84.4 2.1 -8.8 2.2 -10.3 2.2 -76.9 l0 -67.9 -17 -6.2 c-48.5 -17.7 -84.6 -30.6 -116 -41.6 l-16.9 -6 -20.1 7.1 c-11 4 -26.5 9.6 -34.5 12.5 -8 2.9 -18.3 6.7 -23 8.3 -11.6 4 -36.2 12.9 -43.5 15.7 -3.3 1.3 -10.9 4 -17 6.1 -6 2.1 -11.2 4.1 -11.5 4.5 -1 1.4 -1 113.3 -0.1 124.9 0.5 6.3 1.7 15.1 2.6 19.5 10.6 52.1 52.2 101.4 119 141 11.4 6.8 27 15.3 28.3 15.5 0.1 0 3.9 -1.8 8.3 -4.1z"/>
                                    <path d="M191.3 318.3 c-7.6 -7.4 -8.1 -8.1 -8.6 -12.8 -0.2 -2.7 -0.5 -27.9 -0.6 -55.9 0 -28 -0.2 -51 -0.3 -51.1 -0.2 -0.1 -2.5 -1.4 -5.1 -2.9 -7 -4 -11.1 -8 -16.1 -15.4 -5.9 -8.9 -8.6 -17.5 -8.6 -27.1 0 -27 19.5 -48.5 45.9 -50.7 13 -1.1 26.1 3.5 36.6 12.9 19.8 17.6 21.8 50.3 4.4 70.1 -4.1 4.6 -14.8 12.6 -16.8 12.6 -0.7 0 -1.1 6.3 -1.1 19 l0 19 -6.1 6.6 -6 6.7 6 6.1 c8.2 8.3 8.2 10.1 0 18.3 l-6 6 6 5.8 6.1 5.8 0 8.3 0 8.2 -9 9.1 c-5 5 -9.9 9.1 -10.9 9.1 -1 0 -5.4 -3.5 -9.8 -7.7z m17.7 -175 c3.6 -2.4 4.8 -4.3 5.5 -8.3 1 -5.7 -1.4 -11.1 -6 -13.7 -4.9 -2.8 -8.4 -2.9 -13.4 -0.3 -3.8 1.9 -4.5 2.8 -6.2 8.4 -1.2 4.1 0.8 10.2 4.4 13.2 3.6 3 11.8 3.4 15.7 0.7z"/>
                                    <path d="M130.1 304.2 l-7.1 -6.7 0 -48.2 0 -48.2 -5.5 -3.5 c-36.6 -23.5 -23.7 -79.4 19.1 -82.4 6.5 -0.4 17.4 1.2 17.4 2.5 0 0.3 -1.5 3.6 -3.2 7.4 -2.4 5 -3.7 6.6 -4.8 6.2 -0.8 -0.4 -3.6 -0.8 -6.3 -1.1 -4.3 -0.4 -5 -0.1 -8.2 3.1 -2.9 2.9 -3.5 4.2 -3.5 7.9 0 2.4 0.7 5.4 1.6 6.6 2 2.9 6.6 5.2 10.4 5.2 2.6 0 3 0.3 3 2.8 0 4.7 4 17.3 7.6 24.2 1.9 3.6 5.4 8.9 7.9 11.7 l4.6 5.2 -3.1 1.6 c-3.3 1.7 -3.4 2.4 -3 24.1 l0.2 9.1 -5.1 5.8 c-2.8 3.2 -5.1 6.1 -5.1 6.4 0 0.4 2.3 3.1 5 6.1 3 3.3 5 6.4 5 7.8 0 1.3 -1.9 4.3 -4.5 7.1 -2.5 2.6 -4.5 5.4 -4.5 6.1 0 0.7 2 3.5 4.5 6.1 4.4 4.7 4.5 4.9 4.5 11.6 l0 6.7 -7.9 7.8 c-4.5 4.4 -8.8 7.8 -9.9 7.8 -1.1 0 -5.2 -3 -9.1 -6.8z"/>
                                    <path d="M254.3 303.8 l-7.3 -7.1 0 -47.9 0 -47.9 -3.5 -2 c-1.9 -1.2 -3.5 -2.2 -3.5 -2.3 0 -0.1 2.1 -2.4 4.8 -5.2 8.2 -8.6 14.1 -22.8 14.2 -34.1 l0 -4.3 4.6 0 c3.9 0 5.1 -0.5 8 -3.4 2.8 -2.8 3.4 -4.2 3.4 -7.6 0 -9.6 -8.1 -14.6 -17.1 -10.6 -1.3 0.6 -2.5 -0.7 -5.3 -6 -3.9 -7.4 -3.8 -7.6 2.4 -9.4 7.4 -2.1 20 -0.5 28.8 3.7 10.4 4.9 20.7 19.4 23.2 32.5 1.5 7.5 0.3 17.7 -3 25.3 -2.7 6.4 -10.5 15.1 -17 19.1 l-6 3.7 0 16.1 0 16.2 -5.5 5.4 -5.5 5.4 5.5 5.6 c7 7.1 7.2 9.3 1 15.9 -2.5 2.6 -4.5 5.5 -4.5 6.2 0 0.8 2 3.5 4.5 5.9 4.5 4.4 4.5 4.4 4.5 11.5 l0 7.2 -7.9 7.6 c-4.3 4.2 -8.7 7.7 -9.7 7.7 -1.1 0 -5.2 -3.2 -9.1 -7.2z"/>
                                </g>
                            </svg>
                            </div>
                            <div>
                                <h3 class="text-2xl font-bold text-white tracking-tight">Signing Room®<span class="text-emerald-400">.io</span></h3>
                                <div class="text-emerald-500/60 text-xs font-mono uppercase tracking-widest">Multi-Signature Consensus</div>
                            </div>
                        </div>
                        
                        <div class="space-y-4">
                            <div>
                                <div class="flex justify-between items-end mb-2">
                                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider">Room ID</label>
                                    <span class="text-[10px] font-mono" 
                                        [class.text-red-400]="manualRoomId.length >= 36" 
                                        [class.text-slate-600]="manualRoomId.length < 36">
                                        {{ manualRoomId.length }} / 36
                                    </span>
                                </div>
                                <div class="relative">
                                    <input [type]="showManualRoomId ? 'text' : 'password'" 
                                        [(ngModel)]="manualRoomId" 
                                        maxlength="36" 
                                        placeholder="Paste Room ID..." 
                                        autocomplete="off" 
                                        data-1p-ignore="true" 
                                        data-lpignore="true" 
                                        data-bwignore="true"
                                        class="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 pr-10 text-white font-mono text-sm outline-none focus:border-emerald-500 transition"/>
                                    <button (click)="showManualRoomId = !showManualRoomId" 
                                        class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition">
                                        <lucide-icon [img]="showManualRoomId ? EyeOff : Eye" class="w-4 h-4"></lucide-icon>
                                    </button>
                                </div>
                            </div>
                            
                            <div>
                                <div class="flex justify-between items-end mb-2">
                                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider">Decryption Key</label>
                                    <span class="text-[10px] font-mono" 
                                        [class.text-red-400]="manualKey.length >= 44" 
                                        [class.text-slate-600]="manualKey.length < 44">
                                        {{ manualKey.length }} / 44
                                    </span>
                                </div>
                                <div class="relative">
                                    <input [type]="showManualKey ? 'text' : 'password'" 
                                        [(ngModel)]="manualKey" 
                                        maxlength="44" 
                                        placeholder="Paste Key..." 
                                        autocomplete="off" 
                                        data-1p-ignore="true" 
                                        data-lpignore="true" 
                                        data-bwignore="true"
                                        class="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 pr-10 text-white font-mono text-sm outline-none focus:border-emerald-500 transition"/>
                                    <button (click)="showManualKey = !showManualKey" 
                                        class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition">
                                        <lucide-icon [img]="showManualKey ? EyeOff : Eye" class="w-4 h-4"></lucide-icon>
                                    </button>
                                </div>
                            </div>
                            <button 
                                (click)="joinRoom()" 
                                [disabled]="manualRoomId.length !== 36 || manualKey.length !== 44" 
                                class="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 group/btn disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-500 disabled:shadow-none">
                                
                                <lucide-icon [img]="Shield" class="w-4 h-4 fill-slate-950 transition-transform"
                                    [class.group-hover/btn:scale-125]="manualRoomId.length === 36 && manualKey.length === 44">
                                </lucide-icon>
                                
                                <span>Enter Signing Room®</span>
                            </button>
                        </div>
                    </div>
                </div>
            }
        </div>
    }
}
    </div>

    @if (showCreateModal()) {
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-fade-in">
        <div class="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-lg w-full relative">
            @if (!isEmbedded) {
                <button (click)="showCreateModal.set(false)" class="absolute top-4 right-4 text-slate-500 hover:text-white">
                    <lucide-icon [img]="X" class="w-5 h-5"></lucide-icon>
                </button>
            }
            <h2 class="text-2xl font-bold text-white mb-6">Configure Signing Room®</h2>

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

                @if (errorMessage()) {
                    <div class="mb-4 p-3 bg-rose-950/30 border border-rose-900/50 rounded-xl flex items-start gap-3 animate-in fade-in zoom-in-95">
                        <lucide-icon [img]="AlertTriangle" class="w-5 h-5 text-rose-500 shrink-0 mt-0.5"></lucide-icon>
                        <div>
                            <div class="text-rose-200 text-xs font-bold mb-1">Parsing Error</div>
                            <p class="text-rose-400 text-[10px]">{{ errorMessage() }}</p>
                        </div>
                    </div>
                }
                
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
                            @if (!isEmbedded) {
                                <button (click)="clearPsbt()" class="text-slate-500 hover:text-rose-400">
                                    <lucide-icon [img]="X" class="w-4 h-4"></lucide-icon>
                                </button>
                            }
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

            <button (click)="launchRoom()" [disabled]="isLoading() || !psbtAnalysis() || isNetworkMismatch()" class="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 group/btn disabled:opacity-50">
                <lucide-icon [img]="isLoading() ? Loader2 : Shield" class="w-4 h-4 fill-slate-950 group-hover/btn:scale-125 transition-transform" [class.animate-spin]="isLoading()"></lucide-icon>
                {{ isLoading() ? 'Creating Ceremony...' : 'Start Signing Ceremony' }}
            </button>
        </div>
    </div>
    }
  `
})
export class CreateComponent implements OnInit {
    readonly Zap = Zap; 
    readonly Check = Check; 
    readonly Loader2 = Loader2; 
    readonly X = X; 
    readonly Shield = Shield;
    readonly UploadCloud = UploadCloud; 
    readonly FileJson = FileJson; 
    readonly AlertTriangle = AlertTriangle;
    readonly Key = Key;
    readonly Users = Users;
    readonly Eye = Eye;
    readonly EyeOff = EyeOff;
    
    public viewMode: 'default' | 'inject' | 'join' = 'default';
    public showManualRoomId = false;
    public showManualKey = false;
    public expectedHost = '';

    private socket = inject(SocketService);
    private encryption = inject(EncryptionService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private titleService = inject(Title);
    private metaService = inject(Meta);

    readonly networks = NETWORKS;
    
    public selectedNetwork = signal<Network>('bitcoin');
    public psbtFile = signal<File | null>(null);
    public psbtAnalysis = signal<PsbtAnalysis | null>(null);
    public rawHex = '';
    public showCreateModal = signal(false);
    public isLoading = signal(false);
    public errorMessage = signal<string | null>(null);

    // --- EMBED PROPERTIES ---
    public isEmbedded = false;
    public manualRoomId = '';
    public manualKey = '';

    @HostListener('window:message', ['$event'])
    async onMessage(event: MessageEvent) {

        if (this.expectedHost && event.origin !== this.expectedHost) {
            console.warn(`[Security] Blocked unauthorized postMessage from: ${event.origin}`);
            return;
        }

        if (event.data?.type === 'SIGNING_ROOM_COMMAND') {
            if (event.data.action === 'LOAD_PSBT' && event.data.payload) {

                const hostNetwork = this.route.snapshot.queryParamMap.get('network');
                if (hostNetwork) {
                    this.selectedNetwork.set(hostNetwork as any);
                }

                const payloadString = event.data.payload.trim();

                const dummyFile = new File([payloadString], 'loaded_transaction.psbt.txt', { 
                    type: 'text/plain' 
                });

                let files: any = [dummyFile];
                if (typeof DataTransfer !== 'undefined') {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(dummyFile);
                    files = dataTransfer.files;
                }

                const mockEvent = {
                    target: { files: files },
                    preventDefault: () => {},
                    stopPropagation: () => {}
                };

                await this.onFileSelected(mockEvent as any);
                this.showCreateModal.set(true);
            }
        }
    }

    ngOnInit() {
        this.viewMode = (this.route.snapshot.queryParamMap.get('view') as any) || 'default';

        this.expectedHost = this.route.snapshot.queryParamMap.get('host') || '';

        if (typeof window !== 'undefined') {
            if (!this.expectedHost) {
                this.expectedHost = window.location.origin;
            }

            this.isEmbedded = window !== window.parent || window !== window.top;
            
            if (this.isEmbedded) {
                window.parent.postMessage({
                    type: 'SIGNING_ROOM_EVENT',
                    action: 'WIDGET_READY'
                }, '*');
            }
        }

        this.titleService.setTitle('Signing Room | Free Stateless Multisig');
        this.metaService.updateTag({ name: 'description', content: 'Free, open-source multisig coordination.' });
    }

    clearPsbt() { 
        this.psbtFile.set(null); 
        this.rawHex = ''; 
        this.psbtAnalysis.set(null); 
        this.errorMessage.set(null); 
    }

    async launchRoom() {
        this.isLoading.set(true);
        try {
            const encryptionKey = this.generateEncryptionKey(); 
            const adminSecret = crypto.randomUUID();
            
            const encryptedData = await this.encryption.encrypt(this.rawHex, encryptionKey);
            const encryptedAdminToken = await this.encryption.encrypt(adminSecret, encryptionKey);

            const defaultName = "Untitled Room";
            const encryptedRoomName = await this.encryption.encrypt(defaultName, encryptionKey);

            const roomId = crypto.randomUUID();
            const expectedPass = await this.encryption.blindData(roomId, encryptionKey);

            const res: any = await firstValueFrom(this.socket['http'].post(`${environment.apiUrl}/api/room`, { 
                roomId: roomId, 
                expectedPass: expectedPass,
                encryptedPsbt: encryptedData, 
                adminToken: encryptedAdminToken,
                network: this.selectedNetwork(),
                protocolVersion: PROTOCOL_VERSION,
                encryptedRoomName
            }));

            sessionStorage.setItem(`admin_token_${roomId}`, encryptedAdminToken);

            this.router.navigate(['/room', roomId], { fragment: encryptionKey });
        } catch (e) {
            console.error(e);
        } finally {
            this.isLoading.set(false);
        }
    }

    joinRoom() {
        if (this.manualRoomId && this.manualKey) {
            const cleanKey = this.manualKey.includes('#') ? 
                             this.manualKey.split('#')[1] : this.manualKey;
            
            this.router.navigate(['/room', this.manualRoomId.trim()], { 
                fragment: cleanKey.trim() 
            });
        }
    }

    async onFileSelected(event: any) {
        const file = event.target.files[0];

        if (!file) return;
        
        this.psbtFile.set(file);
        this.errorMessage.set(null);

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
        } catch (e: any) { 
            console.error("PSBT Parse Error:", e);
            this.psbtAnalysis.set(null); 
            
            this.errorMessage.set("Invalid PSBT format. Please ensure you are providing a valid Base64 or Hex encoded Partially Signed Bitcoin Transaction.");
            
            if (this.isEmbedded) {
                window.parent.postMessage({
                    type: 'SIGNING_ROOM_EVENT',
                    action: 'signingError',
                    payload: {
                        code: 'PSBT_INVALID',
                        message: e.message || 'Failed to parse PSBT data.'
                    }
                }, '*');
            } }
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
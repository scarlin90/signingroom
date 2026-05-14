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
  Eye, EyeOff, QrCode, Edit2
} from 'lucide-angular';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

import { PROTOCOL_VERSION, SocketService } from '../../services/socket/socket.service';
import { EncryptionService } from '../../services/encryption/encryption.service';
import { environment } from '../../../environments/environment';
import { UrService } from '../../services/ur/ur.service';

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

            <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
    <h2 class="text-xl font-medium text-white mb-6 flex items-center">
        Transaction Data
    </h2>

    @if (!psbtAnalysis()) {

        @if (errorMessage()) {
            <div class="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                <lucide-icon [img]="AlertTriangle" class="w-5 h-5 text-rose-400 shrink-0"></lucide-icon>
                <div>
                    <h4 class="text-sm font-bold text-rose-300 mb-1">Processing Failed</h4>
                    <p class="text-xs text-rose-200/80 leading-relaxed">{{ errorMessage() }}</p>
                </div>
            </div>
        }

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2 animate-in fade-in duration-300">
            
            <div class="relative group flex flex-col items-center justify-center p-8 bg-slate-950 border-2 border-dashed border-slate-800 rounded-xl hover:border-purple-500/50 hover:bg-purple-500/5 transition-all cursor-pointer" [class.opacity-50]="isScanning()">
                <input type="file" (change)="onFileSelected($event)" accept=".psbt,.txt,.hex" class="absolute inset-0 opacity-0 cursor-pointer z-10" [disabled]="isScanning()">
                <div class="bg-slate-800 p-3 rounded-full mb-3 group-hover:bg-purple-500/20 transition-colors">
                    <lucide-icon [img]="UploadCloud" class="text-slate-400 group-hover:text-purple-400 transition-colors"></lucide-icon>
                </div>
                <span class="text-sm font-medium text-slate-200">Upload PSBT File</span>
                <span class="text-xs text-slate-500 mt-1">.psbt, .txt, or .hex</span>
            </div>

            <button (click)="startScanner()" [disabled]="isScanning()" class="flex flex-col items-center justify-center p-8 bg-slate-950 border-2 border-slate-800 rounded-xl hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group disabled:opacity-50 disabled:cursor-not-allowed">
                <div class="bg-slate-800 p-3 rounded-full mb-3 group-hover:bg-emerald-500/20 transition-colors">
                    <lucide-icon [img]="QrCode" class="text-slate-400 group-hover:text-emerald-400 transition-colors"></lucide-icon>
                </div>
                <span class="text-sm font-medium text-slate-200">Scan QR Code</span>
                <span class="text-xs text-slate-500 mt-1">Air-gapped hardware optics</span>
            </button>
        </div>

        @if (isScanning()) {
            <div class="animate-in fade-in slide-in-from-top-4 duration-300 mt-6 mb-4">
                
                <div class="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 mb-6 flex items-start gap-3">
                <lucide-icon [img]="Shield" class="w-5 h-5 text-emerald-400 shrink-0 mt-0.5"></lucide-icon>
                <div class="text-xs text-emerald-200/80 leading-relaxed space-y-2">
                    <p>
                        <strong>Secure Scanner:</strong> Hold your hardware wallet up to the camera. The scanner automatically detects and reconstructs Standard (UR), Coldcard (BBQr), and Static signatures.
                    </p>
                    <p class="text-[11px] text-emerald-400/90 font-medium bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
                        💡 <strong>Tip:</strong> Sometimes QR codes are too small for webcams to read off a harware device. You can use a mobile companion application like Nunchuk to scan the hardware wallet, and then export the Signed PSBT to your device. You can then scan the QR from Nunchuk on this QR reader.
                    </p>
                </div>
            </div>

                <div class="w-full mb-4 space-y-2">
                    <div class="bg-slate-950 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between">
                        <span class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Raw Optical Feed</span>
                        <span class="text-[10px] text-emerald-400 font-mono truncate max-w-[200px]" [title]="urService.lastScannedText()">
                            {{ urService.lastScannedText() || 'Waiting for QR...' }}
                        </span>
                    </div>
                    
                    @if (urService.scanError()) {
                        <div class="bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5 flex items-start gap-2 animate-in fade-in zoom-in-95 duration-200">
                            <lucide-icon [img]="AlertTriangle" class="w-4 h-4 text-rose-400 shrink-0"></lucide-icon>
                            <span class="text-xs text-rose-300">{{ urService.scanError() }}</span>
                        </div>
                    }
                </div>

                <div class="relative bg-black rounded-xl overflow-hidden border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                    <div id="reader" class="w-full h-72 object-cover"></div>
                    
                    <div class="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center overflow-hidden">
                        <div class="relative w-56 h-56 rounded-xl shadow-[0_0_0_9999px_rgba(2,6,23,0.7)] border border-emerald-500/30">
                            <div class="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-emerald-500 rounded-tl-xl"></div>
                            <div class="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-emerald-500 rounded-tr-xl"></div>
                            <div class="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-emerald-500 rounded-bl-xl"></div>
                            <div class="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-emerald-500 rounded-br-xl"></div>
                            <div class="absolute left-0 right-0 h-[2px] bg-emerald-400 shadow-[0_0_8px_2px_rgba(16,185,129,0.5)] scanner-laser"></div>
                        </div>
                    </div>

                    @if (urService.scanProgress() > 0) {
                        <div class="absolute bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm p-3 border-t border-emerald-500/30 z-20">
                            <div class="flex justify-between text-xs text-emerald-400 font-bold mb-2 tracking-wider">
                                <span>RECONSTRUCTING PSBT...</span>
                                <span>{{ (urService.scanProgress() * 100).toFixed(0) }}%</span>
                            </div>
                            <div class="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                                <div class="bg-emerald-500 h-1.5 rounded-full transition-all duration-200 ease-out" 
                                    [style.width.%]="urService.scanProgress() * 100"></div>
                            </div>
                        </div>
                    }
                    
                    <button (click)="stopScanner()" class="absolute top-4 right-4 z-20 text-slate-400 bg-slate-900/80 hover:text-white hover:bg-red-500/90 p-2.5 rounded-full transition-all backdrop-blur-sm border border-slate-700 hover:border-red-500">
                        <lucide-icon [img]="X" [size]="20"></lucide-icon>
                    </button>
                </div>
            </div>
        }

        <div class="relative flex items-center py-6">
            <div class="flex-grow border-t border-slate-800"></div>
            <span class="flex-shrink-0 mx-4 text-slate-500 text-xs font-medium uppercase tracking-wider">Or paste directly</span>
            <div class="flex-grow border-t border-slate-800"></div>
        </div>

        <div class="relative">
            <textarea 
                class="w-full bg-slate-950/50 border border-slate-800 text-slate-300 rounded-lg p-4 font-mono text-xs focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors resize-none placeholder-slate-600" 
                rows="4" 
                placeholder="Paste raw PSBT Base64 or Hex string here..."
                [(ngModel)]="rawHex" (ngModelChange)="analyzeRawHex($event)"
                [disabled]="isScanning()"></textarea>
            <lucide-icon [img]="Edit2" class="absolute top-4 right-4 text-slate-600 pointer-events-none" [size]="16"></lucide-icon>
        </div>

    } @else {
        <div class="bg-slate-950 border border-slate-800 rounded-xl p-4 animate-in zoom-in-95 duration-300">
            <div class="flex items-start justify-between mb-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
                        <lucide-icon [img]="FileJson" class="w-5 h-5"></lucide-icon>
                    </div>
                    <div>
                        <div class="text-white text-sm font-bold truncate max-w-[150px]">
                            {{ psbtFile()?.name || 'Handled via Optics' }}
                        </div>
                        <div class="text-emerald-500 text-xs font-mono">
                            {{ psbtAnalysis()?.outputCount }} Outputs detected
                        </div>
                    </div>
                </div>
                <button (click)="clearPsbt()" class="text-slate-500 hover:text-rose-400 p-1 rounded-md hover:bg-rose-400/10 transition-colors">
                    <lucide-icon [img]="X" class="w-5 h-5"></lucide-icon>
                </button>
            </div>

            <div class="grid grid-cols-3 gap-2 text-center">
                <div class="bg-slate-900 rounded p-2 border border-slate-800">
                    <div class="text-[10px] text-slate-500 uppercase tracking-tight">Amount</div>
                    <div class="text-white text-xs font-bold">
                        {{ psbtAnalysis()?.amountBtc | number:'1.4-4' }} <span class="text-slate-600">BTC</span>
                    </div>
                </div>
                <div class="bg-slate-900 rounded p-2 border border-slate-800">
                    <div class="text-[10px] text-slate-500 uppercase tracking-tight">Network Fee</div>
                    <div class="text-white text-xs font-bold">
                        {{ psbtAnalysis()?.networkFeeSat | number }} <span class="text-slate-600">sats</span>
                    </div>
                </div>
                <div class="bg-slate-900 rounded p-2 border border-slate-800">
                    <div class="text-[10px] text-slate-500 uppercase tracking-tight">Signers</div>
                    <div class="text-white text-xs font-bold">
                        {{ psbtAnalysis()?.signerCount }} Required
                    </div>
                </div>
            </div>
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
    readonly QrCode = QrCode;
    readonly Edit2 = Edit2;
    
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
    public urService = inject(UrService);

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

    isScanning = signal<boolean>(false);
    public html5QrCode: Html5Qrcode | null = null;

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

            this.rawHex = base64.encode(psbtBytes);

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

    private isProcessingScan = false;

    async startScanner() {
        this.isScanning.set(true);
        this.isProcessingScan = false;
        this.errorMessage.set(null); // Clear old errors
        this.urService.resetDecoder();
        
        setTimeout(async () => {
                    this.html5QrCode = new Html5Qrcode("reader", {
                        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                        verbose: false,
                        experimentalFeatures: {
                            useBarCodeDetectorIfSupported: true
                        }
                    });
                    
                    let frameCount = 0;
        
                    try {
                            await this.html5QrCode.start(
                            { facingMode: "environment" },
                            { 
                                fps: 10,
                                disableFlip: true,
                                qrbox: { width: 350, height: 350 },
                                videoConstraints: {
                                    width: { ideal: 1280 },
                                    height: { ideal: 720 }
                                }
                            },
                            (decodedText) => this.handleScanResult(decodedText),
                            (errorMessage) => { 
                                frameCount++;
                                if (frameCount % 60 === 0) {
                                    console.warn(`[Optical Debug] Frame ${frameCount} - Engine failing to lock:`, errorMessage.split('\n')[0]);
                                }
                            } 
                        );
                    } catch (err) {
                        console.warn("High-res camera start failed. Falling back to standard resolution...", err);
                        
                        try {
                             await this.html5QrCode.start(
                                { facingMode: "environment" },
                                { fps: 10, disableFlip: false },
                                (decodedText) => this.handleScanResult(decodedText),
                                () => { console.error("Fallback camera failed to start.") }
                            );
                        } catch (fallbackErr) {
                            console.error("Fallback camera start also failed:", fallbackErr);
                            this.stopScanner();
                        }
                    }
                }, 100);
            }

    async handleScanResult(decodedText: string) {
        if (this.isProcessingScan) return;

        const upper = decodedText.toUpperCase();
        
        // Route BOTH Fountain Codes (UR) and Coldcard BBQr codes (B$) to the Omni-Decoder
        if (upper.startsWith('UR:') || upper.startsWith('B$')) {
            const fullHex = this.urService.processFragment(decodedText);
            
            if (fullHex) {
                this.isProcessingScan = true;
                await this.safeStopScanner();
                this.analyzeRawHex(fullHex);
                this.isProcessingScan = false;
            }
        } 
        else {
            this.isProcessingScan = true;
            await this.safeStopScanner();
            this.analyzeRawHex(decodedText);
            this.isProcessingScan = false;
        }
    }

    async safeStopScanner() {
        if (this.html5QrCode) {
            try {
                if (this.html5QrCode.getState() === 2) {
                    await this.html5QrCode.stop();
                }
                this.html5QrCode.clear();
            } catch (e) {
                console.error("Camera stop error", e);
            }
        }
        this.isScanning.set(false);
    }

    stopScanner() {
        this.safeStopScanner();
    }
}
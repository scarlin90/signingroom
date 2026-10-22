/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { EditionService } from '../../services/edition/edition.service';
import { LucideAlertTriangle, LucideExternalLink, LucideX } from '@lucide/angular';

@Component({
  selector: 'app-edition-banner',
  standalone: true,
  imports: [CommonModule, LucideAlertTriangle, LucideExternalLink, LucideX],
  template: `
    @if (edition.isCommunity()) {
      @if (isEmbedded) {
        <!-- Compact Footer Badge for Embedded iFrames -->
        <div class="embedded-badge" role="note">
          <span>Powered by 
            <a href="https://signingroom.io" target="_blank" rel="noopener noreferrer">Signing Room® Community Edition</a>
          </span>
          <span class="divider">•</span>
          <a href="https://statelessresearch.com/licensing" target="_blank" rel="noopener noreferrer" class="license-link">
            Commercial License
          </a>
        </div>
      } @else {
        <!-- Mandatory Non-Dismissible Banner for Community Edition -->
        <aside class="edition-banner community" role="alert" aria-label="Community Edition Notice">
          <div class="banner-content">
            <svg lucideAlertTriangle class="banner-icon community-icon"></svg>
            <span class="banner-text">
              <strong>Community Edition:</strong> Uncertified self-hosted node. Audit logs and settlement artifacts will include mandatory non-commercial compliance watermarks.
            </span>
          </div>
          <a 
            href="https://statelessresearch.com/licensing" 
            target="_blank" 
            rel="noopener noreferrer" 
            class="banner-cta"
          >
            <span>Commercial License</span>
            <svg lucideExternalLink class="cta-icon"></svg>
          </a>
        </aside>
      }
    } @else if (edition.showExpirationBanner()) {
      @if (isEmbedded) {
        <!-- Compact Expiry Footer for Embedded iFrames -->
        <div class="embedded-badge expiring" role="note">
          <span>License for {{ edition.licenseeName() }} expires in {{ edition.daysRemaining() }} day{{ edition.daysRemaining() === 1 ? '' : 's' }}</span>
          <span class="divider">•</span>
          <a href="https://statelessresearch.com/licensing" target="_blank" rel="noopener noreferrer" class="license-link">
            Renew
          </a>
        </div>
      } @else {
        <!-- Dismissible Warning Banner for Expiring Commercial Licenses -->
        <aside class="edition-banner expiring" role="alert" aria-label="Commercial License Expiration Warning">
          <div class="banner-content">
            <svg lucideAlertTriangle class="banner-icon expiring-icon"></svg>
            <span class="banner-text">
              <strong>Commercial License Expiring:</strong> The license for <em>{{ edition.licenseeName() }}</em> expires in <strong>{{ edition.daysRemaining() }} day{{ edition.daysRemaining() === 1 ? '' : 's' }}</strong>. Please reach out to Stateless Research to renew.
            </span>
          </div>
          <div class="banner-actions">
            <a 
              href="mailto:enquiries@statelessresearch.com?subject=License%20Renewal%20-%20{{ edition.licenseeName() }}" 
              class="banner-cta expiring-cta"
            >
              <span>Renew License</span>
              <svg lucideExternalLink class="cta-icon"></svg>
            </a>
            <button 
              type="button" 
              class="banner-dismiss" 
              (click)="edition.dismissExpirationWarning()" 
              aria-label="Dismiss expiration warning for 24 hours"
              title="Dismiss for 24 hours"
            >
              <svg lucideX class="dismiss-icon"></svg>
            </button>
          </div>
        </aside>
      }
    }
  `,
  styles: [`
    /* Base Banner */
    .edition-banner {
      padding: 8px 16px;
      font-size: 0.8125rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      z-index: 1000;
      position: relative;
    }

    /* Community Edition Theme (Amber) */
    .edition-banner.community {
      background: linear-gradient(90deg, #78350f 0%, #92400e 100%);
      border-bottom: 1px solid #b45309;
      color: #fef3c7;
    }

    /* Expiring License Theme (Indigo / Gold Accent) */
    .edition-banner.expiring {
      background: linear-gradient(90deg, #1e1b4b 0%, #312e81 100%);
      border-bottom: 1px solid #4338ca;
      color: #e0e7ff;
    }

    .banner-content {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .banner-icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .community-icon {
      color: #f59e0b;
    }

    .expiring-icon {
      color: #fbbf24;
    }

    .banner-text strong {
      color: #ffffff;
      font-weight: 600;
    }

    .banner-text em {
      font-style: normal;
      color: #93c5fd;
    }

    .banner-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .banner-cta {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 4px 10px;
      border-radius: 4px;
      color: #ffffff;
      text-decoration: none;
      font-weight: 500;
      white-space: nowrap;
      transition: background 0.15s ease;
    }

    .banner-cta:hover {
      background: rgba(255, 255, 255, 0.22);
    }

    .expiring-cta {
      background: #4f46e5;
      border-color: #6366f1;
    }

    .expiring-cta:hover {
      background: #4338ca;
    }

    .cta-icon {
      width: 12px;
      height: 12px;
    }

    .banner-dismiss {
      background: transparent;
      border: none;
      color: #a5b4fc;
      padding: 4px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: color 0.15s ease, background 0.15s ease;
    }

    .banner-dismiss:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.1);
    }

    .dismiss-icon {
      width: 14px;
      height: 14px;
    }

    /* Embedded Compact Badge */
    .embedded-badge {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(24, 24, 27, 0.95);
      backdrop-filter: blur(4px);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      color: #a1a1aa;
      font-size: 0.6875rem;
      text-align: center;
      padding: 4px 8px;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .embedded-badge.expiring {
      border-top-color: #4338ca;
      color: #c7d2fe;
    }

    .embedded-badge a {
      color: #10b981;
      text-decoration: none;
      font-weight: 600;
    }

    .embedded-badge.expiring a.license-link {
      color: #818cf8;
      text-decoration: underline;
    }

    .embedded-badge a.license-link {
      color: #71717a;
      text-decoration: underline;
      font-weight: 400;
    }

    .divider {
      color: #3f3f46;
    }

    @media (max-width: 768px) {
      .edition-banner {
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
      }
      .banner-actions {
        align-self: flex-end;
      }
    }
  `]
})
export class EditionBannerComponent {
  public edition = inject(EditionService);
  private route = inject(ActivatedRoute);

  get isEmbedded(): boolean {
    if (typeof window !== 'undefined') {
      return window.self !== window.top || this.route.snapshot.queryParamMap.get('embedded') === 'true';
    }
    return false;
  }
}
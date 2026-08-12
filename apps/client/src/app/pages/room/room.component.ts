/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import {
  Component,
  OnInit,
  signal,
  computed,
  OnDestroy,
  effect,
  Inject,
  PLATFORM_ID,
  HostListener,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import {
  LucideShield,
  LucideUsers,
  LucideCheckCircle,
  LucideLoader2,
  LucideCopy,
  LucideClock,
  LucideArrowRight,
  LucideHash,
  LucideCrown,
  LucideUploadCloud,
  LucideDownloadCloud,
  LucideDownload,
  LucideExternalLink,
  LucideCheck,
  LucideZap,
  LucideAlertTriangle,
  LucidePower,
  LucideX,
  LucideLock,
  LucideUnlock,
  LucideKey,
  LucideRefreshCw,
  LucideAlertOctagon,
  LucideFileKey,
  LucideFileCheck,
  LucideEdit2,
  LucideTag,
  LucideBell,
  LucideInfinity,
  LucideArrowDown,
  LucideBook,
  LucideQrCode,
  LucideEye,
  LucideEyeOff,
  LucideSearch,
  LucideFileText,
  LucideNetwork,
  LucideShieldAlert,
  LucideShieldCheck,
  LucideShieldOff,
} from '@lucide/angular';
import { SocketService } from '../../services/socket/socket.service';
import * as QRCode from 'qrcode';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { UrService } from '../../services/ur/ur.service';
import { base64, hex } from '@scure/base';
import { WidgetDispatcherService } from '../../services/widget-dispatcher/widget-dispatcher.service';
import { PrivacySection, PrivacyState } from '../../models/widget-events.model';
import { EncryptionEngine } from '@signing-room/sdk';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    LucideShield,
    LucideUsers,
    LucideCheckCircle,
    LucideLoader2,
    LucideCopy,
    LucideClock,
    LucideArrowRight,
    LucideHash,
    LucideCrown,
    LucideUploadCloud,
    LucideDownloadCloud,
    LucideDownload,
    LucideExternalLink,
    LucideCheck,
    LucideZap,
    LucideAlertTriangle,
    LucidePower,
    LucideX,
    LucideLock,
    LucideUnlock,
    LucideKey,
    LucideRefreshCw,
    LucideAlertOctagon,
    LucideFileKey,
    LucideFileCheck,
    LucideEdit2,
    LucideTag,
    LucideBell,
    LucideQrCode,
    LucideEye,
    LucideEyeOff,
    LucideSearch,
    LucideNetwork,
    LucideShieldAlert,
    LucideShieldCheck,
    LucideShieldOff,
  ],
  templateUrl: './room.component.html',
  providers: [EncryptionEngine],
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
    this.socket.disconnect();
  }

  // Math is still required for template calculations
  readonly Math = Math;

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

  public timeRemaining = signal('Loading...');
  public isExpired = signal(false);
  public isLowTime = signal(false);
  private timerInterval: any;

  public inputSearchQuery = signal('');
  public outputSearchQuery = signal('');

  public filteredInputs = computed(() => {
    const inputs = this.socket.txDetails()?.inputsList || [];
    const query = this.inputSearchQuery().toLowerCase().trim();
    if (!query) return inputs;
    return inputs.filter((input) => input.address.toLowerCase().includes(query));
  });

  public filteredOutputs = computed(() => {
    const outputs = this.socket.txDetails()?.outputs || [];
    const query = this.outputSearchQuery().toLowerCase().trim();
    if (!query) return outputs;
    return outputs.filter((output) => output.address.toLowerCase().includes(query));
  });

  public showLabelModal = signal(false);
  public showClaimInput = signal(false);

  public showConfirmModal = signal(false);
  public confirmData = signal({
    title: '',
    message: '',
    action: () => {},
    isDestructive: false,
    type: 'confirm' as 'confirm' | 'alert',
  });

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

  private previousSessions: { id: string; role: string; displayName?: string }[] = [];

  public editingFingerprint = signal<string | null>(null);
  public editingLabel = signal('');
  public saveToBook = signal(true);

  private hasEmittedFinalized = false;
  public expectedHost = '';

  public html5QrCode: Html5Qrcode | null = null;
  isScanningSigned = signal<boolean>(false);
  showFountainModal = signal<boolean>(false);
  isFountainRevealed = signal<boolean>(false);
  showScannerModal = signal<boolean>(false);
  copiedAddress = signal<string | null>(null);
  exportFormat = signal<'ur' | 'bbqr'>('ur');
  activeFountainFrames: string[] = [];
  currentFrameIndex = signal<number>(0);
  fountainInterval: any;
  fountainSpeed = signal<number>(400);

  constructor(
    private route: ActivatedRoute,
    public socket: SocketService,
    private router: Router,
    private titleService: Title,
    public urService: UrService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private dispatcher: WidgetDispatcherService,
    private encryptionEngine: EncryptionEngine,
  ) {
    effect(() => {
      const status = this.socket.status();
      const currentFragment = this.route.snapshot.fragment;

      if (status === 'connected' && currentFragment) {
        this.router.navigate([], {
          relativeTo: this.route,
          fragment: undefined,
          replaceUrl: true,
        });
      }
    });

    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      const state = this.socket.roomState();

      if (
        this.socket.isLockedOut() ||
        this.socket.roomNotFound() ||
        this.socket.decryptionError() ||
        this.socket.isRoomFull()
      ) {
        return;
      }

      if (state) {
        if (state.createdAt) this.startTimer(state.expiresAt);
      }

      if (this.socket.isClosed()) {
        if (!this.isEmbedded) {
          this.generateAuditLog();
        }
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
      const signedCount = signers.filter((s) => s.signed).length;
      const threshold = this.requiredSignatures;
      const remaining = Math.max(0, threshold - signedCount);

      // 2. Determine State
      if (this.finalHex()) {
        // Stage 3: Done -> Green (Safe)
        this.titleService.setTitle('✅ Ready to Broadcast | Signing Room');
      } else if (signedCount >= threshold) {
        // Stage 2: Action Needed -> Orange (Alert)
        this.titleService.setTitle('🟠 Ready to Finalize | Signing Room');
      } else if (state?.isLocked) {
        this.titleService.setTitle('🔒 Room Locked | Signing Room');
      } else {
        // Stage 1: Waiting -> Red (Blocked)
        this.titleService.setTitle(`🔴 ${remaining} Needed | Signing Room`);
      }
    });

    // --- PARTICIPANT PRESENCE TRACKER ---
    effect(() => {
      const currentSessions = this.socket.activeSessions();

      if (this.socket.status() === 'connected') {
        const joined = currentSessions.filter(
          (cs) => !this.previousSessions.some((ps) => ps.id === cs.id),
        );
        const left = this.previousSessions.filter(
          (ps) => !currentSessions.some((cs) => cs.id === ps.id),
        );

        // Find users who just changed their display name!
        const nameChanged = currentSessions.filter((cs) => {
          const prev = this.previousSessions.find((ps) => ps.id === cs.id);
          return prev && prev.displayName !== cs.displayName;
        });

        joined.forEach((p) =>
          this.dispatcher.emitParticipantPresence('joined', p.id, p.role, p.displayName),
        );
        left.forEach((p) =>
          this.dispatcher.emitParticipantPresence('left', p.id, p.role, p.displayName),
        );

        nameChanged.forEach((p) => {
          // Only broadcast if it's someone ELSE (our own local save handles 'self')
          if (p.id !== this.socket.currentSessionId()) {
            this.dispatcher.emitParticipantLabelled(
              'participant',
              p.displayName || 'Anonymous',
              undefined,
              p.id,
            );
          }
        });
      }

      this.previousSessions = currentSessions;
    });

    // --- SIGNATURE NETWORK TRACKER ---
    this.socket.networkSignatureReceived$.subscribe((data) => {
      const sessions = this.socket.activeSessions();
      const uploaderSession = sessions.find((s) => s.id === data.sessionId);
      const label = this.socket.roomState()?.signerLabels?.[data.fingerprint];

      this.dispatcher.emitSignatureReceived(
        data.fingerprint,
        label,
        data.sessionId,
        uploaderSession?.displayName,
      );
    });

    this.socket.securityAlert$.subscribe((event) => {
      const severity = event.count >= 3 ? 'high' : 'medium';
      this.dispatcher.emitSecurityAlert(
        event.type,
        severity,
        `Failed decryption attempt ${event.count}/3`,
      );
    });
  }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.route.paramMap.subscribe(async (params) => {
        const id = params.get('id');
        const fragmentKey = this.route.snapshot.fragment;
        const hostParam = this.route.snapshot.queryParamMap.get('host');

        if (hostParam) {
          this.expectedHost = decodeURIComponent(hostParam);

          this.dispatcher.setTargetOrigin(this.expectedHost);
        } else if (typeof window !== 'undefined') {
          this.expectedHost = window.location.origin;
        }

        if (!id) return;
        this.roomId.set(id);

        const isAlreadyConnected = this.socket.status() === 'connected';
        const isCorrectRoom = this.socket.sdk.store.getState()?.roomId === id;

        // DO NOT disconnect if we are already in the correct room!
        if (isAlreadyConnected && isCorrectRoom) {
          return;
        }

        if (fragmentKey) {
          this.socket.setRoomKey(fragmentKey);
          // We only disconnect if we are switching rooms or if connection is dead
          await this.socket.connect(id, fragmentKey);
        } else {
          this.socket.decryptionError.set('Missing decryption key');
        }
      });
    }
  }

  ngOnDestroy() {
    if (isPlatformBrowser(this.platformId)) {
      this.socket.disconnect();
      this.socket.reset();

      if (this.timerInterval) clearInterval(this.timerInterval);
    }
  }

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
    return this.dispatcher.isEmbedded;
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

  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const validExtensions = ['.psbt', '.txt', '.hex', '.base64'];
    const fileName = file.name.toLowerCase();
    if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
      this.openAlert('Invalid File Type', 'Please upload a .psbt, .txt, or .hex file.');
      event.target.value = ''; // Reset input
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      this.openAlert('File Too Large', 'File exceeds 2MB limit. PSBTs are usually much smaller.');
      event.target.value = '';
      return;
    }

    this.isUploading.set(true);

    try {
      const psbtContent = await this.socket.sdk.parsePsbtFile(file);
      await this.socket.uploadSignature(psbtContent);
      this.dispatcher.emitPsbtImported('upload');
      event.target.value = '';
    } catch (e) {
      console.error(e);
      this.openAlert('Read Error', 'Failed to read file.');
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
    a.download = `unsigned_tx_${this.roomId()?.slice(0, 8)}.psbt`;
    a.click();
    window.URL.revokeObjectURL(url);

    this.dispatcher.emitDownloadTriggered('unsigned-psbt');
  }

  async claimRole() {
    if (this.claimPassword) {
      const cleanToken = this.claimPassword.trim();

      // Send the clear token to the relay via WebSocket to claim the room
      this.socket.claimCoordinator(cleanToken);

      const encryptedToken = await this.encryptionEngine.encrypt(
        cleanToken,
        this.socket.getRoomKey() || '',
      );

      sessionStorage.setItem(`admin_token_${this.roomId()}`, encryptedToken);

      this.showClaimInput.set(false);
      this.claimPassword = '';
    }
  }

  closeRoom() {
    this.dispatcher.emitModalView('Close Room Warning');
    this.openConfirm(
      'Close Room',
      'Are you sure you want to close this room? This action cannot be undone and will delete all data immediately.',
      () => {
        if (!this.isEmbedded) {
          this.generateAuditLog();
        }

        this.dispatcher.emitRoomStateChanged('closed');
        setTimeout(() => {
          this.socket.closeRoom();

          if (!this.isEmbedded) {
            this.router.navigate(['/']);
          }
        }, 300);
      },
      true,
    );
  }

  openRenameModal() {
    const currentRoomName = this.socket.roomState()?.roomName;
    this.newRoomName.set(currentRoomName || '');
    this.showRenameModal.set(true);
    this.dispatcher.emitModalView('Rename Room');
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
    this.dispatcher.emitRoomRenamed(name);
    this.closeRenameModal();
  }

  toggleLock() {
    const current = this.socket.roomState()?.isLocked;
    const action = current ? 'Unlock' : 'LOCK';
    this.dispatcher.emitModalView(`${action} Room Warning`);
    this.openConfirm(
      `${action} Room`,
      `Are you sure you want to ${action} this room? ${current ? 'New users will be able to join.' : 'No new users will be able to connect.'}`,
      () => {
        this.socket.toggleLock(!current);
        this.dispatcher.emitRoomStateChanged(!current ? 'locked' : 'unlocked');
      },
      !current,
    );
  }

  openLabelModal(fingerprint: string) {
    const current = this.socket.roomState()?.signerLabels?.[fingerprint] || '';
    const saved = this.socket.getLocalLabel(fingerprint);

    this.editingFingerprint.set(fingerprint);
    this.editingLabel.set(current || saved || '');
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

      this.dispatcher.emitParticipantLabelled('signer', label, fp);
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
    this.openConfirm(
      'Update Whitelist',
      `${isPresent ? 'Remove' : 'Add'} the following address ${isPresent ? 'from' : 'to'} the whitelist?\n\n${address}`,
      () => {
        this.socket.updateWhitelist([address], isPresent);
        this.dispatcher.emitDestinationVerified(this.viewMode(), address, !isPresent);
      },
      false,
    );
  }

  copyAddress(address: string): void {
    if (!address) return;

    navigator.clipboard
      .writeText(address)
      .then(() => {
        this.copiedAddress.set(address);

        const shortAddress = `${address.slice(0, 6)}...${address.slice(-6)}`;

        this.socket.logAction('Address Copied', `${shortAddress}`);

        this.dispatcher.emitAddressCopied(address);

        setTimeout(() => {
          if (this.copiedAddress() === address) {
            this.copiedAddress.set(null);
          }
        }, 2000);
      })
      .catch((err) => {
        console.error('Failed to copy address: ', err);
      });
  }

  openSessionsModal() {
    if (typeof localStorage !== 'undefined') {
      const savedName = localStorage.getItem(`display_name_${this.roomId()}`);
      this.personalDisplayName.set(savedName || '');
    }
    this.showSessionsModal.set(true);
    this.dispatcher.emitModalView('Active Sessions');
  }

  savePersonalName() {
    const name = this.personalDisplayName().trim();
    this.socket.setDisplayName(name);
    this.dispatcher.emitParticipantLabelled('self', name);
    this.showSessionsModal.set(false);
  }

  copySessionId(id: string, displayName?: string) {
    const name = displayName || 'Anonymous Guest';
    const textToCopy = `${name} (Session: ${id})`;

    navigator.clipboard.writeText(textToCopy);
    this.copiedSessionId.set(id);

    this.dispatcher.emitDataCopied('session-id');

    // Reset it after 2 seconds
    setTimeout(() => this.copiedSessionId.set(null), 2000);
  }

  verifyAllInputs() {
    const inputs = this.socket.txDetails()?.inputsList || [];
    if (inputs.length === 0) return;

    const toAdd = inputs.map((i) => i.address).filter((addr) => !this.isWhitelisted(addr));

    if (toAdd.length > 0) {
      this.socket.updateWhitelist(toAdd, false);
      this.dispatcher.emitDestinationVerified('inputs', 'batch', true);
    }
  }

  verifyAllOutputs() {
    const outputs = this.socket.txDetails()?.outputs || [];
    if (outputs.length === 0) return;

    this.openConfirm(
      'Batch Verify Outputs',
      `Are you sure you want to verify all ${outputs.length} outputs?`,
      () => {
        const toAdd = outputs.map((o) => o.address).filter((addr) => !this.isWhitelisted(addr));

        if (toAdd.length > 0) {
          this.socket.updateWhitelist(toAdd, false);
          this.dispatcher.emitDestinationVerified('outputs', 'batch', true);
        }
      },
      false,
    );
  }

  setViewMode(mode: 'inputs' | 'outputs') {
    this.viewMode.set(mode);
    this.dispatcher.emitTransactionViewChanged(mode);
  }

  updateSearchQuery(view: 'inputs' | 'outputs', query: string) {
    if (view === 'inputs') {
      this.inputSearchQuery.set(query);
    } else {
      this.outputSearchQuery.set(query);
    }
  }

  async finalize() {
    if (this.isExpired()) return;

    // Capture initial state just for the whitelist check
    const initialState = this.socket.roomState();

    const doFinalize = async () => {
      try {
        // Await the finalization FIRST. The SDK returns the hex and txId.
        const finalized = await this.socket.finalizeTransaction();

        if (finalized) {
          // Fetch the FRESH state now that finalization is complete
          const freshState = this.socket.roomState();

          if (
            freshState &&
            freshState.finalTxId &&
            freshState.finalTxHex &&
            this.isEmbedded &&
            this.socket.isCoordinator() &&
            !this.hasEmittedFinalized
          ) {
            this.hasEmittedFinalized = true;

            const sanitizedState = { ...freshState } as any;
            delete sanitizedState.expectedPass;

            const pdfData = await this.getPdfDocument();
            const pdfBase64 = pdfData ? pdfData.doc.output('datauristring') : null;

            // Emit using the fresh state
            this.dispatcher.emitTransactionFinalized({
              txId: freshState.finalTxId,
              txHex: freshState.finalTxHex,
              roomState: sanitizedState,
              auditLogCsv: this.socket.getAuditLogCsv(),
              settlementCsv: this.socket.getSettlementCsvData(),
              auditPdfUri: pdfBase64,
            });
          }

          this.triggerConfetti();
        }
      } catch (e) {
        console.error('Failed to finalize transaction', e);
      }
    };

    // Whitelist check uses the initialState captured at the top
    if (initialState?.whitelist && initialState.whitelist.length > 0) {
      const outputs = this.socket.txDetails()?.outputs || [];

      const unverified = outputs.filter((out) => {
        if (out.isChange) return false;
        if (initialState.whitelist.includes(out.address)) return false;
        return true;
      });

      if (unverified.length > 0) {
        this.openConfirm(
          'Security Warning',
          `You are sending funds to ${unverified.length} unverified address(es). Are you sure you want to proceed?`,
          () => doFinalize(),
          true,
        );
        return;
      }
    }

    await doFinalize();
  }

  broadcastAndCopy() {
    if (this.finalHex()) {
      navigator.clipboard.writeText(this.finalHex()!);

      const rawNet = this.socket.roomState()?.network;
      const allowed = ['bitcoin', 'testnet', 'signet'];
      const net = allowed.includes(rawNet || '') ? rawNet : 'bitcoin';

      const baseUrl =
        net === 'bitcoin'
          ? 'https://mempool.space'
          : net === 'testnet'
            ? 'https://mempool.space/testnet'
            : 'https://mempool.space/signet';

      window.open(`${baseUrl}/tx/push`, '_blank');
    }
  }

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
    this.confirmData.set({
      title: '',
      message: '',
      action: () => {},
      isDestructive: false,
      type: 'confirm',
    });
  }

  async openQr() {
    this.showQrModal.set(true);
    this.isQrRevealed.set(false);
    this.qrIncludesKey.set(false);

    this.dispatcher.emitModalView('Room QR Code');
    this.dispatcher.emitQrStateChanged(false, false);

    await this.generateQrData();
  }

  async toggleQrKey(includesKey: boolean) {
    this.qrIncludesKey.set(includesKey);
    this.isQrRevealed.set(false);
    this.dispatcher.emitQrStateChanged(includesKey, false);
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
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
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
    this.isQrRevealed.update((v) => !v);

    this.dispatcher.emitQrStateChanged(this.qrIncludesKey(), isRevealing);

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

    this.dispatcher.emitDownloadTriggered('qr-code-image');

    const safeId = this.roomId() ?? 'unknown-room';

    const a = document.createElement('a');
    a.href = url;
    a.download = `signingroom-qr-${safeId.slice(0, 8)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  submitKey() {
    if (!this.manualKey) return;
    let key = this.manualKey.trim();
    if (key.includes('#')) key = key.split('#')[1];
    this.socket.decryptionError.set('');
    this.socket.connect(this.roomId()!, key);
    this.manualKey = '';
  }

  promptAuditLogDownload() {
    this.showAuditModal.set(true);
    this.dispatcher.emitModalView('Download Audit Log');
  }

  async executeAuditDownload() {
    this.showAuditModal.set(false);

    this.dispatcher.emitDownloadTriggered('audit-log');

    await this.delay(1000);

    this.generateAuditLog();
  }

  promptCsvDownload() {
    this.showCsvModal.set(true);
    this.dispatcher.emitModalView('Download CSV Data');
  }

  async executeCsvDownload() {
    this.showCsvModal.set(false);
    //await this.socket.logAction('CSV Export', 'Downloaded settlement data');
    this.dispatcher.emitDownloadTriggered('csv');
    await this.delay(1000);
    this.downloadCsv();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  downloadCsv() {
    const csvContent = this.socket.getSettlementCsvData();
    if (!csvContent) return;

    const roomId = this.socket.roomState()?.roomId || 'unknown';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `settlement_${roomId}_${new Date().toISOString().slice(0, 10)}.csv`,
    );

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  async generateAuditLog() {
    const { doc, filename } = await this.socket.getAuditLogPdf();
    await doc.save(filename);
  }

  getPdfDocument() {
    return this.socket.getAuditLogPdf();
  }

  private startTimer(expiryTime: number) {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      const now = Date.now();
      const diff = expiryTime - now;

      if (diff <= 0) {
        this.timeRemaining.set('00 hrs 00 m 00 s');
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

  public triggerConfetti() {
    import('canvas-confetti').then((c) => c.default());
  }

  copyHex() {
    this.doCopy(this.finalHex() || '', this.copied);
    this.dispatcher.emitDataCopied('final-hex');
  }

  private doCopy(text: string, signalToToggle: any) {
    navigator.clipboard.writeText(text);
    if (signalToToggle) {
      signalToToggle.set(true);
      setTimeout(() => signalToToggle.set(false), 2000);
    }
  }

  public getFullShareLink(): string {
    return this.socket.getRoomLink(window.location.origin, true);
  }

  nudgeSigner(fingerprint: string) {
    const label = this.getSignerLabel(fingerprint);
    const msg = `Signature needed from: ${label}\n${this.getFullShareLink()}`;

    navigator.clipboard.writeText(msg).then(() => {
      this.openAlert(
        'Nudge Message Copied',
        `Nudge message for ${label} copied! Paste it in your chat app.`,
      );
    });
    this.socket.logAction('Nudge Sent', `Reminder sent to ${label}`);
  }

  openShareModal() {
    this.showShareModal.set(true);
    this.dispatcher.emitModalView('Share Room Securely');
  }

  closeShareModal() {
    this.showShareModal.set(false);
  }

  copySecureLink() {
    const baseUrl = window.location.href.split('#')[0];
    this.doCopy(baseUrl, this.secureLinkCopied);
    this.socket.logAction('Link Copied (No Key)', 'User copied room link');

    this.dispatcher.emitDataCopied('share-link');
    this.closeShareModal();
  }

  copyFullLink() {
    this.doCopy(this.getFullShareLink(), this.fullLinkCopied);
    this.socket.logAction('Link Copied (With Key)', 'User copied room link');

    this.dispatcher.emitDataCopied('share-link-full');
    this.closeShareModal();
  }

  openKeyModal() {
    this.showKeyModal.set(true);
    this.dispatcher.emitModalView('Room Decryption Key');
  }
  closeKeyModal() {
    this.showKeyModal.set(false);
  }

  openAdminModal() {
    this.showAdminModal.set(true);
    this.dispatcher.emitModalView('Backup Admin Token');
  }

  closeAdminModal() {
    this.showAdminModal.set(false);
  }

  openRoomIdModal() {
    this.showRoomIdModal.set(true);
    this.dispatcher.emitModalView('Room ID');
  }
  closeRoomIdModal() {
    this.showRoomIdModal.set(false);
  }

  copyKey() {
    this.doCopy(this.socket.getRoomKey() || '', this.keyCopied);
    this.socket.logAction('Key Copied', 'Copied room decryption key');
    this.dispatcher.emitDataCopied('decryption-key');
    this.closeKeyModal();
  }

  async copyAdminToken() {
    const encryptedToken = sessionStorage.getItem(`admin_token_${this.roomId()}`);
    const roomKey = this.socket.getRoomKey();

    if (encryptedToken && roomKey) {
      try {
        const plainToken = await this.encryptionEngine.decrypt(encryptedToken, roomKey);

        if (plainToken) {
          this.doCopy(plainToken, this.adminCopied);
          this.socket.logAction('Admin Token Copied', 'Backed up the admin token');
          this.dispatcher.emitDataCopied('admin-token');
        }
      } catch (e) {
        console.error('Failed to decrypt admin token for clipboard', e);
      }
    }
    this.closeAdminModal();
  }

  copyRoomId() {
    if (this.roomId()) {
      this.doCopy(this.roomId()!, this.roomIdCopied);
      this.socket.logAction('Room ID Copied', 'Copied the room identifier');
      this.dispatcher.emitDataCopied('room-id');
      this.closeRoomIdModal();
    }
  }

  blurStates = signal<Record<PrivacySection, boolean>>({
    'transaction-overview': true,
    'transaction-proposal': true,
    'transaction-details': true,
    signers: true,
  });

  showPrivacyWarning = signal(false);
  pendingUnblurSection = signal<PrivacySection | null>(null);

  /**
   * Handles the click of the Eye icon for any section.
   */
  togglePrivacyBlur(section: PrivacySection) {
    if (this.blurStates()[section]) {
      this.pendingUnblurSection.set(section);
      this.showPrivacyWarning.set(true);

      this.dispatcher.emitModalView('Toggle Privacy Warning', section);
    } else {
      this.blurStates.update((s) => ({ ...s, [section]: true }));
      this.socket.logAction('Privacy Toggle', `Re-blurred ${section} section`);

      this.dispatcher.emitPrivacyToggle(section, 'hidden');
    }
  }

  /**
   * Called when the user clicks "Acknowledge & Reveal" on the modal.
   */
  confirmUnblur() {
    const section = this.pendingUnblurSection();
    if (section) {
      this.blurStates.update((s) => ({ ...s, [section]: false }));
      this.socket.logAction('Privacy Toggle', `Revealed ${section} section`);

      // EMIT: Reveal Specific Section Action
      this.dispatcher.emitPrivacyToggle(section, 'reveal-section');
    }

    this.showPrivacyWarning.set(false);
    this.pendingUnblurSection.set(null);
  }

  /**
   * Called when the user clicks "Reveal All" on the modal.
   */
  confirmUnblurAll() {
    this.blurStates.set({
      'transaction-overview': false,
      'transaction-proposal': false,
      'transaction-details': false,
      signers: false,
    });
    this.socket.logAction('Privacy Toggle', `Revealed all sections`);

    this.dispatcher.emitPrivacyToggle('all' as any, 'reveal-all');

    this.showPrivacyWarning.set(false);
    this.pendingUnblurSection.set(null);
  }

  /**
   * Closes the privacy warning modal without revealing.
   */
  closePrivacyWarning() {
    const section = this.pendingUnblurSection();
    if (section) {
      this.dispatcher.emitPrivacyToggle(section, 'blurred');
    }

    this.showPrivacyWarning.set(false);
    this.pendingUnblurSection.set(null);
  }

  openFountainModal() {
    this.regenerateFrames();
    this.showFountainModal.set(true);
    this.isFountainRevealed.set(false);
    this.dispatcher.emitModalView('Export PSBT (Air-Gapped)');
  }

  setExportFormat(format: 'ur' | 'bbqr') {
    this.exportFormat.set(format);
    this.dispatcher.emitFountainFormatChanged(format);

    if (this.showFountainModal()) {
      this.regenerateFrames();

      if (this.isFountainRevealed()) {
        this.startFountainAnimation();
      }
    }
  }

  regenerateFrames() {
    const psbtData = this.socket.roomState()?.psbt;
    if (!psbtData) return;
    try {
      if (this.exportFormat() === 'ur') {
        this.activeFountainFrames = this.urService.generateFrames(psbtData);
      } else {
        this.activeFountainFrames = this.urService.generateBBQrFrames(psbtData);
      }
      this.currentFrameIndex.set(0);
    } catch (e) {
      console.error('Failed to prepare frames', e);
    }
  }

  toggleFountainReveal() {
    const nextState = !this.isFountainRevealed();
    this.isFountainRevealed.set(nextState);

    this.dispatcher.emitFountainStateChanged(nextState, this.exportFormat());

    if (nextState) {
      this.socket.logAction(
        'Privacy Toggle',
        `Revealed ${this.exportFormat().toUpperCase()} PSBT QR`,
      );
      this.startFountainAnimation();
    } else {
      this.socket.logAction(
        'Privacy Toggle',
        `Blurred ${this.exportFormat().toUpperCase()} PSBT QR`,
      );
      this.stopFountainAnimation();
    }
  }

  startFountainAnimation() {
    if (this.fountainInterval) clearInterval(this.fountainInterval);

    this.fountainInterval = setInterval(() => {
      this.currentFrameIndex.update((i) => (i + 1) % this.activeFountainFrames.length);
      this.renderFountainFrame();
    }, this.fountainSpeed());

    setTimeout(() => this.renderFountainFrame(), 0);
  }

  stopFountainAnimation() {
    if (this.fountainInterval) clearInterval(this.fountainInterval);
  }

  closeFountainModal() {
    this.showFountainModal.set(false);
    this.isFountainRevealed.set(false);
    this.stopFountainAnimation();
  }

  async renderFountainFrame() {
    if (!this.isFountainRevealed()) return;
    const canvas = document.getElementById('fountain-psbt-canvas') as HTMLCanvasElement;
    if (canvas && this.activeFountainFrames.length > 0) {
      const frame = this.activeFountainFrames[this.currentFrameIndex()];

      await QRCode.toCanvas(canvas, frame, {
        width: 320,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
    }
  }

  startScanner() {
    this.showScannerModal.set(true);
    this.isScanningSigned.set(true);
    this.urService.resetDecoder();

    this.dispatcher.emitModalView('Import PSBT (Scanner)');

    setTimeout(async () => {
      this.html5QrCode = new Html5Qrcode('signer-reader', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      });

      let frameCount = 0;

      try {
        await this.html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            disableFlip: true,
            qrbox: { width: 350, height: 350 },
            videoConstraints: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          (decodedText) => this.handleScanResult(decodedText),
          (errorMessage) => {
            frameCount++;
            if (frameCount % 60 === 0) {
              console.warn(
                `[Optical Debug] Frame ${frameCount} - Engine failing to lock:`,
                errorMessage.split('\n')[0],
              );
            }
          },
        );
      } catch (err) {
        console.warn('High-res camera start failed. Falling back to standard resolution...', err);

        try {
          await this.html5QrCode.start(
            { facingMode: 'environment' },
            { fps: 10, disableFlip: false },
            (decodedText) => this.handleScanResult(decodedText),
            () => {
              console.error('Fallback camera failed to start.');
            },
          );
        } catch (fallbackErr) {
          console.error('Fallback camera start also failed:', fallbackErr);
          this.stopScanner();
        }
      }
    }, 100);
  }

  handleScanResult(decodedText: string) {
    console.log('Scanned fragment:', decodedText.substring(0, 80) + '...');

    const fullHex = this.urService.processFragment(decodedText);

    if (fullHex) {
      console.log('Full PSBT decoded, length:', fullHex.length);
      this.stopScanner();
      this.processScannedSignature(fullHex);
    }
  }

  stopScanner() {
    if (this.html5QrCode) {
      try {
        if (this.html5QrCode.getState() === 2) {
          this.html5QrCode
            .stop()
            .then(() => {
              this.html5QrCode?.clear();
              this.isScanningSigned.set(false);
              this.showScannerModal.set(false);
            })
            .catch(() => {
              this.html5QrCode?.clear();
              this.isScanningSigned.set(false);
              this.showScannerModal.set(false);
            });
        } else {
          this.html5QrCode.clear();
          this.isScanningSigned.set(false);
          this.showScannerModal.set(false);
        }
      } catch (e) {
        this.html5QrCode.clear();
        this.isScanningSigned.set(false);
        this.showScannerModal.set(false);
      }
    } else {
      this.isScanningSigned.set(false);
      this.showScannerModal.set(false);
    }
  }

  async processScannedSignature(data: string) {
    try {
      const clean = data.replace(/\s+/g, '');
      const psbtBytes = /^[0-9a-fA-F]+$/.test(clean) ? hex.decode(clean) : base64.decode(clean);
      const normalizedBase64 = base64.encode(psbtBytes);

      await this.socket.uploadSignature(normalizedBase64);
      console.log('Successfully ingested signed PSBT via optics!');
      this.dispatcher.emitPsbtImported('scan');
    } catch (e) {
      console.error('Failed to parse signed PSBT from scanner', e);
    }
  }

  updateFountainSpeed(newSpeed: number) {
    this.fountainSpeed.set(Number(newSpeed));

    if (this.isFountainRevealed() && this.showFountainModal()) {
      this.startFountainAnimation();
    }
  }
}

/*
 * Copyright (C) 2026 Stateless Research Ltd
 * Licensed under the GNU Affero General Public License v3.0
 */

import { SignerStatus, TxDetails } from './psbt-utils';
import { RoomState, AuditEntry } from '../relay/room-state-store';
import { VerifiedLicense } from '../licensing/types';
import { jsPDF } from 'jspdf';

export interface AuditLogOptions {
  brandName?: string;
  brandColor?: [number, number, number];
  logoDataUrl?: string;
  isWhitelabel?: boolean;
  license?: VerifiedLicense | null;
}

/**
 * Utility class responsible for generating cryptographic integrity proofs and
 * human-readable compliance reports (PDF, CSV) from real-time room states.
 */
export class RoomAuditor {
  /**
   * Compiles top-level transaction and participant metadata into a comma-separated format.
   * @param state - The active RoomState containing participant and network contexts.
   * @param tx - The parsed transaction details including I/O maps and fees.
   * @param signers - The list of active signers and their current signature status.
   * @returns A raw CSV string containing the formatted settlement row.
   */
  static getSettlementCsvData(state: RoomState, tx: TxDetails, signers: SignerStatus[]): string {
    const headers = [
      'Date',
      'Room ID',
      'Network',
      'TXID',
      'Total Amount (BTC)',
      'Fee Rate (sats/vB)',
      'RBF Enabled',
      'Inputs',
      'Outputs',
      'Signers',
      'Witnesses',
      'Status',
    ];

    const signersList = signers
      .map((s) => `${s.fingerprint}${s.signed ? '(Signed)' : '(Pending)'}`)
      .join('; ');

    const participantsObj = state.participants || {};
    const witnessesList = Object.values(participantsObj)
      .map((p: any) => {
        const name = p.displayName || 'Anonymous';
        const role = p.role === 'admin' ? 'Coordinator' : 'Guest';
        return `${name} [${role}] (${p.id})`;
      })
      .join('; ');

    const row = [
      new Date().toISOString(),
      state.roomId,
      state.network,
      state.finalTxId || 'Pending',
      (tx.amount / 100000000).toFixed(8),
      tx.feeRate,
      tx.isRbfEnabled ? 'Yes' : 'No',
      tx.inputsList?.length || 0,
      tx.outputs?.length || 0,
      `"${signersList}"`,
      `"${witnessesList}"`,
      state?.finalTxHex ? 'Signed & Ready' : 'Pending Signatures',
    ];

    return headers.join(',') + '\n' + row.join(',');
  }

  /**
   * Transforms the decentralized room audit log into a flat CSV format for external archiving.
   * Injects forensic metadata and license attestation into the CSV header.
   */
  static getAuditLogCsvData(state: RoomState): string {
    const logs = state.auditLog || [];
    const rawToken = (state as any).licenseToken;

    let csvContent = '';

    // Inject Forensic Metadata Header if Token exists
    if (rawToken && rawToken.startsWith('srl_')) {
      csvContent += `# --- SIGNING ROOM FORENSIC AUDIT RECORD ---\n`;
      csvContent += `# Room ID: ${state.roomId}\n`;
      csvContent += `# Network: ${state.network}\n`;
      csvContent += `# Final TxId: ${state.finalTxId || 'Pending'}\n`;
      csvContent += `# License-Token: ${rawToken}\n`;
      csvContent += `# ------------------------------------------\n`;
    }

    csvContent += 'Timestamp,Event,User,Detail\n';
    
    const csvRows = logs
      .map((l) => {
        const time = new Date(l.timestamp).toISOString();
        const event = `"${l.event.replace(/"/g, '""')}"`;
        const user = `"${l.user.replace(/"/g, '""')}"`;
        const detail = `"${(l.detail || '').replace(/"/g, '""')}"`;
        return `${time},${event},${user},${detail}`;
      })
      .join('\n');
      
    return csvContent + csvRows;
  }

  /**
   * Generates a Data URI string containing the settlement CSV for direct browser downloading.
   * @param state - The active RoomState.
   * @param tx - The parsed transaction details.
   * @param signers - The list of active signers.
   * @returns A URI-encoded data string (data:text/csv...).
   */
  static getEncodedCsvData(state: RoomState, tx: TxDetails, signers: SignerStatus[]): string {
    const csvContent =
      'data:text/csv;charset=utf-8,' + this.getSettlementCsvData(state, tx, signers);
    return encodeURI(csvContent);
  }

  /**
   * Procedurally constructs a comprehensive, multi-page compliance PDF using the provided jsPDF instance.
   * Maps room governance, cryptographic anchors, participant manifests, and transaction parameters into a standard format.
   * Enforces watermarking and licensing disclosures based on verified cryptographic tier.
   * @param doc - An initialized jsPDF instance.
   * @param state - The finalized RoomState containing metadata and logs.
   * @param tx - The parsed transaction payload (can be null if unparseable).
   * @param signers - The list of signers mapping fingerprints to signature states.
   * @param finalHex - The extracted, broadcast-ready raw transaction hex, if available.
   * @param options - White-label styling, logo options, and verified license tokens.
   * @returns A Promise resolving to an object containing the mutated document and the standardized filename.
   */
  static async generateAuditPdf(
    doc: jsPDF,
    state: RoomState,
    tx: TxDetails | null,
    signers: SignerStatus[],
    finalHex: string | null,
    options?: AuditLogOptions,
  ): Promise<{ doc: jsPDF; filename: string }> {
    let y = 20;

    // Resolve tier: Prefer verified client license, otherwise fall back to server-attested state
    const license = options?.license;
    const tier = license?.tier && license.tier !== 'COMMUNITY'
      ? license.tier
      : ((state as any).tier || license?.tier || 'COMMUNITY');
    const isCommunity = tier === 'COMMUNITY';

    // Enforcement: Community Edition strictly disallows white-labeling
    const allowWhitelabel = !isCommunity && (options?.isWhitelabel ?? false);

    const checkPageBreak = (spaceNeeded: number) => {
      if (y + spaceNeeded > 270) {
        doc.addPage();
        y = 20;
      }
    };

    // Header Branding Setup
    let headingText = 'SigningRoom.io';
    if (allowWhitelabel && options?.brandName) {
      headingText = options.brandName;
    } else if (isCommunity) {
      headingText = 'SigningRoom.io (Community Edition)';
    }

    const brandColor = options?.brandColor || [16, 185, 129];

    let currentX = 20;
    const logoHeight = 12;
    const logoYOffset = y - 9;

    // Embed Logo if authorized
    if (options?.logoDataUrl && (allowWhitelabel || !isCommunity)) {
      try {
        const imgProps = doc.getImageProperties(options.logoDataUrl);
        const logoWidth = (imgProps.width * logoHeight) / imgProps.height;
        doc.addImage(options.logoDataUrl, 'PNG', currentX, logoYOffset, logoWidth, logoHeight);
        currentX += logoWidth + 4;
      } catch (e) {
        console.warn('Failed to embed logo in PDF', e);
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]);
    doc.text(headingText, currentX, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(16);
    doc.setTextColor(100);
    doc.text('Cryptographic Audit Record', 20, y + 12);
    y += 24;

    // Separator Line
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.line(20, y, 190, y);
    y += 10;

    // =========================================================
    // SECTION 0: FORENSIC INTEGRITY SEAL
    // =========================================================
    if (finalHex && state.auditLog && state.auditLog.length > 0) {
      checkPageBreak(35);
      const anchor = await this.calculateForensicAnchor(state.auditLog, finalHex);

      doc.setFontSize(14);
      doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]);
      doc.setFont('helvetica', 'bold');
      doc.text('Cryptographic Integrity Seal', 20, y);
      y += 6;

      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.setFont('helvetica', 'italic');
      doc.text(
        'This anchor mathematically binds the raw transaction hex to the chronological event timeline below.',
        20,
        y,
      );
      y += 5;
      doc.text('Verification formula: SHA256(Audit_Log_CSV_String + Final_Tx_Hex)', 20, y);
      y += 8;

      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.setFont('courier', 'bold');
      doc.text(anchor, 20, y);
      y += 10;

      doc.setDrawColor(200);
      doc.setLineWidth(0.5);
      doc.line(20, y, 190, y);
      y += 10;
    }

    // =========================================================
    // SECTION 1: ROOM METADATA & GOVERNANCE
    // =========================================================
    checkPageBreak(40);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Room Info & Governance', 20, y);
    y += 8;

    const printMetaRow = (label: string, value: string, valueColor: [number, number, number] = [50, 50, 50]) => {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0); // Black bold label
      doc.text(label, 20, y);
      
      const labelWidth = doc.getTextWidth(label);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
      doc.text(value, 20 + labelWidth + 2, y);
      y += 6;
    };

    printMetaRow('Room:', state.roomName);
    printMetaRow('Room ID:', state.roomId);
    printMetaRow('Network:', (state.network || 'bitcoin').toUpperCase());
    printMetaRow('Created:', new Date(state.createdAt).toLocaleString());

    const lockStatus = state.isLocked ? 'LOCKED (Secure)' : 'UNLOCKED (Open)';
    printMetaRow('Room Status:', lockStatus);

    const whitelistCount = state.whitelist?.length || 0;
    printMetaRow('Whitelist Enforcement:', whitelistCount > 0 ? 'Active' : 'Disabled');

    let tierLabel = 'Community Edition (Unlicensed Node)';
    if (tier === 'ENTERPRISE') {
      const entName = license?.payload?.licensee || (state as any).licensee || 'Verified';
      tierLabel = `Enterprise Edition — ${entName}`;
    } else if (tier === 'PUBLIC_GOOD') {
      tierLabel = 'Public Good Coordinator (signingroom.io)';
    }
    printMetaRow('Node Certification:', tierLabel);

    const isNodeValid = license?.isValid || isCommunity;
    const statusText = isNodeValid ? 'VALID' : 'INVALID';
    let expiryStr = 'Perpetual';
    
    const expiresAt = license?.payload?.expiresAt;
    if (expiresAt && expiresAt > 0) {
      const msRemaining = expiresAt - Date.now();
      if (msRemaining > 0) {
        const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
        expiryStr = `${daysRemaining} Days Remaining`;
      } else {
        expiryStr = 'Expired';
      }
    }

    const statusColor: [number, number, number] = isNodeValid 
      ? [16, 185, 129]
      : [220, 38, 38];
    
    printMetaRow('License Status:', `${statusText} (${expiryStr})`, statusColor);

    const rawToken = license?.rawToken || (state as any).licenseToken;
    if (rawToken && rawToken.startsWith('srl_')) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text('License Token:', 20, y);
      
      const tokenLabelWidth = doc.getTextWidth('License Token:');
      
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100);
      
      const startX = 20 + tokenLabelWidth + 2;
      const wrappedToken = doc.splitTextToSize(rawToken, 190 - startX);
      doc.text(wrappedToken, startX, y);
      
      y += (wrappedToken.length - 1) * 4;
      y += 6;
    }
    
    y += 9;

    // =========================================================
    // SECTION 2: TRANSACTION DATA
    // =========================================================
    checkPageBreak(50);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Transaction Data', 20, y);
    y += 8;

    if (tx) {
      doc.setFontSize(10);
      doc.setTextColor(50);
      doc.setFont('helvetica', 'bold');
      doc.text('Settlement Details:', 20, y);
      y += 5;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80);
      
      doc.text(`Amount: ${(tx.amount / 100000000).toFixed(8)} BTC`, 20, y);
      doc.text(`Network Fee: ${tx.fee.toLocaleString()} sats`, 85, y);
      doc.text(`Size: ${tx.vBytes.toLocaleString()} vB`, 145, y);
      y += 6;
      
      doc.text(`Fee Rate: ${tx.feeRate.toFixed(2)} sats/vB`, 20, y);
      doc.text(`Replace-By-Fee (RBF): ${tx.isRbfEnabled ? 'Enabled' : 'Disabled'}`, 85, y);
      y += 10;
    }

    const txId = state.finalTxId;
    if (txId) {
      doc.setFontSize(10);
      doc.setTextColor(50);
      doc.setFont('helvetica', 'bold');
      doc.text('Transaction ID (TXID):', 20, y);
      y += 5;

      doc.setFont('courier', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text(String(txId), 20, y);
      y += 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(50);
      doc.text('Explorer Verification Link:', 20, y);
      y += 5;

      const networkSubpath = 
        state.network === 'testnet'
          ? 'testnet/'
          : state.network === 'signet'
            ? 'signet/'
            : '';
      const fullExplorerUrl = `https://mempool.space/${networkSubpath}tx/${txId}`;

      doc.setFontSize(8);
      doc.setFont('courier', 'normal');
      doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]);
      
      doc.textWithLink(fullExplorerUrl, 20, y, { url: fullExplorerUrl });
      y += 12;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text('Raw Hex Data (Partial):', 20, y);
    y += 5;

    doc.setFontSize(8);
    doc.setFont('courier', 'normal');
    doc.setTextColor(80);

    let partialHexDisplay = 'Not yet finalized';
    if (finalHex) {
      partialHexDisplay = `${finalHex.slice(0, 32)}...[${finalHex.length} bytes]...${finalHex.slice(-32)}`;
    }

    doc.text(partialHexDisplay, 20, y, { maxWidth: 170 });
    doc.setFont('helvetica', 'normal');
    y += 15;

    // =========================================================
    // SECTION 2.5: TEMPORAL CONSTRAINTS (TIMELOCKS)
    // =========================================================
    const lockTime = tx?.lockTime || 0;
    const hasRelative = tx?.hasRelativeTimelock || false;
    const relativeVal = tx?.relativeTimelockValue;

    if (lockTime > 0 || hasRelative) {
      checkPageBreak(30);
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'bold');
      doc.text('Temporal Constraints (Timelocks)', 20, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(50);

      if (lockTime > 0) {
        const isTimestamp = lockTime >= 500000000;
        const lockDesc = isTimestamp 
          ? `Timestamp: ${new Date(lockTime * 1000).toUTCString()}` 
          : `Block Height: ${lockTime.toLocaleString()}`;
        
        doc.text(`Absolute Timelock (CLTV): ${lockDesc}`, 20, y);
        y += 6;
      }

      if (hasRelative && relativeVal) {
        doc.text(`Relative Timelock (CSV): ${relativeVal} delay active`, 20, y);
        y += 6;
      }

      y += 6;
      doc.setDrawColor(200);
      doc.setLineWidth(0.5);
      doc.line(20, y, 190, y);
      y += 10;
    }

    // =========================================================
    // SECTION 3: SIGNER ACTIVITY
    // =========================================================
    checkPageBreak(30);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Signer Activity', 20, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    if (signers.length === 0) {
      doc.setTextColor(150);
      doc.text('No signers detected yet.', 20, y);
      y += 6;
    } else {
      signers.forEach((s, i) => {
        checkPageBreak(10);
        const status = s.signed ? 'SIGNED' : 'PENDING';
        const label = state.signerLabels?.[s.fingerprint];
        const displayName = label ? `${label} (${s.fingerprint})` : s.fingerprint;

        doc.setTextColor(50);
        doc.text(`${i + 1}. ${displayName}`, 20, y);
        doc.text(status, 150, y);
        y += 6;
      });
    }
    y += 10;

    // =========================================================
    // SECTION 4: ROOM PARTICIPANTS
    // =========================================================
    checkPageBreak(30);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Room Participants (Witnesses)', 20, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const participantsObj = state.participants || {};
    const historicalParticipants = Object.values(participantsObj);

    if (historicalParticipants.length === 0) {
      doc.setTextColor(150);
      doc.text('No participants recorded.', 20, y);
      y += 6;
    } else {
      historicalParticipants.forEach((p: any, i) => {
        checkPageBreak(10);
        doc.setTextColor(50);

        const roleBadge = p.role === 'admin' ? '[Coordinator]' : '[Guest]';
        const displayName = p.displayName ? p.displayName : 'Anonymous';

        doc.setFont('helvetica', 'bold');
        doc.text(`${i + 1}. ${displayName} ${roleBadge}`, 20, y);

        doc.setFont('courier', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Session ID: ${p.id}`, 140, y);

        doc.setFontSize(10);
        y += 6;
      });
    }
    y += 10;

    // =========================================================
    // SECTION 5: EVENT TIMELINE
    // =========================================================
    checkPageBreak(30);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Event Timeline', 20, y);
    y += 10;

    doc.setFontSize(9);
    const logs = state.auditLog || [];

    if (logs.length === 0) {
      doc.setTextColor(150);
      doc.setFont('helvetica', 'italic');
      doc.text('No events logged yet.', 20, y);
      y += 6;
    } else {
      logs.forEach((log) => {
        if (!log) return;
        checkPageBreak(15);

        const safeEvent = log.event ? String(log.event) : 'System Event';
        const safeUser = log.user ? String(log.user) : 'System';

        const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '--:--';
        const date = log.timestamp ? new Date(log.timestamp).toLocaleDateString() : '--/--/--';

        doc.setTextColor(120);
        doc.setFont('helvetica', 'normal');
        doc.text(`${date} ${time}`, 20, y);

        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text(safeEvent, 65, y);

        doc.setFont('helvetica', 'normal');
        doc.text(safeUser, 115, y);

        if (log.detail) {
          doc.setTextColor(100);
          const detailStr = String(log.detail);
          const wrappedText = doc.splitTextToSize(detailStr, 60);
          doc.text(wrappedText, 145, y);
          y += (wrappedText.length - 1) * 4;
        }
        y += 7;
      });
    }
    y += 10;

    // =========================================================
    // SECTION 6: INPUT VERIFICATION
    // =========================================================
    checkPageBreak(30);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Input Verification (Sources)', 20, y);
    y += 6;

    doc.setDrawColor(200);
    doc.line(20, y, 190, y);
    y += 5;

    const inputs = tx?.inputsList || [];
    const whitelist = state.whitelist || [];

    if (inputs.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text('No input data parsed.', 20, y);
      y += 6;
    } else {
      inputs.forEach((inpt, i) => {
        checkPageBreak(30);
        const isWhitelisted = whitelist.includes(inpt.address);
        const amount = (inpt.amount / 100000000).toFixed(8);
        const label = state.addressLabels?.[inpt.address];

        const scriptTypeMap: Record<string, string> = {
          P2TR: 'Taproot',
          P2WSH: 'SegWit',
          P2WPKH: 'SegWit',
          P2SH: 'Nested-Segwit',
          P2PKH: 'Legacy',
        };
        const readableType = scriptTypeMap[inpt.scriptType] || inpt.scriptType;
        const rbfTag = inpt.isRbfEnabled ? ' • RBF Enabled' : '';

        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        const headerTitle = label ? `${i + 1}. ${label} (${readableType}${rbfTag})` : `${i + 1}. ${readableType}${rbfTag}`;
        doc.text(headerTitle, 20, y);
        y += 5;

        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.setFont('courier', 'normal');
        doc.text(`vOut: ${inpt.txId}:${inpt.vout}`, 20, y);
        y += 4;

        doc.setTextColor(50);
        doc.text(inpt.address, 20, y);
        y += 6;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(`${amount} BTC`, 20, y);

        if (whitelist.length === 0) {
          doc.setTextColor(100);
          doc.text('NO WHITELIST', 150, y);
        } else if (isWhitelisted) {
          doc.setTextColor(16, 185, 129);
          doc.text('VERIFIED SOURCE', 150, y);
        } else {
          doc.setTextColor(220, 38, 38);
          doc.text('UNVERIFIED', 150, y);
        }

        y += 12;
      });
    }
    y += 10;

    // =========================================================
    // SECTION 7: OUTPUT VERIFICATION
    // =========================================================
    checkPageBreak(30);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Output Verification', 20, y);
    y += 6;

    doc.setDrawColor(200);
    doc.line(20, y, 190, y);
    y += 5;

    const outputs = tx?.outputs || [];

    if (outputs.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text('No output data available yet.', 20, y);
      y += 6;
    } else {
      outputs.forEach((out, i) => {
        checkPageBreak(30);
        const isWhitelisted = whitelist.includes(out.address);
        const amount = (out.amount / 100000000).toFixed(8);
        const label = state.addressLabels?.[out.address];

        const scriptTypeMap: Record<string, string> = {
          P2TR: 'Taproot',
          P2WSH: 'SegWit',
          P2WPKH: 'SegWit',
          P2SH: 'Nested-Segwit',
          P2PKH: 'Legacy',
        };
        const readableType = scriptTypeMap[out.scriptType] || out.scriptType;

        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        const headerTitle = label ? `${i + 1}. ${label} (${readableType})` : `${i + 1}. ${readableType}`;
        doc.text(headerTitle, 20, y);
        y += 5;

        doc.setFontSize(8);
        doc.setTextColor(50);
        doc.setFont('courier', 'normal');
        doc.text(out.address, 20, y);
        y += 6;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(`${amount} BTC`, 20, y);

        if (whitelist.length === 0) {
          doc.setTextColor(100);
          doc.text('NO WHITELIST', 150, y);
        } else if (out.isChange) {
          doc.setTextColor(245, 158, 11);
          doc.text('CHANGE (VERIFIED)', 150, y);
        } else if (isWhitelisted) {
          doc.setTextColor(16, 185, 129);
          doc.text('VERIFIED DESTINATION', 150, y);
        } else {
          doc.setTextColor(220, 38, 38);
          doc.text('UNVERIFIED', 150, y);
        }

        y += 12;
      });

      doc.setDrawColor(200);
      doc.line(20, y, 190, y);
      y += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Total Outputs: ${outputs.length}`, 20, y);
      y += 15;
    }

    // =========================================================
    // SECTION 8: MULTI-PAGE STAMPING (WATERMARK & LEGAL FOOTERS)
    // =========================================================
    const totalPages = (doc as any).internal.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();   
    const pageHeight = doc.internal.pageSize.getHeight(); 
    const centerX = pageWidth / 2;                        
    const centerY = pageHeight / 2;                       

    let footerDisclaimer = '';
    if (isCommunity) {
      footerDisclaimer =
        'NOTICE: Generated on an unlicensed community node. Host attestation is unverified for commercial compliance.';
    } else if (tier === 'ENTERPRISE') {
      const licenseeName = license?.payload?.licensee || (state as any).licensee || options?.brandName || 'Enterprise Licensee';
      const reg = license?.payload?.registration ? ` (No. ${license.payload.registration})` : '';
      const office = license?.payload?.registeredOffice ? ` • ${license.payload.registeredOffice}` : '';
      footerDisclaimer = `© 2026 ${licenseeName}${reg}${office} • Certified Commercial Attestation`;
    } else {
      footerDisclaimer =
        'SigningRoom.io Public Infrastructure • Operated by Stateless Research Ltd (UK Co. 16990515) • For commercial licensing contact Stateless Research';
    }

    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);

      let watermarkText = '';
      let watermarkColor: [number, number, number] = [220, 38, 38];
      let watermarkOpacity = 0.12;

      if (isCommunity || !license?.isValid) {
        watermarkText = 'SIGNING ROOM COMMUNITY EDITION — UNVERIFIED NODE';
      } else if (tier === 'PUBLIC_GOOD') {
        watermarkText = 'SigningRoom.io';
        watermarkColor = [120, 120, 120];
        watermarkOpacity = 0.18;
      }

      // Render Watermark if applicable
      if (watermarkText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(isCommunity ? 23 : 40);

        const textWidth = doc.getTextWidth(watermarkText);
        const angle = 45;
        const radians = (angle * Math.PI) / 180;

        const startX = centerX - (textWidth / 2) * Math.cos(radians);
        const startY = centerY + (textWidth / 2) * Math.sin(radians);

        try {
          (doc as any).saveGraphicsState();
          (doc as any).setGState(new (doc as any).GState({ opacity: watermarkOpacity }));
          doc.setTextColor(watermarkColor[0], watermarkColor[1], watermarkColor[2]);
          doc.text(watermarkText, startX, startY, { angle });
          (doc as any).restoreGraphicsState();
        } catch {
          // Fallback if GState isn't supported
          doc.setTextColor(245, 220, 220);
          doc.text(watermarkText, startX, startY, { angle });
        }
      }

      // Footer Disclaimer & Page Numbers
      doc.setDrawColor(230);
      doc.setLineWidth(0.3);
      doc.line(20, 280, 190, 280);

      // Centered Disclaimer (Full page width available without collisions)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text(footerDisclaimer, centerX, 284, { align: 'center' });

      // Page Numbers (Cleanly positioned below, right-aligned to content margin)
      doc.setFontSize(7.5);
      doc.setTextColor(140);
      doc.text(`Page ${p} of ${totalPages}`, 190, 289, { align: 'right' });
    }

    // =========================================================
    // FILENAME FORMATTING
    // =========================================================
    const dateStr = new Date().toISOString().split('T')[0];
    const shortId = state.roomId.slice(0, 8);
    const txSuffix = state.finalTxId ? state.finalTxId.slice(0, 8) : 'Pending';

    let prefix = isCommunity ? 'SigningRoom_COMMUNITY' : 'SigningRoom';
    if (allowWhitelabel && options?.brandName) {
      prefix = options.brandName.replace(/\s+/g, '');
    }

    const filename = `${prefix}_Audit_${dateStr}_Room-${shortId}_Tx-${txSuffix}.pdf`;

    return { doc, filename };
  }

  /**
   * Derives a deterministic cryptographic hash connecting the chronological audit log and the final transaction hex.
   * Prevents post-hoc modification of either the historical log or the finalized transaction data.
   * @param auditLog - The array of historical RoomState log entries.
   * @param finalTxHex - The broadcast-ready raw transaction hex.
   * @returns A Promise resolving to a 64-character SHA-256 hex string.
   */
  static async calculateForensicAnchor(
    auditLog: AuditEntry[],
    finalTxHex: string,
  ): Promise<string> {
    const sortedLog = [...auditLog].sort((a, b) => a.timestamp - b.timestamp);

    const logStrings = sortedLog.map((entry) => {
      return `${new Date(entry.timestamp).toISOString()}|${entry.event}|${entry.user}|${entry.detail || ''}`;
    });

    const payload = logStrings.join('') + finalTxHex;

    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Validates the forensic integrity of a signing ceremony completely offline.
   * Allows independent auditors to verify the cryptographic seal using only
   * the exported artifacts (CSV and Hex), without joining the live room session.
   */
  static async verifyOfflineIntegrity(
    auditLogCsv: string,
    finalTxHex: string,
    expectedAnchor: string
  ): Promise<{ anchor: string; isValid: boolean }> {
    const lines = auditLogCsv.trim().split('\n');
    
    // Filter out the metadata headers (#) and the CSV column header
    const dataLines = lines.filter(line => !line.startsWith('#') && !line.startsWith('Timestamp'));

    const logStrings = dataLines.map(line => {
      const rowRegex = /^([^,]+),"((?:[^"]|"")*)","((?:[^"]|"")*)","((?:[^"]|"")*)"$/;
      const match = line.match(rowRegex);
      
      if (match) {
         const time = match[1];
         const event = match[2].replace(/""/g, '"');
         const user = match[3].replace(/""/g, '"');
         const detail = match[4].replace(/""/g, '"');
         
         return `${time}|${event}|${user}|${detail}`;
      }
      return ''; 
    });

    const payload = logStrings.join('') + finalTxHex.trim();

    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    const calculatedAnchor = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return {
      anchor: calculatedAnchor,
      isValid: calculatedAnchor === expectedAnchor,
    };
  }

  /**
   * Verifies that the current audit log and transaction hex match a previously issued forensic anchor.
   * @param state - The finalized RoomState to verify.
   * @param expectedAnchor - The known, previously calculated SHA-256 hash.
   * @returns A Promise resolving to an object containing the re-calculated anchor and a boolean validity flag.
   * @throws {Error} If the room state lacks required finalization parameters (hex or log).
   */
  static async verifyRoomIntegrity(
    state: RoomState,
    expectedAnchor: string,
  ): Promise<{ anchor: string; isValid: boolean }> {
    if (!state.finalTxHex || !state.auditLog) {
      throw new Error('Room not finalized or audit log missing');
    }

    const calculatedAnchor = await this.calculateForensicAnchor(state.auditLog, state.finalTxHex);
    const isValid = calculatedAnchor === expectedAnchor;

    return { anchor: calculatedAnchor, isValid };
  }

  /**
   * Extracts a fresh cryptographic integrity report for a finalized room.
   * @param state - The finalized RoomState.
   * @returns A Promise resolving to the calculated forensic anchor and the current ISO timestamp.
   * @throws {Error} If the room state lacks required finalization parameters.
   */
  static async getIntegrityReport(
    state: RoomState,
  ): Promise<{ anchor: string; timestamp: string }> {
    if (!state.finalTxHex || !state.auditLog) throw new Error('Room not finalized');

    return {
      anchor: await this.calculateForensicAnchor(state.auditLog, state.finalTxHex),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Extracts the raw license token string ('srl_...') from a generated CSV audit log.
   * @param auditLogCsv - The complete exported CSV string.
   * @returns The license token string if found, otherwise null.
   */
  static extractLicenseTokenFromCsv(auditLogCsv: string): string | null {
    if (!auditLogCsv) return null;
    
    // Search the CSV header block for the License-Token key
    const match = auditLogCsv.match(/^#\s*License-Token:\s*(srl_[A-Za-z0-9_-]+)/m);
    return match ? match[1] : null;
  }
}
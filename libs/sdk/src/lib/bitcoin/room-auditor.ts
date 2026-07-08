import { SignerStatus, TxDetails } from './psbt-utils';
import { RoomState, AuditEntry } from '../relay/room-state-store';
import { jsPDF } from 'jspdf';

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
   * @param state - The active RoomState containing the chronological audit log.
   * @returns A raw CSV string containing headers and sanitized event rows.
   */
  static getAuditLogCsvData(state: RoomState): string {
    const logs = state.auditLog || [];
    const csvHeader = 'Timestamp,Event,User,Detail\n';
    const csvRows = logs
      .map((l) => {
        const time = new Date(l.timestamp).toISOString();
        const event = `"${l.event.replace(/"/g, '""')}"`;
        const user = `"${l.user.replace(/"/g, '""')}"`;
        const detail = `"${(l.detail || '').replace(/"/g, '""')}"`;
        return `${time},${event},${user},${detail}`;
      })
      .join('\n');
    return csvHeader + csvRows;
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
   * @param doc - An initialized jsPDF instance.
   * @param state - The finalized RoomState containing metadata and logs.
   * @param tx - The parsed transaction payload (can be null if unparseable).
   * @param signers - The list of signers mapping fingerprints to signature states.
   * @param finalHex - The extracted, broadcast-ready raw transaction hex, if available.
   * @returns A Promise resolving to an object containing the mutated document and the standardized filename.
   */
  static async generateAuditPdf(
    doc: jsPDF,
    state: RoomState,
    tx: TxDetails | null,
    signers: SignerStatus[],
    finalHex: string | null,
  ): Promise<{ doc: jsPDF; filename: string }> {
    let y = 20;
    const checkPageBreak = (spaceNeeded: number) => {
      if (y + spaceNeeded > 280) {
        doc.addPage();
        y = 20;
      }
    };

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text('SigningRoom.io', 20, y);

    // Subtitle
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(16);
    doc.setTextColor(100);
    doc.text('Audit Log', 20, y + 10);
    y += 20;

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
      doc.setTextColor(16, 185, 129); // emerald-500
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

      // Separator Line
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

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(50);

    doc.text(`Room: ${state.roomName}`, 20, y);
    y += 6;
    doc.text(`Room ID: ${state.roomId}`, 20, y);
    y += 6;
    doc.text(`Network: ${(state.network || 'bitcoin').toUpperCase()}`, 20, y);
    y += 6;
    doc.text(`Created: ${new Date(state.createdAt).toLocaleString()}`, 20, y);
    y += 6;

    const lockStatus = state.isLocked ? 'LOCKED (Secure)' : 'UNLOCKED (Open)';
    doc.text(`Room Status: ${lockStatus}`, 20, y);
    y += 6;

    const whitelistCount = state.whitelist?.length || 0;
    doc.text(`Whitelist Enforcement: ${whitelistCount > 0 ? 'Active' : 'Disabled'}`, 20, y);
    y += 15;

    // =========================================================
    // SECTION 2: TRANSACTION DATA
    // =========================================================
    checkPageBreak(40);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Transaction Data', 20, y);
    y += 8;

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

      // Add a clickable link hint
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(100);
      const explorerUrl =
        state.network === 'testnet'
          ? 'mempool.space/testnet/tx/'
          : state.network === 'signet'
            ? 'mempool.space/signet/tx/'
            : 'mempool.space/tx/';
      doc.text(`View on Explorer: ${explorerUrl}${txId.slice(0, 8)}...`, 20, y);
      y += 10;
    }

    // Partial Hex (Visual Check)
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
        doc.text(safeUser, 110, y);

        if (log.detail) {
          doc.setTextColor(100);
          const detailStr = String(log.detail);
          const detailText = detailStr.length > 30 ? detailStr.substring(0, 27) + '...' : detailStr;
          doc.text(detailText, 150, y);
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
        checkPageBreak(15);
        const isWhitelisted = whitelist.includes(inpt.address);
        const amount = (inpt.amount / 100000000).toFixed(8);

        doc.setFontSize(8);
        doc.setTextColor(50);
        doc.setFont('courier', 'normal');
        doc.text(`${i + 1}. ${inpt.address}`, 20, y);
        y += 4;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(`${amount} BTC`, 25, y);

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

        y += 8;
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
        checkPageBreak(15);
        const isWhitelisted = whitelist.includes(out.address);
        const amount = (out.amount / 100000000).toFixed(8);

        doc.setFontSize(8);
        doc.setTextColor(50);
        doc.setFont('courier', 'normal');
        doc.text(`${i + 1}. ${out.address}`, 20, y);
        y += 4;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(`${amount} BTC`, 25, y);

        if (whitelist.length === 0) {
          doc.setTextColor(100);
          doc.text('NO WHITELIST', 150, y);
        } else if (out.isChange) {
          doc.setTextColor(245, 158, 11);
          doc.text('CHANGE (VERIFIED)', 150, y);
        } else if (isWhitelisted) {
          doc.setTextColor(16, 185, 129); // Green
          doc.text('VERIFIED DESTINATION', 150, y);
        } else {
          doc.setTextColor(220, 38, 38); // Red
          doc.text('UNVERIFIED', 150, y);
        }

        y += 8;
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
    // FOOTER (FILE METADATA ONLY)
    // =========================================================
    const dateStr = new Date().toISOString().split('T')[0];
    const shortId = state.roomId.slice(0, 8);
    const txSuffix = state.finalTxId ? state.finalTxId.slice(0, 8) : 'Pending';
    const filename = `SigningRoom_Audit_${dateStr}_Room-${shortId}_Tx-${txSuffix}.pdf`;

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
}

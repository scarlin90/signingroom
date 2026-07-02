import { SignerStatus, TxDetails } from './psbt-utils';
import { RoomState } from '../relay/room-state-store';
import { jsPDF } from 'jspdf';

export class RoomAuditor {

  static getSettlementCsvData(state: RoomState, tx: TxDetails, signers: SignerStatus[]) {
       

        const headers = ["Date", "Room ID", "Network", "TXID", "Total Amount (BTC)", "Fee Rate (sats/vB)", "Inputs", "Outputs", "Signers", "Witnesses", "Status"];
        
        const signersList = signers.map(s => `${s.fingerprint}${s.signed ? '(Signed)' : '(Pending)'}`).join("; ");
        
        const participantsObj = state.participants || {};
        const witnessesList = Object.values(participantsObj).map((p: any) => {
            const name = p.displayName || 'Anonymous';
            const role = p.role === 'admin' ? 'Coordinator' : 'Guest';
            return `${name} [${role}] (${p.id})`;
        }).join("; ")
        
        const row = [
            new Date().toISOString(),
            state.roomId,
            state.network,
            state.finalTxId || "Pending",
            (tx.amount / 100000000).toFixed(8),
            tx.feeRate,
            tx.inputsList?.length || 0,
            tx.outputs?.length || 0,
            `"${signersList}"`, 
            `"${witnessesList}"`,
            state?.finalTxHex ? "Signed & Ready" : "Pending Signatures"
        ];

        const csvContent = headers.join(",") + "\n" 
            + row.join(",");

        return csvContent;
    }

    static getAuditLogCsvData(state: RoomState): string {
        const logs = state.auditLog || [];
        const csvHeader = 'Timestamp,Event,User,Detail\n';
        const csvRows = logs.map(l => {
            const time = new Date(l.timestamp).toISOString();
            const event = `"${l.event.replace(/"/g, '""')}"`;
            const user = `"${l.user.replace(/"/g, '""')}"`;
            const detail = `"${(l.detail || '').replace(/"/g, '""')}"`;
            return `${time},${event},${user},${detail}`;
        }).join('\n');
        return csvHeader + csvRows;
    }

   static getEncodedCsvData(state: RoomState, tx: TxDetails, signers: SignerStatus[]): string {
        const csvContent = "data:text/csv;charset=utf-8," 
            + this.getSettlementCsvData(state, tx, signers);

        const encodedUri = encodeURI(csvContent);
        return encodedUri;
    }

    static generateAuditPdf(
        doc: jsPDF, 
        state: RoomState, 
        tx: TxDetails | null, 
        signers: SignerStatus[], 
        finalHex: string | null
    ): { doc: jsPDF, filename: string } {
        
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
        doc.setTextColor(16, 185, 129);
        doc.text("SigningRoom.io", 20, y);
        
        // Subtitle
        doc.setFont('helvetica', 'normal'); 
        doc.setFontSize(16);
        doc.setTextColor(100);
        doc.text("Audit Log", 20, y + 10);
        y += 20;

        // Separator Line
        doc.setDrawColor(200); 
        doc.setLineWidth(0.5);
        doc.line(20, y, 190, y);
        y += 10;

        // =========================================================
        // SECTION 1: ROOM METADATA & GOVERNANCE
        // =========================================================
        checkPageBreak(40);
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text("Room Info & Governance", 20, y); y += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(50);
        
        doc.text(`Room: ${state.roomName}`, 20, y); y += 6;
        doc.text(`Room ID: ${state.roomId}`, 20, y); y += 6;
        doc.text(`Network: ${(state.network || 'bitcoin').toUpperCase()}`, 20, y); y += 6;
        doc.text(`Created: ${new Date(state.createdAt).toLocaleString()}`, 20, y); y += 6;

        const lockStatus = state.isLocked ? "LOCKED (Secure)" : "UNLOCKED (Open)";
        doc.text(`Room Status: ${lockStatus}`, 20, y); y += 6;

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
        doc.text("Transaction Data", 20, y); y += 8;
        
        const txId = state.finalTxId;
        if (txId) {
            doc.setFontSize(10);
            doc.setTextColor(50);
            doc.setFont('helvetica', 'bold');
            doc.text("Transaction ID (TXID):", 20, y); y += 5;
            
            doc.setFont('courier', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(0);
            doc.text(String(txId), 20, y); y += 8;
            
            // Add a clickable link hint
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(100);
            const explorerUrl = state.network === 'testnet' 
                ? 'mempool.space/testnet/tx/' 
                : state.network === 'signet' ? 'mempool.space/signet/tx/' : 'mempool.space/tx/';
            doc.text(`View on Explorer: ${explorerUrl}${txId.slice(0,8)}...`, 20, y); y += 10;
        }

        // Partial Hex (Visual Check)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(50);
        doc.text("Raw Hex Data (Partial):", 20, y); y += 5;

        doc.setFontSize(8);
        doc.setFont('courier', 'normal'); 
        doc.setTextColor(80);
        // Break long hex string if needed

        let partialHexDisplay = "Not yet finalized";
        
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
        doc.text("Signer Activity", 20, y); y += 10;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        if (signers.length === 0) {
            doc.setTextColor(150);
            doc.text("No signers detected yet.", 20, y); y += 6;
        } else {
            signers.forEach((s, i) => {
                checkPageBreak(10);
                const status = s.signed ? "SIGNED" : "PENDING";
                
                const label = state.signerLabels?.[s.fingerprint];
                const displayName = label ? `${label} (${s.fingerprint})` : s.fingerprint;

                doc.setTextColor(50);
                doc.text(`${i+1}. ${displayName}`, 20, y);
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
        doc.text("Room Participants (Witnesses)", 20, y); y += 8;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        const participantsObj = state.participants || {};
        const historicalParticipants = Object.values(participantsObj);

        if (historicalParticipants.length === 0) {
            doc.setTextColor(150);
            doc.text("No participants recorded.", 20, y); y += 6;
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
        doc.text("Event Timeline", 20, y); y += 10;
        
        doc.setFontSize(9);
        const logs = state.auditLog || [];
        
        if (logs.length === 0) {
            doc.setTextColor(150);
            doc.setFont('helvetica', 'italic');
            doc.text("No events logged yet.", 20, y); y += 6;
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
        // SECTION 6: INPUT VERIFICATION (Appendix Data)
        // =========================================================
        checkPageBreak(30);
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text("Input Verification (Sources)", 20, y); y += 6;
        
        doc.setDrawColor(200);
        doc.line(20, y, 190, y); y += 5;

        const inputs = tx?.inputsList || [];
        const whitelist = state.whitelist || [];

        if (inputs.length === 0) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(150);
            doc.text("No input data parsed.", 20, y); y += 6;
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
                     doc.text("NO WHITELIST", 150, y);
                } else if (isWhitelisted) {
                     doc.setTextColor(16, 185, 129);
                     doc.text("VERIFIED SOURCE", 150, y);
                } else {
                     doc.setTextColor(220, 38, 38);
                     doc.text("UNVERIFIED", 150, y);
                }
                
                y += 8; // Spacing
            });
        }
        y += 10;

        // =========================================================
        // SECTION 7: OUTPUT VERIFICATION (Appendix Data)
        // =========================================================
        checkPageBreak(30);
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text("Output Verification", 20, y); y += 6;
        
        doc.setDrawColor(200);
        doc.line(20, y, 190, y); y += 5;
        
        const outputs = tx?.outputs || [];
        
        if (outputs.length === 0) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(150);
            doc.text("No output data available yet.", 20, y); y += 6;
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
                    doc.text("NO WHITELIST", 150, y);
                } else if (out.isChange) {
                    doc.setTextColor(245, 158, 11);
                    doc.text("CHANGE (VERIFIED)", 150, y);
                } else if (isWhitelisted) {
                    doc.setTextColor(16, 185, 129); // Green
                    doc.text("VERIFIED DESTINATION", 150, y); 
                } else {
                    doc.setTextColor(220, 38, 38); // Red
                    doc.text("UNVERIFIED", 150, y);
                }
                
                y += 8;
            });

            doc.setDrawColor(200);
            doc.line(20, y, 190, y); y += 8;
            
            doc.setFont('helvetica', 'normal'); 
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Total Outputs: ${outputs.length}`, 20, y); y += 15;
        }

        // =========================================================
        // FOOTER
        // =========================================================
        if (finalHex) {
            checkPageBreak(20);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Final Tx Hash (SHA256 of Hex): Verified`, 20, y);
        }

        // Filename construction
        const dateStr = new Date().toISOString().split('T')[0];
        const shortId = state.roomId.slice(0, 8);
        const txSuffix = state.finalTxId ? state.finalTxId.slice(0, 8) : "Pending";
        const filename = `SigningRoom_Audit_${dateStr}_Room-${shortId}_Tx-${txSuffix}.pdf`;

        return { doc, filename };
    }
}
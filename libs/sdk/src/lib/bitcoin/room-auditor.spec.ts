import { describe, it, expect, vi, beforeAll } from 'vitest';
import { RoomAuditor } from './room-auditor';
import { RoomState } from '../relay/room-state-store';
import { TxDetails, SignerStatus } from './psbt-utils';
import { jsPDF } from 'jspdf';
import { webcrypto } from 'node:crypto';

describe('RoomAuditor', () => {
  // 1. Setup mock environment for Crypto & jsPDF
  beforeAll(() => {
    if (typeof global !== 'undefined' && !global.crypto) {
      Object.defineProperty(global, 'crypto', {
        value: webcrypto,
        writable: true,
        configurable: true,
      });
    }
  });

  const createMockDoc = (): jsPDF => {
    return {
      addPage: vi.fn(),
      setFont: vi.fn(),
      setFontSize: vi.fn(),
      setTextColor: vi.fn(),
      text: vi.fn(),
      setDrawColor: vi.fn(),
      setLineWidth: vi.fn(),
      line: vi.fn(),
    } as unknown as jsPDF;
  };

  const mockState: RoomState = {
    roomId: 'room-123',
    roomName: 'Test Room',
    network: 'testnet',
    createdAt: 1672531200000,
    isLocked: false,
    coordinatorId: 'coord-1',
    participants: {
      'sess-1': { id: 'sess-1', role: 'admin', joinedAt: 100, displayName: 'Alice', pubkey: null },
      'sess-2': { id: 'sess-2', role: 'guest', joinedAt: 101, displayName: 'Bob', pubkey: null },
    },
    psbtBase64: 'mock-psbt',
    signerLabels: { aabbccdd: 'Cold Storage' },
    auditLog: [
      { timestamp: 1672531200000, event: 'Room Created', user: 'System', detail: 'Init' },
      { timestamp: 1672531250000, event: 'Guest Joined', user: 'Bob', detail: 'From IP' },
    ],
    whitelist: ['tb1qmockaddress'],
    finalTxId: 'txid-12345',
    finalTxHex: '01000000mockhex',
  };

  const mockTx: TxDetails = {
    amount: 50000000, // 0.5 BTC
    fee: 1000,
    vBytes: 150,
    feeRate: 6.66,
    inputs: 1,
    inputsList: [{ address: 'tb1qinput', amount: 50001000, txId: 'old-tx', vout: 0 }],
    outputs: [
      { address: 'tb1qmockaddress', amount: 40000000, isChange: false }, // Whitelisted
      { address: 'tb1qchange', amount: 10000000, isChange: true }, // Change
      { address: 'tb1qbad', amount: 0, isChange: false }, // Unverified
    ],
  };

  const mockSigners: SignerStatus[] = [
    { fingerprint: 'aabbccdd', signed: true },
    { fingerprint: 'eeff0011', signed: false },
  ];

  describe('CSV Generation & Export', () => {
    it('should correctly format settlement data into a CSV string', () => {
      const csv = RoomAuditor.getSettlementCsvData(mockState, mockTx, mockSigners);
      expect(csv).toContain('Date,Room ID,Network,TXID,Total Amount (BTC)');
      expect(csv).toContain('room-123');
      expect(csv).toContain('0.50000000');
      expect(csv).toContain('aabbccdd(Signed)');
      expect(csv).toContain('eeff0011(Pending)');
      expect(csv).toContain('Alice [Coordinator] (sess-1)');
      expect(csv).toContain('Signed & Ready');
    });

    it('should handle missing state data gracefully when generating settlement CSV', () => {
      const emptyState = {
        ...mockState,
        participants: undefined,
        finalTxHex: null,
        finalTxId: undefined,
      };
      const csv = RoomAuditor.getSettlementCsvData(emptyState as any, mockTx, []);
      expect(csv).toContain('Pending Signatures');
      expect(csv).toContain('Pending'); // TXID fallback
      expect(csv).toContain('""'); // Empty signers/witnesses strings
    });

    it('should fallback to Anonymous and 0 for missing participant names and tx maps', () => {
      const edgeState = {
        ...mockState,
        participants: {
          'sess-3': { id: 'sess-3', role: 'guest', joinedAt: 100, displayName: '', pubkey: null },
        },
      };
      const edgeTx = { ...mockTx, inputsList: undefined, outputs: undefined } as any;
      const csv = RoomAuditor.getSettlementCsvData(edgeState, edgeTx, []);

      expect(csv).toContain('Anonymous [Guest] (sess-3)'); // Hits L38 fallback
      expect(csv).toContain('6.66,0,0,'); // Hits L47 and L48 fallback
    });

    it('should transform the chronological audit log into a flat CSV', () => {
      const csv = RoomAuditor.getAuditLogCsvData(mockState);
      expect(csv).toContain('Timestamp,Event,User,Detail');
      expect(csv).toContain('"Room Created"');
      expect(csv).toContain('"Bob"');
    });

    it('should handle missing audit logs and details gracefully', () => {
      const emptyState = {
        ...mockState,
        auditLog: undefined,
      };
      const csv = RoomAuditor.getAuditLogCsvData(emptyState as any);

      // The implementation returns 'Timestamp,Event,User,Detail\n'
      // splitting this on '\n' results in ['Timestamp,Event,User,Detail', '']
      expect(csv.split('\n').length).toBe(2);
    });

    it('should generate a valid URI-encoded data string for direct browser downloads', () => {
      const uri = RoomAuditor.getEncodedCsvData(mockState, mockTx, mockSigners);
      expect(uri).toMatch(/^data:text\/csv;charset=utf-8,.+/);
      expect(uri).toContain('room-123');
    });
  });

  describe('PDF Report Generation (jsPDF Interfacing)', () => {
    it('should successfully append data to the jsPDF document and generate a filename', async () => {
      const mockDoc = createMockDoc();
      const { doc, filename } = await RoomAuditor.generateAuditPdf(
        mockDoc,
        mockState,
        mockTx,
        mockSigners,
        mockState.finalTxHex!,
      );

      expect(doc.text).toHaveBeenCalledWith('SigningRoom.io', 20, 20);
      expect(doc.text).toHaveBeenCalledWith(
        expect.stringContaining('Room ID: room-123'),
        20,
        expect.any(Number),
      );
      expect(doc.text).toHaveBeenCalledWith(
        expect.stringContaining('Active'),
        20,
        expect.any(Number),
      );
      expect(filename).toMatch(/SigningRoom_Audit_.*_Room-room-123_Tx-txid-123.pdf/);
    });

    it('should safely render default fallbacks when optional state properties are undefined', async () => {
      const mockDoc = createMockDoc();
      const undefinedState: any = {
        ...mockState,
        network: undefined, // Hits L126 ('bitcoin')
        whitelist: undefined, // Hits L134 and L331([])
        participants: undefined, // Hits L243 ({})
        auditLog: undefined, // Hits L273([])
        isLocked: true, // Hits L131 ('LOCKED (Secure)')
      };

      await RoomAuditor.generateAuditPdf(mockDoc, undefinedState, null, [], null);

      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('Network: BITCOIN'),
        20,
        expect.any(Number),
      );
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('LOCKED (Secure)'),
        20,
        expect.any(Number),
      );
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('Disabled'),
        20,
        expect.any(Number),
      );
    });

    it('should accurately color-code inputs and outputs based on whitelist and change status', async () => {
      const mockDoc = createMockDoc();

      // Test 1: Hit "VERIFIED SOURCE" for Inputs (L397-398) by using a whitelisted address as an input
      const whitelistedInputTx = {
        ...mockTx,
        inputsList: [{ address: 'tb1qmockaddress', amount: 50000000, txId: 'old-tx', vout: 0 }],
      };
      await RoomAuditor.generateAuditPdf(mockDoc, mockState, whitelistedInputTx, mockSigners, null);
      expect(mockDoc.text).toHaveBeenCalledWith('VERIFIED SOURCE', 150, expect.any(Number));

      // Test 2: Hit "NO WHITELIST" branches
      const emptyWhitelistState = { ...mockState, whitelist: [] };
      await RoomAuditor.generateAuditPdf(mockDoc, emptyWhitelistState, mockTx, mockSigners, null);
      expect(mockDoc.text).toHaveBeenCalledWith('NO WHITELIST', 150, expect.any(Number));

      // Test 3: Standard Output variations
      await RoomAuditor.generateAuditPdf(mockDoc, mockState, mockTx, mockSigners, null);
      expect(mockDoc.text).toHaveBeenCalledWith('UNVERIFIED', 150, expect.any(Number));
      expect(mockDoc.text).toHaveBeenCalledWith('VERIFIED DESTINATION', 150, expect.any(Number));
      expect(mockDoc.text).toHaveBeenCalledWith('CHANGE (VERIFIED)', 150, expect.any(Number));
    });

    it('should trigger string truncation for log details exceeding 30 characters', async () => {
      const mockDoc = createMockDoc();
      const longLogState = {
        ...mockState,
        auditLog: [
          {
            timestamp: 1000,
            event: 'Test',
            user: 'System',
            detail: 'This detail is explicitly longer than thirty characters.',
          },
        ],
      };

      await RoomAuditor.generateAuditPdf(mockDoc, longLogState, mockTx, mockSigners, null);
      // Hits L301 string truncation logic
      expect(mockDoc.text).toHaveBeenCalledWith(
        'This detail is explicitly l...',
        150,
        expect.any(Number),
      );
    });

    it('should handle falsy values in audit logs safely', async () => {
      const mockDoc = createMockDoc();
      const badLogState: any = {
        ...mockState,
        auditLog: [
          null, // Hits L282 (!log) return
          { timestamp: 0, event: '', user: '' }, // Hits L285, L286, L288, L289 fallbacks
        ],
      };

      await RoomAuditor.generateAuditPdf(mockDoc, badLogState, mockTx, mockSigners, null);

      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('System Event'),
        65,
        expect.any(Number),
      );
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('--:--'),
        20,
        expect.any(Number),
      );
    });

    it('should fallback to Anonymous for participants missing displayName', async () => {
      const mockDoc = createMockDoc();
      const edgeState: any = {
        ...mockState,
        participants: {
          'sess-3': { id: 'sess-3', role: 'guest', joinedAt: 100, displayName: '', pubkey: null },
        },
      };

      await RoomAuditor.generateAuditPdf(mockDoc, edgeState, mockTx, mockSigners, null);
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('Anonymous [Guest]'),
        20,
        expect.any(Number),
      );
    });

    it('should format unlabeled signers with their raw fingerprint', async () => {
      const mockDoc = createMockDoc();
      const unlabeledState = { ...mockState, signerLabels: {} };
      const rawSigner = [{ fingerprint: '99887766', signed: false }];

      await RoomAuditor.generateAuditPdf(mockDoc, unlabeledState, mockTx, rawSigner, null);
      expect(mockDoc.text).toHaveBeenCalledWith('1. 99887766', 20, expect.any(Number));
    });

    it('should correctly format explorer links across networks', async () => {
      const mockDoc = createMockDoc();

      await RoomAuditor.generateAuditPdf(mockDoc, mockState, mockTx, mockSigners, null);
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('mempool.space/testnet/tx/txid-123'),
        20,
        expect.any(Number),
      );

      await RoomAuditor.generateAuditPdf(
        mockDoc,
        { ...mockState, network: 'signet' },
        mockTx,
        mockSigners,
        null,
      );
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('mempool.space/signet/tx/txid-123'),
        20,
        expect.any(Number),
      );

      await RoomAuditor.generateAuditPdf(
        mockDoc,
        { ...mockState, network: 'bitcoin' },
        mockTx,
        mockSigners,
        null,
      );
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('mempool.space/tx/txid-123'),
        20,
        expect.any(Number),
      );
    });

    it('should trigger page breaks dynamically when Y exceeds threshold', async () => {
      const mockDoc = createMockDoc();
      const hugeLogState = {
        ...mockState,
        auditLog: new Array(50).fill({ timestamp: 100, event: 'E' }),
      };

      await RoomAuditor.generateAuditPdf(mockDoc, hugeLogState, mockTx, mockSigners, null);
      expect(mockDoc.addPage).toHaveBeenCalled();
    });
  });

  describe('Cryptographic Integrity Anchoring', () => {
    it('should calculate a deterministic SHA-256 anchor based on state and hex', async () => {
      const anchor = await RoomAuditor.calculateForensicAnchor(
        mockState.auditLog!,
        mockState.finalTxHex!,
      );
      expect(anchor).toBeDefined();
      expect(typeof anchor).toBe('string');
      expect(anchor.length).toBe(64);
    });

    it('should handle undefined details safely in calculateForensicAnchor', async () => {
      const edgeLog = [{ timestamp: 100, event: 'Test', user: 'Bob', detail: undefined }] as any;
      const anchor = await RoomAuditor.calculateForensicAnchor(edgeLog, 'mockHex');
      expect(anchor.length).toBe(64); // Hits L497 fallback
    });

    it('should verify a valid anchor successfully', async () => {
      const anchor = await RoomAuditor.calculateForensicAnchor(
        mockState.auditLog!,
        mockState.finalTxHex!,
      );
      const result = await RoomAuditor.verifyRoomIntegrity(mockState, anchor);

      expect(result.isValid).toBe(true);
      expect(result.anchor).toBe(anchor);
    });

    it('should fail verification if the expected anchor mismatches the calculated one', async () => {
      const result = await RoomAuditor.verifyRoomIntegrity(mockState, 'bad-anchor-123');
      expect(result.isValid).toBe(false);
    });

    it('should throw an error during verification if the finalTxHex is missing', async () => {
      const incompleteState = { ...mockState, finalTxHex: null };
      await expect(RoomAuditor.verifyRoomIntegrity(incompleteState, 'any')).rejects.toThrow(
        'Room not finalized or audit log missing',
      );
    });

    it('should throw an error during verification if the audit log is missing', async () => {
      const incompleteState = { ...mockState, auditLog: undefined };
      await expect(RoomAuditor.verifyRoomIntegrity(incompleteState, 'any')).rejects.toThrow(
        'Room not finalized or audit log missing',
      );
    });

    it('should extract a valid integrity report containing the anchor and timestamp', async () => {
      const report = await RoomAuditor.getIntegrityReport(mockState);
      expect(report.anchor.length).toBe(64);
      expect(report.timestamp).toBeDefined();
    });

    it('should throw an error when generating a report for a room missing an audit log', async () => {
      const incompleteState = { ...mockState, auditLog: undefined };
      await expect(RoomAuditor.getIntegrityReport(incompleteState)).rejects.toThrow(
        'Room not finalized',
      );
    });

    it('should throw an error when generating a report for a room missing finalTxHex', async () => {
      const incompleteState = { ...mockState, finalTxHex: null };
      await expect(RoomAuditor.getIntegrityReport(incompleteState)).rejects.toThrow(
        'Room not finalized',
      );
    });
  });
});

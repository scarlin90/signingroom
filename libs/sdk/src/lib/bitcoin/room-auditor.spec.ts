import { describe, it, expect, vi, beforeAll } from 'vitest';
import { RoomAuditor } from './room-auditor';
import { RoomState } from '../relay/room-state-store';
import { TxDetails, SignerStatus } from './psbt-utils';
import { jsPDF } from 'jspdf';
import { webcrypto } from 'node:crypto';

describe('RoomAuditor', () => {
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
      internal: {
        getNumberOfPages: vi.fn().mockReturnValue(1),
        pageSize: { getWidth: vi.fn().mockReturnValue(210), getHeight: vi.fn().mockReturnValue(297) },
      },
      addPage: vi.fn(),
      setPage: vi.fn(),
      setFont: vi.fn(),
      setFontSize: vi.fn(),
      setTextColor: vi.fn(),
      text: vi.fn(),
      getTextWidth: vi.fn().mockReturnValue(50),
      textWithLink: vi.fn(),
      setDrawColor: vi.fn(),
      setLineWidth: vi.fn(),
      line: vi.fn(),
      splitTextToSize: vi.fn().mockImplementation((text) => [text]),
      getImageProperties: vi.fn().mockReturnValue({ width: 550, height: 160 }),
      addImage: vi.fn(),
      saveGraphicsState: vi.fn(),
      setGState: vi.fn(),
      restoreGraphicsState: vi.fn(),
      GState: class MockGState { constructor() {} },
    } as unknown as jsPDF;
  };

  const mockState: RoomState = {
    roomId: 'room-123',
    roomName: 'Test Room',
    network: 'testnet',
    createdAt: 1672531200000,
    isLocked: false,
    protocolVersion: '1.0.0',
    participants: {
      'sess-1': { id: 'sess-1', role: 'admin', displayName: 'Alice' },
      'sess-2': { id: 'sess-2', role: 'guest', displayName: 'Bob' },
    },
    psbt: 'mock-psbt',
    signatures: [],
    connectedCount: 2,
    expiresAt: 1672531200000 + 86400000,
    signerLabels: { aabbccdd: 'Cold Storage' },
    addressLabels: { tb1qinput: 'Primary Vault', tb1qmockaddress: 'Corporate Treasury' },
    auditLog: [
      { timestamp: 1672531200000, event: 'Room Created', user: 'System', detail: 'Init' },
      { timestamp: 1672531250000, event: 'Guest Joined', user: 'Bob', detail: 'From IP' },
    ],
    whitelist: ['tb1qmockaddress'],
    finalTxId: 'txid-12345',
    finalTxHex: '01000000mockhex',
  };

  const mockTx: TxDetails = {
    txId: 'mock-tx-id',
    amount: 50000000, // 0.5 BTC
    fee: 1000,
    vBytes: 150,
    feeRate: 6.66,
    inputs: 1,
    inputsList: [{ address: 'tb1qinput', amount: 50001000, txId: 'old-tx', vout: 0, scriptType: 'P2TR', sequence: 0, isRbfEnabled: true }],
    outputs: [
      { address: 'tb1qmockaddress', amount: 40000000, isChange: false, scriptType: 'P2TR' }, // Whitelisted
      { address: 'tb1qchange', amount: 10000000, isChange: true, scriptType: 'P2WSH' }, // Change
      { address: 'tb1qbad', amount: 0, isChange: false, scriptType: 'P2SH' }, // Unverified
    ],
    lockTime: 900000,
    hasRelativeTimelock: true,
    relativeTimelockValue: '144 Blocks',
    isRbfEnabled: true,
  };

  const mockSigners: SignerStatus[] = [
    { fingerprint: 'aabbccdd', signed: true },
    { fingerprint: 'eeff0011', signed: false },
  ];

  describe('CSV Generation & Export', () => {
    it('should correctly format settlement data into a CSV string including RBF flag', () => {
      const csv = RoomAuditor.getSettlementCsvData(mockState, mockTx, mockSigners);
      expect(csv).toContain('Date,Room ID,Network,TXID,Total Amount (BTC),Fee Rate (sats/vB),RBF Enabled');
      expect(csv).toContain('room-123');
      expect(csv).toContain('0.50000000');
      expect(csv).toContain('Yes'); // RBF Enabled
      expect(csv).toContain('aabbccdd(Signed)');
      expect(csv).toContain('eeff0011(Pending)');
      expect(csv).toContain('Alice [Coordinator] (sess-1)');
      expect(csv).toContain('Signed & Ready');
    });

    it('should handle missing state data gracefully when generating settlement CSV', () => {
      const emptyState = {
        ...mockState,
        participants: undefined,
        finalTxHex: undefined,
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
          'sess-3': { id: 'sess-3', role: 'guest', displayName: '' },
        },
      };
      const edgeTx = { ...mockTx, inputsList: undefined, outputs: undefined } as any;
      const csv = RoomAuditor.getSettlementCsvData(edgeState, edgeTx, []);

      expect(csv).toContain('Anonymous [Guest] (sess-3)'); 
      expect(csv).toContain('6.66,Yes,0,0,'); 
    });

    it('should transform the chronological audit log into a flat CSV', () => {
      const csv = RoomAuditor.getAuditLogCsvData(mockState);
      expect(csv).toContain('Timestamp,Event,User,Detail');
      expect(csv).toContain('"Room Created"');
      expect(csv).toContain('"Bob"');
    });

    it('should inject a forensic metadata header if a valid license token exists on the state', () => {
      const licensedState = { ...mockState, licenseToken: 'srl_mockToken123' };
      const csv = RoomAuditor.getAuditLogCsvData(licensedState as any);
      expect(csv).toContain('# --- SIGNING ROOM FORENSIC AUDIT RECORD ---');
      expect(csv).toContain('# License-Token: srl_mockToken123');
    });

    it('should handle missing audit logs and details gracefully', () => {
      const emptyState = {
        ...mockState,
        auditLog: undefined,
      };
      const csv = RoomAuditor.getAuditLogCsvData(emptyState as any);

      expect(csv.split('\n').length).toBe(2);
    });

    it('should extract a valid license token from an exported CSV header', () => {
      const mockCsv = `# --- SIGNING ROOM FORENSIC AUDIT RECORD ---\n# License-Token: srl_test123\nTimestamp,Event`;
      const token = RoomAuditor.extractLicenseTokenFromCsv(mockCsv);
      expect(token).toBe('srl_test123');
    });

    it('should return null if no token is present in the CSV header', () => {
      const mockCsv = `# --- SIGNING ROOM FORENSIC AUDIT RECORD ---\nTimestamp,Event`;
      const token = RoomAuditor.extractLicenseTokenFromCsv(mockCsv);
      expect(token).toBeNull();
    });

    it('should generate a valid URI-encoded data string for direct browser downloads', () => {
      const uri = RoomAuditor.getEncodedCsvData(mockState, mockTx, mockSigners);
      expect(uri).toMatch(/^data:text\/csv;charset=utf-8,.+/);
      expect(uri).toContain('room-123');
    });
  });

  describe('PDF Report Generation (jsPDF Interfacing)', () => {
    it('should default to Community Edition rendering when no license is provided', async () => {
      const mockDoc = createMockDoc();
      await RoomAuditor.generateAuditPdf(mockDoc, mockState, mockTx, mockSigners, null);

      expect(mockDoc.text).toHaveBeenCalledWith('SigningRoom.io (Community Edition)', 20, 20);
      expect(mockDoc.text).toHaveBeenCalledWith('Community Edition (Unlicensed Node)', expect.any(Number), expect.any(Number));
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('VALID (Community Edition)'),
        expect.any(Number),
        expect.any(Number),
      );
      expect(mockDoc.text).toHaveBeenCalledWith(
        'SIGNING ROOM COMMUNITY EDITION — UNVERIFIED NODE',
        expect.any(Number),
        expect.any(Number),
        expect.any(Object),
      );
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('Generated on an unlicensed community node'),
        expect.any(Number),
        expect.any(Number),
        expect.any(Object),
      );
    });

    it('should correctly format and render an Enterprise license with an expiration countdown', async () => {
      const mockDoc = createMockDoc();
      const mockExpiry = Date.now() + 5 * 24 * 60 * 60 * 1000; // 5 days from now
      
      const options = {
        license: {
          tier: 'ENTERPRISE',
          isValid: true,
          payload: {
            licensee: 'Acme Corp',
            registration: '12345',
            registeredOffice: 'London, UK',
            expiresAt: mockExpiry,
          },
          rawToken: 'srl_mockToken123',
        } as any,
      };

      await RoomAuditor.generateAuditPdf(mockDoc, mockState, mockTx, mockSigners, null, options);

      expect(mockDoc.text).toHaveBeenCalledWith('Enterprise Edition — Acme Corp', expect.any(Number), expect.any(Number));
      expect(mockDoc.setTextColor).toHaveBeenCalledWith(16, 185, 129); // Green status
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('VALID (5 Days Remaining)'),
        expect.any(Number),
        expect.any(Number),
      );
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('© 2026 Acme Corp (No. 12345) • London, UK'),
        expect.any(Number),
        expect.any(Number),
        expect.any(Object),
      );
      expect(mockDoc.text).toHaveBeenCalledWith('License Token:', expect.any(Number), expect.any(Number));
    });

    it('should render an Expired Enterprise license in Red', async () => {
      const mockDoc = createMockDoc();
      const options = {
        license: {
          tier: 'ENTERPRISE',
          isValid: false,
          payload: { licensee: 'Acme Corp', expiresAt: 1000 }, // Expired timestamp
        } as any,
      };

      await RoomAuditor.generateAuditPdf(mockDoc, mockState, mockTx, mockSigners, null, options);

      expect(mockDoc.setTextColor).toHaveBeenCalledWith(220, 38, 38); // Red status
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('INVALID (Expired)'),
        expect.any(Number),
        expect.any(Number),
      );
      // Even though tier was enterprise, invalid licenses trigger community watermark fallback
      expect(mockDoc.text).toHaveBeenCalledWith(
        'SIGNING ROOM COMMUNITY EDITION — UNVERIFIED NODE',
        expect.any(Number),
        expect.any(Number),
        expect.any(Object),
      );
    });

    it('should apply the subtle Public Good watermark and footer when licensed appropriately', async () => {
      const mockDoc = createMockDoc();
      const options = {
        license: {
          tier: 'PUBLIC_GOOD',
          isValid: true,
          payload: { expiresAt: 0 }, // Perpetual
        } as any,
      };

      await RoomAuditor.generateAuditPdf(mockDoc, mockState, mockTx, mockSigners, null, options);

      expect(mockDoc.text).toHaveBeenCalledWith('Public Good Coordinator (signingroom.io)', expect.any(Number), expect.any(Number));
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('VALID (Perpetual)'),
        expect.any(Number),
        expect.any(Number),
      );
      expect(mockDoc.text).toHaveBeenCalledWith(
        'SigningRoom.io',
        expect.any(Number),
        expect.any(Number),
        expect.any(Object),
      );
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('Operated by Stateless Research Ltd (UK Co. 16990515) • For commercial licensing'),
        expect.any(Number),
        expect.any(Number),
        expect.any(Object),
      );
    });

    it('should degrade watermark opacity fallback if GState is not supported by jsPDF instance', async () => {
      const mockDoc = createMockDoc();
      // Force the GState mock to throw to test the catch block
      vi.spyOn(mockDoc as any, 'saveGraphicsState').mockImplementationOnce(() => {
        throw new Error('GState not supported');
      });

      await RoomAuditor.generateAuditPdf(mockDoc, mockState, mockTx, mockSigners, null);
      
      expect(mockDoc.setTextColor).toHaveBeenCalledWith(245, 220, 220); // Fallback color
    });

    it('should successfully append data to the jsPDF document and generate a filename', async () => {
      const mockDoc = createMockDoc();
      const { doc, filename } = await RoomAuditor.generateAuditPdf(
        mockDoc,
        mockState,
        mockTx,
        mockSigners,
        mockState.finalTxHex!,
      );

      expect(doc.text).toHaveBeenCalledWith('SigningRoom.io (Community Edition)', 20, 20);
      expect(doc.text).toHaveBeenCalledWith(
        expect.stringContaining('Room ID:'),
        20,
        expect.any(Number),
      );
      expect(doc.text).toHaveBeenCalledWith(
        expect.stringContaining('Active'),
        expect.any(Number),
        expect.any(Number),
      );
      // Verify new Settlement Details are rendered
      expect(doc.text).toHaveBeenCalledWith('Settlement Details:', 20, expect.any(Number));
      expect(doc.text).toHaveBeenCalledWith(expect.stringContaining('Size: 150 vB'), 145, expect.any(Number));
      
      // Verify temporal constraints section rendered
      expect(doc.text).toHaveBeenCalledWith(
        expect.stringContaining('Temporal Constraints (Timelocks)'),
        20,
        expect.any(Number),
      );
      expect(filename).toMatch(/SigningRoom_COMMUNITY_Audit_.*_Room-room-123_Tx-txid-123.pdf/);
    });

    it('should safely render default fallbacks when optional state properties are undefined', async () => {
      const mockDoc = createMockDoc();
      const undefinedState: any = {
        ...mockState,
        network: undefined, 
        whitelist: undefined, 
        participants: undefined, 
        auditLog: undefined, 
        isLocked: true, 
      };

      await RoomAuditor.generateAuditPdf(mockDoc, undefinedState, null, [], null);

      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('BITCOIN'),
        expect.any(Number),
        expect.any(Number),
      );
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('LOCKED (Secure)'),
        expect.any(Number),
        expect.any(Number),
      );
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('Disabled'),
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('should accurately color-code inputs and outputs based on whitelist and change status', async () => {
      const mockDoc = createMockDoc();

      const whitelistedInputTx = {
        ...mockTx,
        inputsList: [{ address: 'tb1qmockaddress', amount: 50000000, txId: 'old-tx', vout: 0, scriptType: 'P2TR', sequence: 0, isRbfEnabled: false }],
      };
      await RoomAuditor.generateAuditPdf(mockDoc, mockState, whitelistedInputTx, mockSigners, null);
      expect(mockDoc.text).toHaveBeenCalledWith('VERIFIED SOURCE', 150, expect.any(Number));

      const emptyWhitelistState = { ...mockState, whitelist: [] };
      await RoomAuditor.generateAuditPdf(mockDoc, emptyWhitelistState, mockTx, mockSigners, null);
      expect(mockDoc.text).toHaveBeenCalledWith('NO WHITELIST', 150, expect.any(Number));

      await RoomAuditor.generateAuditPdf(mockDoc, mockState, mockTx, mockSigners, null);
      expect(mockDoc.text).toHaveBeenCalledWith('UNVERIFIED', 150, expect.any(Number));
      expect(mockDoc.text).toHaveBeenCalledWith('VERIFIED DESTINATION', 150, expect.any(Number));
      expect(mockDoc.text).toHaveBeenCalledWith('CHANGE (VERIFIED)', 150, expect.any(Number));
    });

    it('should wrap text for log details using splitTextToSize', async () => {
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

      expect(mockDoc.splitTextToSize).toHaveBeenCalledWith(
        'This detail is explicitly longer than thirty characters.',
        60,
      );
    });

    it('should handle falsy values in audit logs safely', async () => {
      const mockDoc = createMockDoc();
      const badLogState: any = {
        ...mockState,
        auditLog: [null, { timestamp: 0, event: '', user: '' }],
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

    it('should format unlabeled signers with their raw fingerprint', async () => {
      const mockDoc = createMockDoc();
      const unlabeledState = { ...mockState, signerLabels: {} };
      const rawSigner = [{ fingerprint: '99887766', signed: false }];

      await RoomAuditor.generateAuditPdf(mockDoc, unlabeledState, mockTx, rawSigner, null);
      expect(mockDoc.text).toHaveBeenCalledWith('1. 99887766', 20, expect.any(Number));
    });

    it('should correctly format full explorer links across networks', async () => {
      const mockDoc = createMockDoc();

      await RoomAuditor.generateAuditPdf(mockDoc, mockState, mockTx, mockSigners, null);
      expect(mockDoc.textWithLink).toHaveBeenCalledWith(
        expect.stringContaining('https://mempool.space/testnet/tx/txid-12345'),
        20,
        expect.any(Number),
        expect.any(Object),
      );

      await RoomAuditor.generateAuditPdf(
        mockDoc,
        { ...mockState, network: 'signet' },
        mockTx,
        mockSigners,
        null,
      );
      expect(mockDoc.textWithLink).toHaveBeenCalledWith(
        expect.stringContaining('https://mempool.space/signet/tx/txid-12345'),
        20,
        expect.any(Number),
        expect.any(Object),
      );
    });

    it('should apply custom whitelabel branding and logo when provided in options', async () => {
      const mockDoc = createMockDoc();
      const options = {
        isWhitelabel: true,
        brandName: 'Acme Corp Vault',
        brandColor: [220, 38, 38] as [number, number, number], 
        logoDataUrl: 'data:image/png;base64,mockBase64DataString',
        license: {
          tier: 'ENTERPRISE',
          isValid: true,
          payload: { licensee: 'Acme Corp', expiresAt: 0 }
        } as any
      };

      const { filename } = await RoomAuditor.generateAuditPdf(
        mockDoc,
        mockState,
        mockTx,
        mockSigners,
        mockState.finalTxHex!,
        options,
      );

      expect(mockDoc.setTextColor).toHaveBeenCalledWith(220, 38, 38);
      expect(mockDoc.text).toHaveBeenCalledWith('Acme Corp Vault', expect.any(Number), 20);
      expect(filename).toContain('AcmeCorpVault_Audit_');
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
  });
});
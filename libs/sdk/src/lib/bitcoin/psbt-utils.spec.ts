import { describe, it, expect, vi, afterEach } from 'vitest';
import { PsbtUtils } from './psbt-utils';
import { base64, hex } from '@scure/base';
import { Transaction } from '@scure/btc-signer';

describe('PsbtUtils - Encoding & Normalization', () => {
  it('should decode a hex-encoded PSBT into a Uint8Array', () => {
    const hexInput = '70736274ff00';
    const decoded = PsbtUtils.decode(hexInput);
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(hex.encode(decoded)).toBe('70736274ff00');
  });

  it('should decode a base64-encoded PSBT into a Uint8Array', () => {
    const b64Input = 'cHNidP8A';
    const decoded = PsbtUtils.decode(b64Input);
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(base64.encode(decoded)).toBe(b64Input);
  });

  it('should strip whitespace when decoding', () => {
    const rawInput = ' cHNi dP 8A \n';
    const decoded = PsbtUtils.decode(rawInput);
    expect(base64.encode(decoded)).toBe('cHNidP8A');
  });

  it('should normalize hex to base64 if it contains the PSBT magic bytes', () => {
    const hexInput = '70736274ff00';
    const normalized = PsbtUtils.normalize(hexInput);
    expect(normalized).toBe('cHNidP8A');
  });

  it('should leave base64 input untouched when normalizing', () => {
    const b64Input = 'cHNidP8A';
    const normalized = PsbtUtils.normalize(b64Input);
    expect(normalized).toBe(b64Input);
  });

  it('should return original input if normalization throws during hex decode', () => {
    // Magic bytes present, but contains invalid trailing hex characters to trigger catch
    const badHex = '70736274zzzz';
    expect(PsbtUtils.normalize(badHex)).toBe(badHex);
  });
});

describe('PsbtUtils - Script & Address Formatting', () => {
  it('should return Unknown for an empty script', () => {
    const address = PsbtUtils.formatScriptAddress(new Uint8Array([]), 'bitcoin');
    expect(address).toBe('Unknown');
  });

  it('should format a mainnet P2PKH legacy script correctly', () => {
    const script = hex.decode('76a91489abcdefabaabcdeffedcbaabaabcdefaba1234588ac');
    const address = PsbtUtils.formatScriptAddress(script, 'bitcoin');
    expect(typeof address).toBe('string');
    expect(address.startsWith('1')).toBe(true);
  });

  it('should format a testnet SegWit v0 (P2WPKH) script correctly', () => {
    const script = hex.decode('001489abcdefabaabcdeffedcbaabaabcdefaba12345');
    const address = PsbtUtils.formatScriptAddress(script, 'testnet');
    expect(address.startsWith('tb1')).toBe(true);
  });

  it('should format a mainnet Taproot (SegWit v1) script correctly', () => {
    const script = hex.decode(
      '512089abcdefabaabcdeffedcbaabaabcdefaba1234589abcdefabaabcdeffedcbaa',
    );
    const address = PsbtUtils.formatScriptAddress(script, 'bitcoin');
    expect(address.startsWith('bc1p')).toBe(true);
  });

  it('should fallback to raw hex when encountering an unknown script pattern', () => {
    const script = hex.decode('6a1489abcdefabaabcdeffedcbaabaabcdefaba12345');
    const address = PsbtUtils.formatScriptAddress(script, 'bitcoin');
    expect(address).toBe('6a1489abcdefabaabcdeffedcbaabaabcdefaba12345');
  });
});

describe('PsbtUtils - Core Transaction Analysis & Fallbacks', () => {
  const invalidPsbt = 'cHNidP8A';

  it('should safely return null when parsing transaction details of an invalid PSBT', () => {
    expect(PsbtUtils.parseTxDetails(invalidPsbt, 'bitcoin')).toBeNull();
  });

  it('should safely return null when analyzing an invalid PSBT', () => {
    expect(PsbtUtils.analyze(invalidPsbt)).toBeNull();
  });

  it('should safely return 0 when extracting threshold from an invalid PSBT', () => {
    expect(PsbtUtils.getThreshold(invalidPsbt)).toBe(0);
  });

  it('should safely return an empty array when extracting signers from an invalid PSBT', () => {
    expect(PsbtUtils.extractSigners(invalidPsbt)).toEqual([]);
  });

  it('should safely fallback to base string when merging fails', () => {
    expect(PsbtUtils.merge(invalidPsbt, 'invalid_secondary_payload')).toBe(invalidPsbt);
  });

  it('should safely return null when attempting to finalize a broken or unsigned PSBT', () => {
    expect(PsbtUtils.finalizeTx(invalidPsbt)).toBeNull();
  });
});

describe('PsbtUtils - Successful Operations (Mocked Scure Signer)', () => {
  const validPsbtBase64 = 'cHNidP8A';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully merge two PSBTs', () => {
    const mockTx = {
      combine: vi.fn(),
      toPSBT: vi.fn().mockReturnValue(new Uint8Array([0x70, 0x73, 0x62, 0x74])),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const merged = PsbtUtils.merge(validPsbtBase64, validPsbtBase64);
    expect(mockTx.combine).toHaveBeenCalled();
    expect(merged).toBe('cHNidA==');
  });

  it('should extract the multisig threshold from witness script', () => {
    const mockTx = {
      inputsLength: 1,
      getInput: vi.fn().mockReturnValue({
        witnessScript: new Uint8Array([0x52, 0x21]), // OP_2 (0x52)
      }),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const threshold = PsbtUtils.getThreshold(validPsbtBase64);
    expect(threshold).toBe(2);
  });

  it('should identify primary signer fingerprint from partial signatures', () => {
    const pubkey = new Uint8Array([0x02, 0x01, 0x02]);
    const mockTx = {
      inputsLength: 1,
      getInput: vi.fn().mockReturnValue({
        partialSig: [[pubkey, new Uint8Array([0xbb])]],
        bip32Derivation: [[pubkey, { fingerprint: 0xdeadbeef }]],
      }),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const fingerprint = PsbtUtils.getFingerprintFromPsbt(validPsbtBase64);
    expect(fingerprint).toBe('deadbeef');
  });

  it('should parse comprehensive transaction details successfully', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 1,
      getInput: vi.fn().mockReturnValue({
        witnessUtxo: {
          amount: 100000n,
          script: hex.decode('001489abcdefabaabcdeffedcbaabaabcdefaba12345'),
        },
      }),
      getOutput: vi.fn().mockReturnValue({
        amount: 90000n,
        script: hex.decode('001489abcdefabaabcdeffedcbaabaabcdefaba12345'),
        bip32Derivation: [[new Uint8Array([1]), { path: [0, 1, 0] }]],
      }),
      unsignedTx: {
        inputs: [{ txid: new Uint8Array(32).fill(1), index: 0 }],
      },
      vsize: 150,
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails(validPsbtBase64, 'testnet');

    expect(details).not.toBeNull();
    expect(details?.amount).toBe(90000);
    expect(details?.fee).toBe(10000);
    expect(details?.vBytes).toBe(150);
    expect(details?.inputs).toBe(1);
    expect(details?.outputs[0].isChange).toBe(true);
  });

  it('should map extractSigners and evaluate signature states across ECDSA and Schnorr', () => {
    const pubkey1 = new Uint8Array([0x02, 0x00]);
    const pubkey2 = new Uint8Array([0x03, 0x00]);
    const pubkey3 = new Uint8Array([0x04, 0x00]);

    const mockTx = {
      inputsLength: 1,
      getInput: vi.fn().mockReturnValue({
        partialSig: [[pubkey1, new Uint8Array([0xaa])]],
        tapScriptSig: [{ pubKey: pubkey2, signature: new Uint8Array([0xbb]) }],
        bip32Derivation: [
          [pubkey1, { fingerprint: 0x11111111 }],
          [pubkey2, { fingerprint: 0x22222222 }],
          [pubkey3, { fingerprint: 0x33333333 }],
        ],
      }),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const signers = PsbtUtils.extractSigners(validPsbtBase64);

    expect(signers).toHaveLength(3);
    expect(signers.find((s) => s.fingerprint === '11111111')?.signed).toBe(true);
    expect(signers.find((s) => s.fingerprint === '22222222')?.signed).toBe(true);
    expect(signers.find((s) => s.fingerprint === '33333333')?.signed).toBe(false);
  });

  it('should perform network analysis on the PSBT derivation paths', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 1,
      getInput: vi.fn().mockReturnValue({
        witnessUtxo: { amount: 50000n },
        bip32Derivation: [
          [new Uint8Array([1]), { fingerprint: 0xaabbccdd, path: [0, 2147483649] }], // Testnet path
        ],
      }),
      getOutput: vi.fn().mockReturnValue({ amount: 40000n }),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const analysis = PsbtUtils.analyze(validPsbtBase64);

    expect(analysis).not.toBeNull();
    expect(analysis?.valid).toBe(true);
    expect(analysis?.signerCount).toBe(1);
    expect(analysis?.amountBtc).toBe(40000 / 100000000);
    expect(analysis?.networkFeeSat).toBe(10000);
    expect(analysis?.detectedNetwork).toBe('testnet');
  });

  it('should successfully finalize and extract a hex transaction', () => {
    const mockTx = {
      finalize: vi.fn(),
      extract: vi.fn().mockReturnValue(new Uint8Array([0xaa, 0xbb, 0xcc])),
      id: 'mocked-tx-id',
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const finalTx = PsbtUtils.finalizeTx(validPsbtBase64);

    expect(mockTx.finalize).toHaveBeenCalled();
    expect(finalTx?.hex).toBe('aabbcc');
    expect(finalTx?.txId).toBe('mocked-tx-id');
  });
});

describe('PsbtUtils - Edge Cases & Error Handling', () => {
  const validPsbtBase64 = 'cHNidP8A';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 0 for threshold if script length is 0 or OP code is out of bounds', () => {
    const mockTx = {
      getInput: vi
        .fn()
        .mockReturnValueOnce({ witnessScript: new Uint8Array([]) }) // Empty
        .mockReturnValueOnce({ witnessScript: new Uint8Array([0x00]) }), // Not an OP_1 to OP_16
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    expect(PsbtUtils.getThreshold(validPsbtBase64)).toBe(0);
    expect(PsbtUtils.getThreshold(validPsbtBase64)).toBe(0);
  });

  it('should return null if no matching signature is found for the primary fingerprint', () => {
    const mockTx = {
      inputsLength: 1,
      getInput: vi.fn().mockReturnValue({
        partialSig: [[new Uint8Array([0x01]), new Uint8Array([0xbb])]],
        bip32Derivation: [[new Uint8Array([0x02]), { fingerprint: 0xdeadbeef }]], // Mismatch
      }),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);
    expect(PsbtUtils.getFingerprintFromPsbt(validPsbtBase64)).toBeNull();
  });

  it('should handle nonWitnessUtxo and swallow unsignedTx errors gracefully in parseTxDetails', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 1,
      getInput: vi.fn().mockReturnValue({ nonWitnessUtxo: new Uint8Array([1, 2, 3]) }),
      getOutput: vi.fn().mockReturnValue({ amount: 50000n }), // No derivation path
      unsignedTx: {}, // Missing properties will throw internally, triggering the catch
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails(validPsbtBase64);
    expect(details?.inputsList[0].address).toBe('Legacy Input');
    expect(details?.inputsList[0].txId).toBe('????'); // Default fallback due to catch
  });

  it('should handle missing bip32Derivations safely in extractSigners', () => {
    const mockTx = {
      inputsLength: 1,
      getInput: vi.fn().mockReturnValue({}), // Completely empty input map
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);
    expect(PsbtUtils.extractSigners(validPsbtBase64)).toEqual([]);
  });

  it('should correctly decrease network score for mainnet paths and handle missing witnessUtxo in analyze', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 0,
      getInput: vi.fn().mockReturnValue({
        // 2147483648 is standard mainnet coin type path mapping
        bip32Derivation: [[new Uint8Array([1]), { fingerprint: 0xaa, path: [0, 2147483648] }]],
      }),
      getOutput: vi.fn(),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const analysis = PsbtUtils.analyze(validPsbtBase64);
    expect(analysis?.detectedNetwork).toBe('bitcoin');
    expect(analysis?.networkFeeSat).toBe(0);
  });

  // --- Fallback Coverage blocks for Address Formatting ---
  it('should trigger catch block and use P2PKH fallback on internal format failure', () => {
    const script = hex.decode('76a91489abcdefabaabcdeffedcbaabaabcdefaba1234588ac');
    // Sabotage the underlying slice method to force the try block to fail
    script.slice = () => {
      throw new Error('Force fail');
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const address = PsbtUtils.formatScriptAddress(script, 'bitcoin');
    expect(address).toBe('89abcdefabaabcdeffedcbaabaabcdefaba12345');
  });

  it('should trigger catch block and use P2SH fallback on internal format failure', () => {
    const script = hex.decode('a91489abcdefabaabcdeffedcbaabaabcdefaba1234587');
    script.slice = () => {
      throw new Error('Force fail');
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const address = PsbtUtils.formatScriptAddress(script, 'bitcoin');
    expect(address).toBe('89abcdefabaabcdeffedcbaabaabcdefaba12345');
  });

  it('should trigger catch block and use SegWit fallback on internal format failure', () => {
    const script = hex.decode('001489abcdefabaabcdeffedcbaabaabcdefaba12345');
    script.slice = () => {
      throw new Error('Force fail');
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const address = PsbtUtils.formatScriptAddress(script, 'bitcoin');
    expect(address).toBe('89abcdefabaabcdeffedcbaabaabcdefaba12345');
  });

  it('should trigger catch block in normalize if decoding fails', () => {
    // Instead of spying on base64.encode, we pass an input that is
    // valid hex (starts with 70736274) but cannot be decoded by hex.decode.
    // e.g., an odd number of hex characters or invalid characters.
    const invalidHex = '70736274ZZ'; // 'ZZ' is not valid hex

    // This will trigger the catch block at line 84 in psbt-utils.ts
    const result = PsbtUtils.normalize(invalidHex);

    // Ensure it returns the original input as per the catch block
    expect(result).toBe(invalidHex);
  });

  it('should trigger catch block in getFingerprintFromPsbt (line 154)', () => {
    // Sabotage decode to force the catch block at line 154
    const spy = vi.spyOn(PsbtUtils, 'decode').mockImplementation(() => {
      throw new Error();
    });
    const result = PsbtUtils.getFingerprintFromPsbt('invalid');
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('should trigger catch block in parseTxDetails regarding unsignedTx (line 351)', () => {
    // Force line 351: ensure accessing unsignedTx throws
    const mockTx = {
      inputsLength: 1,
      getInput: vi.fn().mockReturnValue({}),
      getOutput: vi.fn().mockReturnValue({}),
      get unsignedTx() {
        throw new Error('Force fail');
      },
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails('cHNidP8A');
    expect(details?.inputsList[0].txId).toBe('????'); // Fallback triggered
  });

  it('should trigger 0 fallback for feeRate if vBytes is 0 (line 365)', () => {
    const mockTx = {
      inputsLength: 0,
      outputsLength: 0,
      getInput: vi.fn(),
      getOutput: vi.fn(),
      vsize: 0, // Force feeRate calculation to use the fallback
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails('cHNidP8A');
    expect(details?.feeRate).toBe(0);
  });

  it('should trigger catch block in normalize by passing invalid hex to hex.decode', () => {
    // Instead of mocking, we pass malformed input that causes hex.decode to throw
    // 70736274 is the magic prefix, 'ZZ' is invalid hex
    const invalidInput = '70736274ZZ';

    // This forces the catch block (line 84) to trigger naturally when hex.decode fails
    const result = PsbtUtils.normalize(invalidInput);

    // Expect the function to catch the error and return the input as defined in the catch block
    expect(result).toBe(invalidInput);
  });

  it('should trigger catch block in parseTxDetails if unsignedTx property throws', () => {
    // ensure accessing unsignedTx throws
    const mockTx = {
      inputsLength: 1,
      outputsLength: 0,
      getInput: vi.fn().mockReturnValue({}),
      getOutput: vi.fn().mockReturnValue({}),
      get unsignedTx() {
        throw new Error('Trigger catch');
      },
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails('cHNidP8A');
    // Verifies the catch block was hit because address remained 'Legacy/Unknown'
    // and txId remained '????'
    expect(details?.inputsList[0].txId).toBe('????');
  });

  it('should trigger catch block in parseTxDetails if vsize throws', () => {
    // Force the try block inside feeRate calculation to fail
    const mockTx = {
      inputsLength: 1,
      outputsLength: 1,
      getInput: vi.fn().mockReturnValue({ witnessUtxo: { amount: 1000n } }),
      getOutput: vi.fn().mockReturnValue({ amount: 500n }),
      get vsize() {
        throw new Error('Trigger catch');
      },
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails('cHNidP8A');
    // Catch block is empty, code continues to return calculation
    // catch triggered; function returns the object with valid default feeRate
    expect(details?.feeRate).toBeDefined();
  });
});

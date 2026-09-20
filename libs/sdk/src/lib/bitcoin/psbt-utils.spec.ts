import { describe, it, expect, vi, afterEach } from 'vitest';
import { PsbtUtils } from './psbt-utils';
import { base64, hex } from '@scure/base';
import { Transaction } from '@scure/btc-signer';

// Safely mock the ESM module at the TOP LEVEL to allow branching tests on getInputType
vi.mock('@scure/btc-signer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@scure/btc-signer')>();
  return {
    ...actual,
    getInputType: vi.fn((input: any) => {
      if (input && input._mockInputType) {
        return { type: input._mockInputType };
      }
      return actual.getInputType(input);
    }),
  };
});

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
    const badHex = '70736274zzzz';
    expect(PsbtUtils.normalize(badHex)).toBe(badHex);
  });

  it('should trigger catch block in normalize by passing odd-length hex to hex.decode', () => {
    const invalidInput = '70736274a';
    const result = PsbtUtils.normalize(invalidInput);
    expect(result).toBe(invalidInput);
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

  it('should parse comprehensive transaction details successfully and calculate dynamic vBytes', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 1,
      get fee() { return BigInt(10000); },
      get vsize() { return 109; },
      getInput: vi.fn().mockReturnValue({
        txid: new Uint8Array(32).fill(1),
        index: 0,
        witnessUtxo: {
          amount: BigInt(100000),
          script: hex.decode('001489abcdefabaabcdeffedcbaabaabcdefaba12345'),
        },
      }),
      getOutput: vi.fn().mockReturnValue({
        amount: BigInt(90000),
        script: hex.decode('001489abcdefabaabcdeffedcbaabaabcdefaba12345'),
        bip32Derivation: [[new Uint8Array([1]), { path: [0, 1, 0] }]],
      }),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails(validPsbtBase64, 'testnet');

    expect(details).not.toBeNull();
    expect(details?.amount).toBe(90000);
    expect(details?.fee).toBe(10000);
    expect(details?.vBytes).toBe(109); 
    expect(details?.feeRate).toBe(91.74); 
    expect(details?.inputs).toBe(1);
    expect(details?.outputs[0].isChange).toBe(true);
  });

  it('should perform network analysis and size estimation on the PSBT derivation paths', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 1,
      get fee() { return BigInt(10000); },
      get vsize() { throw new Error(); }, // Force fallback vByte math
      getInput: vi.fn().mockReturnValue({
        witnessUtxo: { amount: BigInt(50000) },
        bip32Derivation: [
          [new Uint8Array([1]), { fingerprint: 0xaabbccdd, path: [0, 2147483649] }], 
        ],
      }),
      getOutput: vi.fn().mockReturnValue({ amount: BigInt(40000) }),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const analysis = PsbtUtils.analyze(validPsbtBase64);

    expect(analysis).not.toBeNull();
    expect(analysis?.valid).toBe(true);
    expect(analysis?.signerCount).toBe(1);
    expect(analysis?.amountBtc).toBe(40000 / 100000000);
    expect(analysis?.networkFeeSat).toBe(10000);
    expect(analysis?.detectedNetwork).toBe('testnet');
    expect(analysis?.estimatedVBytes).toBe(109); 
  });

  it('should correctly estimate sizes and extract values for legacy P2PKH inputs', () => {
    const mockTx = {
        inputsLength: 1,
        outputsLength: 1,
        get fee() { throw new Error(); }, // Force fallback fee math
        get vsize() { throw new Error(); }, // Force fallback size math
        getInput: vi.fn().mockReturnValue({
            txid: new Uint8Array(32).fill(2),
            index: 0,
            nonWitnessUtxo: { outputs: [{ amount: BigInt(50000), script: new Uint8Array([0x76, 0xa9]) }] }, 
        }),
        getOutput: vi.fn().mockReturnValue({ amount: BigInt(40000) }),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const analysis = PsbtUtils.analyze(validPsbtBase64);
    expect(analysis?.estimatedVBytes).toBe(189); 
    expect(analysis?.networkFeeSat).toBe(10000); 

    const details = PsbtUtils.parseTxDetails(validPsbtBase64);
    expect(details?.vBytes).toBe(189);
    expect(details?.feeRate).toBe(52.91); 
    expect(details?.inputsList[0].amount).toBe(50000);
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
        .mockReturnValueOnce({ witnessScript: new Uint8Array([]) })
        .mockReturnValueOnce({ witnessScript: new Uint8Array([0x00]) }),
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
        bip32Derivation: [[new Uint8Array([0x02]), { fingerprint: 0xdeadbeef }]],
      }),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);
    expect(PsbtUtils.getFingerprintFromPsbt(validPsbtBase64)).toBeNull();
  });

  it('should handle nonWitnessUtxo parsing failures gracefully in parseTxDetails', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 1,
      get fee() { throw new Error(); },
      get vsize() { throw new Error(); },
      getInput: vi.fn().mockReturnValue({ 
        index: 0, 
        nonWitnessUtxo: new Uint8Array([1, 2, 3])
      }), 
      getOutput: vi.fn().mockReturnValue({ amount: BigInt(50000) }),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails(validPsbtBase64);
    expect(details?.inputsList[0].address).toBe('Legacy Input (unparsed)');
    expect(details?.inputsList[0].txId).toBe('????'); 
    expect(details?.vBytes).toBe(189);
  });

  it('should fallback to empty strings if txid is missing from the input', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 0,
      get fee() { return BigInt(1000); },
      get vsize() { return 150; },
      getInput: vi.fn().mockReturnValue({}),
      getOutput: vi.fn().mockReturnValue({}),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails('cHNidP8A');
    expect(details?.inputsList[0].txId).toBe('????');
    expect(details?.inputsList[0].vout).toBe(0);
  });

  it('should handle missing bip32Derivations safely in extractSigners', () => {
    const mockTx = {
      inputsLength: 1,
      getInput: vi.fn().mockReturnValue({}),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);
    expect(PsbtUtils.extractSigners(validPsbtBase64)).toEqual([]);
  });

  it('should correctly decrease network score for mainnet paths and handle missing witnessUtxo in analyze', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 0,
      get fee() { throw new Error(); },
      get vsize() { throw new Error(); },
      getInput: vi.fn().mockReturnValue({
        bip32Derivation: [[new Uint8Array([1]), { fingerprint: 0xaa, path: [0, 2147483648] }]],
      }),
      getOutput: vi.fn(),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const analysis = PsbtUtils.analyze(validPsbtBase64);
    expect(analysis?.detectedNetwork).toBe('bitcoin');
    expect(analysis?.networkFeeSat).toBe(0);
  });

  it('should trigger catch block and use P2PKH fallback on internal format failure', () => {
    const script = hex.decode('76a91489abcdefabaabcdeffedcbaabaabcdefaba1234588ac');
    script.slice = () => { throw new Error('Force fail'); };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const address = PsbtUtils.formatScriptAddress(script, 'bitcoin');
    expect(address).toBe('89abcdefabaabcdeffedcbaabaabcdefaba12345');
  });

  it('should trigger catch block and use P2SH fallback on internal format failure', () => {
    const script = hex.decode('a91489abcdefabaabcdeffedcbaabaabcdefaba1234587');
    script.slice = () => { throw new Error('Force fail'); };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const address = PsbtUtils.formatScriptAddress(script, 'bitcoin');
    expect(address).toBe('89abcdefabaabcdeffedcbaabaabcdefaba12345');
  });

  it('should trigger catch block and use SegWit fallback on internal format failure', () => {
    const script = hex.decode('001489abcdefabaabcdeffedcbaabaabcdefaba12345');
    script.slice = () => { throw new Error('Force fail'); };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const address = PsbtUtils.formatScriptAddress(script, 'bitcoin');
    expect(address).toBe('89abcdefabaabcdeffedcbaabaabcdefaba12345');
  });

  it('should trigger catch block in normalize if decoding fails', () => {
    const invalidHex = '70736274ZZ';
    const result = PsbtUtils.normalize(invalidHex);
    expect(result).toBe(invalidHex);
  });

  it('should trigger catch block in getFingerprintFromPsbt (line 154)', () => {
    const spy = vi.spyOn(PsbtUtils, 'decode').mockImplementation(() => { throw new Error(); });
    const result = PsbtUtils.getFingerprintFromPsbt('invalid');
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('should safely fallback to estimated vBytes if the library returns an invalid 0 vsize', () => {
    const mockTx = {
      inputsLength: 0,
      outputsLength: 0,
      get fee() { return BigInt(1000); },
      get vsize() { return 0; },
      getInput: vi.fn(),
      getOutput: vi.fn(),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails('cHNidP8A');
    expect(details?.feeRate).toBe(100);
    expect(details?.vBytes).toBe(10);
  });

  it('should trigger catch block in parseTxDetails if vsize throws', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 1,
      get fee() { return BigInt(500); },
      get vsize() { throw new Error('Trigger catch'); },
      getInput: vi.fn().mockReturnValue({ witnessUtxo: { amount: BigInt(1000) } }),
      getOutput: vi.fn().mockReturnValue({ amount: BigInt(500) }),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails('cHNidP8A');
    expect(details?.feeRate).toBeDefined();
  });

  it('should clamp negative fee calculations to 0n in parseTxDetails if totalOutput exceeds totalInput', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 1,
      get fee() { throw new Error('Force fallback'); },
      get vsize() { return 150; },
      getInput: vi.fn().mockReturnValue({ witnessUtxo: { amount: BigInt(1000) } }),
      getOutput: vi.fn().mockReturnValue({ amount: BigInt(5000) }),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails('cHNidP8A');
    expect(details?.fee).toBe(0);
  });

  it('should clamp negative fee calculations to 0n in analyze if totalOutput exceeds totalInput', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 1,
      get fee() { throw new Error('Force fallback'); },
      get vsize() { throw new Error('Force fallback'); },
      getInput: vi.fn().mockReturnValue({ witnessUtxo: { amount: BigInt(1000) } }),
      getOutput: vi.fn().mockReturnValue({ amount: BigInt(5000) }),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const analysis = PsbtUtils.analyze('cHNidP8A');
    expect(analysis?.networkFeeSat).toBe(0);
  });

  it('should safely handle legacy outputs missing an amount during getPrevOut', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 0,
      get fee() { return BigInt(1000); },
      get vsize() { return 150; },
      getInput: vi.fn().mockReturnValue({
          index: 0,
          nonWitnessUtxo: { outputs: [{ script: new Uint8Array([0x76, 0xa9]) }] },
      }),
      getOutput: vi.fn(),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails('cHNidP8A');
    expect(details?.inputsList[0].amount).toBe(0);
  });

  it('should correctly fallback to 91 vBytes for nested segwit heuristics', () => {
    const mockTx = {
      inputsLength: 1,
      outputsLength: 0,
      get fee() { return BigInt(1000); },
      get vsize() { throw new Error('Force fallback'); },
      getInput: vi.fn().mockReturnValue({
        witnessUtxo: { amount: BigInt(1000) },
        redeemScript: new Uint8Array([1, 2, 3])
      }),
      getOutput: vi.fn()
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails('cHNidP8A');
    expect(details?.vBytes).toBe(101);
  });

  it('should correctly identify non-change outputs when derivation path is short or missing index 1', () => {
    const mockTx = {
      inputsLength: 0,
      outputsLength: 2,
      get fee() { return BigInt(1000); },
      get vsize() { return 150; },
      getInput: vi.fn(),
      getOutput: vi.fn()
        .mockReturnValueOnce({
          amount: BigInt(1000),
          bip32Derivation: [[new Uint8Array(1), { path: [0] }]]
        })
        .mockReturnValueOnce({
          amount: BigInt(2000),
          bip32Derivation: [[new Uint8Array(1), { path: [0, 0, 0] }]]
        })
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const details = PsbtUtils.parseTxDetails('cHNidP8A');
    expect(details?.outputs[0].isChange).toBe(false);
    expect(details?.outputs[1].isChange).toBe(false);
  });

  it('should safely fallback to base string if combine throws during merge', () => {
    const mockTx = {
      combine: vi.fn().mockImplementation(() => { throw new Error('Combine failed'); }),
      toPSBT: vi.fn()
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const merged = PsbtUtils.merge('cHNidP8A', 'cHNidP8A');
    expect(merged).toBe('cHNidP8A');
  });

  it('should safely catch errors in areKeysEqual during signature extraction', () => {
    const badKey = new Uint8Array([0x02, 0x00]);
    badKey.slice = () => { throw new Error('Trigger areKeysEqual catch'); };

    const mockTx = {
      inputsLength: 1,
      getInput: vi.fn().mockReturnValue({
        partialSig: [[badKey, new Uint8Array([0xbb])]],
        bip32Derivation: [[new Uint8Array([0x03, 0x01]), { fingerprint: 0xdeadbeef }]],
      }),
    };
    vi.spyOn(Transaction, 'fromPSBT').mockReturnValue(mockTx as any);

    const signers = PsbtUtils.extractSigners('cHNidP8A');
    expect(signers[0].signed).toBe(false);
  });
});

describe('PsbtUtils - Input VByte Estimation Branches', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should estimate sizes using strict type matches from getInputType', () => {
    // Branch 1: Taproot (Triggers via _mockInputType backdoor in vi.mock at top of file)
    expect((PsbtUtils as any).estimateInputVBytes({ _mockInputType: 'tr' })).toBe(58);

    // Branch 2: Nested Segwit
    expect((PsbtUtils as any).estimateInputVBytes({ _mockInputType: 'sh-wpkh' })).toBe(91);

    // Branch 3: Legacy P2PKH / P2SH
    expect((PsbtUtils as any).estimateInputVBytes({ _mockInputType: 'pkh' })).toBe(148);

    // Branch 4: Native Segwit (Primary)
    expect((PsbtUtils as any).estimateInputVBytes({ _mockInputType: 'wpkh' })).toBe(68);
  });
});
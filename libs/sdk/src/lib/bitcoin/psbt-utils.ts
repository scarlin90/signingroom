import { Transaction } from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import { bech32, bech32m } from '@scure/base';
import { NETWORK, TEST_NETWORK, Address } from '@scure/btc-signer';

/**
 * Granular breakdown of a transaction's structural payload.
 * Provides a human-readable summary of inputs, outputs, and network fees.
 */
export interface TxDetails {
  /** The total outbound volume of the transaction, expressed in satoshis (excluding fees). */
  amount: number;
  /** The total network fee calculated as the difference between total inputs and outputs. */
  fee: number;
  /** The estimated virtual byte (vB) size of the finalized transaction. */
  vBytes: number;
  /** The effective fee rate paid to miners, expressed in satoshis per vByte (sat/vB). */
  feeRate: number;
  /** The total count of unspent transaction outputs (UTXOs) consumed as inputs. */
  inputs: number;
  /** Detailed mapping of every consumed input, including origin txId and satoshi value. */
  inputsList: { address: string; amount: number; txId: string; vout: number }[];
  /** Detailed mapping of every created output, indicating destination addresses and change routing. */
  outputs: { address: string; amount: number; isChange: boolean }[];
}

/**
 * Represents the signature status of a specific hardware wallet or signing participant.
 */
export interface SignerStatus {
  /** The master key fingerprint (8 hex characters) identifying the signer. */
  fingerprint: string;
  /** Indicates whether a valid partial signature exists from this participant. */
  signed: boolean;
}

/**
 * High-level analytical overview of a Partially Signed Bitcoin Transaction (PSBT).
 * Used for rapid validation and environmental routing.
 */
export interface PsbtAnalysis {
  /** Indicates if the provided PSBT string is structurally sound and parsable. */
  valid: boolean;
  /** The total count of distinct extended public key fingerprints involved in the transaction. */
  signerCount: number;
  /** The aggregate transaction output volume converted to whole Bitcoin (BTC). */
  amountBtc: number;
  /** The absolute network fee expected by the network, expressed in satoshis. */
  networkFeeSat: number;
  /** The total count of newly created UTXOs resulting from this transaction. */
  outputCount: number;
  /** The cryptographic network environment derived from BIP32 derivation paths. */
  detectedNetwork: 'bitcoin' | 'testnet' | 'unknown';
}

/**
 * Utility class providing static methods for parsing, validating, mutating,
 * and extracting metadata from Partially Signed Bitcoin Transactions (PSBTs).
 */
export class PsbtUtils {
  /**
   * Decodes a raw PSBT string payload into a strictly typed binary byte array.
   * Intelligently detects and routes between hex-encoded and base64-encoded formats.
   * * @param raw - The raw, unformatted PSBT string payload.
   * @returns A decoded Uint8Array containing the raw binary transaction.
   */
  static decode(raw: string): Uint8Array {
    const clean = raw.replace(/\s/g, '');
    return /^[0-9a-fA-F]+$/.test(clean) ? hex.decode(clean) : base64.decode(clean);
  }

  /**
   * Normalizes an arbitrary PSBT input string into a standard Base64 representation.
   * Auto-converts valid hex strings containing the PSBT magic bytes into Base64.
   * * @param input - The raw PSBT string (Base64 or Hex).
   * @returns A sanitized, Base64 encoded PSBT string.
   */
  static normalize(input: string): string {
    const clean = input.trim();
    if (/^[0-9a-fA-F]+$/.test(clean) && clean.toLowerCase().startsWith('70736274')) {
      try {
        return base64.encode(hex.decode(clean));
      } catch (e) {
        return input;
      }
    }
    return clean;
  }

  /**
   * Cryptographically merges two distinct PSBT payloads sharing the same underlying transaction state.
   * Used to aggregate isolated participant signatures into a unified transaction map.
   * * @param base - The primary Base64 PSBT payload.
   * @param next - The secondary Base64 PSBT payload containing parallel signatures.
   * @returns A new Base64 PSBT string containing the combined signatures, or the original base on failure.
   */
  static merge(base: string, next: string): string {
    try {
      const txBase = Transaction.fromPSBT(this.decode(base));
      const txNext = Transaction.fromPSBT(this.decode(next));
      txBase.combine(txNext);
      return base64.encode(txBase.toPSBT());
    } catch (e) {
      console.error('[Merge Failed]', e);
      return base;
    }
  }

  /**
   * Extracts the M-of-N multisig required threshold directly from the redeem/witness script.
   * * @param psbtBase64 - The normalized Base64 PSBT payload.
   * @returns The integer representing the minimum signatures required, or 0 if unreadable.
   */
  static getThreshold(psbtBase64: string): number {
    try {
      const tx = Transaction.fromPSBT(base64.decode(psbtBase64));
      const input = tx.getInput(0);
      const script = input.witnessScript || input.redeemScript;
      if (!script || script.length === 0) return 0;
      const firstOp = script[0];
      return firstOp >= 0x51 && firstOp <= 0x60 ? firstOp - 0x50 : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Identifies the primary signer's master key fingerprint associated with the first detected partial signature.
   * * @param psbtData - The normalized Base64 PSBT payload.
   * @returns The 8-character hex fingerprint string, or null if no valid signature mapping is found.
   */
  static getFingerprintFromPsbt(psbtData: string): string | null {
    try {
      const bytes = this.decode(psbtData);
      const tx = Transaction.fromPSBT(bytes);

      for (let i = 0; i < tx.inputsLength; i++) {
        const input = tx.getInput(i);

        if (input.partialSig && input.partialSig.length > 0) {
          const pubkeySigned = input.partialSig[0][0];

          if (input.bip32Derivation) {
            for (const [pubkey, meta] of input.bip32Derivation) {
              if (hex.encode(pubkey) === hex.encode(pubkeySigned)) {
                return meta.fingerprint.toString(16).padStart(8, '0');
              }
            }
          }
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Completely parses a PSBT to derive human-readable financial metrics, I/O maps, and fee estimators.
   * * @param psbtBase64 - The normalized Base64 PSBT payload.
   * @param network - The target network context required for accurate address formatting.
   * @returns A structured TxDetails object, or null if the parsing engine encounters a fatal error.
   */
  static parseTxDetails(
    psbtBase64: string,
    network: 'bitcoin' | 'testnet' | 'signet' = 'bitcoin',
  ): TxDetails | null {
    try {
      const tx = Transaction.fromPSBT(base64.decode(psbtBase64));
      const inputsList = [];
      const outputs = [];
      let totalInput = 0;
      let totalOutput = 0;

      for (let i = 0; i < tx.inputsLength; i++) {
        const input = tx.getInput(i);
        let amount = 0;
        let address = 'Legacy/Unknown';

        if (input.witnessUtxo) {
          amount = Number(input.witnessUtxo.amount);
          totalInput += amount;
          address = this.formatScriptAddress(input.witnessUtxo.script, network);
        } else if (input.nonWitnessUtxo) {
          address = 'Legacy Input';
        }

        let txId = '????';
        let vout = 0;
        try {
          const rawInput = (tx as any).unsignedTx.inputs[i];
          if (rawInput?.txid) {
            txId = hex.encode(rawInput.txid).slice(0, 8) + '...';
            vout = rawInput.index;
          }
        } catch (e) {}

        inputsList.push({ address, amount, txId, vout });
      }

      for (let i = 0; i < tx.outputsLength; i++) {
        const output = tx.getOutput(i);
        const amount = Number(output.amount);
        totalOutput += amount;

        const address = this.formatScriptAddress(output.script || new Uint8Array([]), network);
        let isChange = false;

        if (output.bip32Derivation) {
          for (const [, meta] of output.bip32Derivation as any[]) {
            if (meta?.path?.length >= 2 && meta.path[meta.path.length - 2] === 1) {
              isChange = true;
              break;
            }
          }
        }
        outputs.push({ address, amount, isChange });
      }

      outputs.sort((a, b) => Number(b.isChange) - Number(a.isChange));
      const fee = totalInput > 0 ? Math.max(0, totalInput - totalOutput) : 0;
      let vBytes = 10 + tx.inputsLength * 100 + tx.outputsLength * 31;
      try {
        vBytes = (tx as any).vsize || vBytes;
      } catch (e) {}
      const feeRate = vBytes > 0 ? Number((fee / vBytes).toFixed(2)) : 0;

      return {
        amount: totalOutput,
        fee,
        vBytes,
        feeRate,
        inputs: tx.inputsLength,
        inputsList,
        outputs,
      };
    } catch (e) {
      console.error('Failed to parse PSBT', e);
      return null;
    }
  }

  /**
   * Scans a PSBT to map all expected participants and evaluates their current signature state.
   * Works across both legacy ECDSA (partialSig) and Schnorr (tapScriptSig) signature schemes.
   * * @param psbtBase64 - The normalized Base64 PSBT payload.
   * @returns An array mapping participant fingerprints to their active signed status.
   */
  static extractSigners(psbtBase64: string): SignerStatus[] {
    try {
      const tx = Transaction.fromPSBT(base64.decode(psbtBase64));
      const signersMap = new Map<string, boolean>();

      for (let i = 0; i < tx.inputsLength; i++) {
        const input = tx.getInput(i);
        const derivations = input.bip32Derivation as any[];

        if (derivations) {
          for (const [pubkey, meta] of derivations) {
            if (!meta?.fingerprint) continue;
            const fpHex = meta.fingerprint.toString(16).padStart(8, '0');
            let isSigned = false;

            if (input.partialSig) {
              isSigned = input.partialSig.some((p) => this.areKeysEqual(p[0], pubkey));
            }
            if (!isSigned && input.tapScriptSig) {
              isSigned = input.tapScriptSig.some((p: any) => this.areKeysEqual(p.pubKey, pubkey));
            }

            const current = signersMap.get(fpHex) || false;
            signersMap.set(fpHex, current || isSigned);
          }
        }
      }
      return Array.from(signersMap.entries()).map(([fp, signed]) => ({ fingerprint: fp, signed }));
    } catch (e) {
      return [];
    }
  }

  /**
   * Decodes an arbitrary output script into a human-readable Bitcoin address.
   * Supports P2PKH, P2SH, SegWit v0 (Bech32), and Taproot (Bech32m).
   * * @param script - The raw locking script byte array.
   * @param network - The target network configuration.
   * @returns The formatted public address, or a raw hex fallback if unsupported.
   */
  static formatScriptAddress(
    script: Uint8Array,
    network: 'bitcoin' | 'testnet' | 'signet',
  ): string {
    if (!script || script.length === 0) {
      return 'Unknown';
    }

    try {
      const s = hex.encode(script);
      const currentNetwork = network || 'bitcoin';
      const isTestnetLike = currentNetwork === 'testnet' || currentNetwork === 'signet';
      const hrp = isTestnetLike ? 'tb' : 'bc';
      const networkConfig = isTestnetLike ? TEST_NETWORK : NETWORK;

      // Legacy P2PKH (important for old multisig/unsigned txs)
      if (s.startsWith('76a914') && s.endsWith('88ac') && script.length === 25) {
        const pubKeyHash = script.slice(3, 23);

        return Address(networkConfig).encode({ type: 'pkh', hash: pubKeyHash } as any);
      }

      // Legacy P2SH & Nested SegWit (starts with a914, length 23 bytes)
      if (s.startsWith('a914') && s.endsWith('87') && script.length === 23) {
        const scriptHash = script.slice(2, 22); // Extract the 20-byte script hash
        return Address(networkConfig).encode({ type: 'sh', hash: scriptHash } as any);
      }

      // SegWit v0 - P2WPKH (22 bytes) or P2WSH (34 bytes) = Bech32
      if (
        (s.startsWith('0014') && script.length === 22) ||
        (s.startsWith('0020') && script.length === 34)
      ) {
        const witnessProgram = script.slice(2);
        const words = bech32.toWords(witnessProgram);
        words.unshift(0);
        return bech32.encode(hrp, words);
      }

      // Taproot + Future Witness Versions (v1 to v16) = Bech32m (BIP-350)
      if (s.length >= 4) {
        const versionByte = parseInt(s.slice(0, 2), 16);
        if (versionByte >= 0x51 && versionByte <= 0x60) {
          // OP_1 to OP_16
          const witnessVersion = versionByte - 0x50;
          const witnessProgram = script.slice(2);

          const words = bech32m.toWords(witnessProgram);
          words.unshift(witnessVersion);
          return bech32m.encode(hrp, words);
        }
      }

      // Fallback: show raw hex for unknown scripts
      return s;
    } catch (e) {
      console.warn('Address formatting failed:', e, hex.encode(script));

      const s = hex.encode(script);
      if (s.startsWith('0014') || s.startsWith('0020') || s.startsWith('51')) return s.slice(4);
      if (s.startsWith('76a914')) return s.slice(6, 46); // P2PKH fallback
      if (s.startsWith('a914')) return s.slice(4, 44); // P2SH fallback
      return s;
    }
  }

  /**
   * Validates structural equivalence between two public keys, handling compression mismatch safely.
   */
  private static areKeysEqual(k1: Uint8Array, k2: Uint8Array): boolean {
    if (hex.encode(k1) === hex.encode(k2)) return true;
    try {
      const getX = (k: Uint8Array) =>
        k.length === 33 ? k.slice(1) : k.length === 65 ? k.slice(1, 33) : k;
      return hex.encode(getX(k1)) === hex.encode(getX(k2));
    } catch (e) {
      return false;
    }
  }

  /**
   * Finalizes an fully-signed PSBT map into an extracted, broadcast-ready raw hex string.
   * * @param psbtBase64 - The fully signed Base64 PSBT payload.
   * @returns An object containing the raw transaction hex and derived txId, or null on failure.
   */
  static finalizeTx(psbtBase64: string): { hex: string; txId: string } | null {
    try {
      const tx = Transaction.fromPSBT(this.decode(psbtBase64));
      tx.finalize();
      return { hex: hex.encode(tx.extract()), txId: tx.id };
    } catch (e) {
      return null;
    }
  }

  /**
   * Performs a rapid, unauthenticated surface analysis of a PSBT.
   * Primarily utilized to ascertain high-level sanity constraints and block out-of-network payloads.
   * * @param psbtBase64 - The normalized Base64 PSBT payload.
   * @returns A high-level PsbtAnalysis configuration object, or null on parse failure.
   */
  static analyze(psbtBase64: string): PsbtAnalysis | null {
    try {
      const psbtBytes = this.decode(psbtBase64);
      const tx = Transaction.fromPSBT(psbtBytes, { allowUnknown: true });

      const fingerprints = new Set<string>();
      let totalInput = 0,
        totalOutput = 0,
        networkScore = 0;

      for (let i = 0; i < tx.inputsLength; i++) {
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
      for (let i = 0; i < tx.outputsLength; i++) totalOutput += Number(tx.getOutput(i).amount);

      const fee = totalInput > 0 ? totalInput - totalOutput : 0;

      return {
        valid: true,
        signerCount: fingerprints.size || 1,
        amountBtc: totalOutput / 100000000,
        networkFeeSat: fee,
        outputCount: tx.outputsLength,
        detectedNetwork: networkScore > 0 ? 'testnet' : 'bitcoin',
      };
    } catch (e) {
      return null;
    }
  }
}

import { Transaction, getInputType, NETWORK, TEST_NETWORK, Address } from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import { bech32, bech32m } from '@scure/base';

export interface TxDetails {
  amount: number;
  fee: number;
  vBytes: number;
  feeRate: number;
  inputs: number;
  inputsList: { address: string; amount: number; txId: string; vout: number }[];
  outputs: { address: string; amount: number; isChange: boolean }[];
}

export interface SignerStatus {
  fingerprint: string;
  signed: boolean;
}

export interface PsbtAnalysis {
  valid: boolean;
  signerCount: number;
  amountBtc: number;
  networkFeeSat: number;
  outputCount: number;
  estimatedVBytes: number;
  detectedNetwork: 'bitcoin' | 'testnet' | 'unknown';
}

export class PsbtUtils {
  static decode(raw: string): Uint8Array {
    const clean = raw.replace(/\s/g, '');
    return /^[0-9a-fA-F]+$/.test(clean) ? hex.decode(clean) : base64.decode(clean);
  }

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

  static getThreshold(psbtBase64: string): number {
    try {
      const tx = Transaction.fromPSBT(base64.decode(psbtBase64));

      for (let i = 0; i < tx.inputsLength; i++) {
        const input = tx.getInput(i);
        if (!input) continue;

        const script = input.witnessScript || input.redeemScript;
        if (!script || script.length === 0) continue;

        const firstOp = script[0];
        if (firstOp >= 0x51 && firstOp <= 0x60) {
          return firstOp - 0x50;
        }
      }

      return 0;
    } catch {
      return 0;
    }
  }

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

      if (s.startsWith('76a914') && s.endsWith('88ac') && script.length === 25) {
        const pubKeyHash = script.slice(3, 23);
        return Address(networkConfig).encode({ type: 'pkh', hash: pubKeyHash } as any);
      }

      if (s.startsWith('a914') && s.endsWith('87') && script.length === 23) {
        const scriptHash = script.slice(2, 22);
        return Address(networkConfig).encode({ type: 'sh', hash: scriptHash } as any);
      }

      if (
        (s.startsWith('0014') && script.length === 22) ||
        (s.startsWith('0020') && script.length === 34)
      ) {
        const witnessProgram = script.slice(2);
        const words = bech32.toWords(witnessProgram);
        words.unshift(0);
        return bech32.encode(hrp, words);
      }

      if (s.length >= 4) {
        const versionByte = parseInt(s.slice(0, 2), 16);
        if (versionByte >= 0x51 && versionByte <= 0x60) {
          const witnessVersion = versionByte - 0x50;
          const witnessProgram = script.slice(2);
          const words = bech32m.toWords(witnessProgram);
          words.unshift(witnessVersion);
          return bech32m.encode(hrp, words);
        }
      }

      return s;
    } catch (e) {
      console.warn('Address formatting failed:', e, hex.encode(script));
      const s = hex.encode(script);
      if (s.startsWith('0014') || s.startsWith('0020') || s.startsWith('51')) return s.slice(4);
      if (s.startsWith('76a914')) return s.slice(6, 46);
      if (s.startsWith('a914')) return s.slice(4, 44);
      return s;
    }
  }

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

  static finalizeTx(psbtBase64: string): { hex: string; txId: string } | null {
    try {
      const tx = Transaction.fromPSBT(this.decode(psbtBase64));
      tx.finalize();
      return { hex: hex.encode(tx.extract()), txId: tx.id };
    } catch (e) {
      return null;
    }
  }

  static analyze(psbtBase64: string): PsbtAnalysis | null {
    try {
      const psbtBytes = this.decode(psbtBase64);
      const tx = Transaction.fromPSBT(psbtBytes, {
        allowUnknownInputs: true,
        allowUnknownOutputs: true,
      });

      const fingerprints = new Set<string>();
      let totalInput = BigInt(0);
      let totalOutput = BigInt(0);
      let networkScore = 0;
      let estimatedVBytes = 10;

      for (let i = 0; i < tx.inputsLength; i++) {
        const input = tx.getInput(i);
        const prev = this.getPrevOut(input);
        
        if (prev) {
          totalInput += prev.amount;
        }
        estimatedVBytes += this.estimateInputVBytes(input);

        if (input.bip32Derivation) {
          for (const [, meta] of input.bip32Derivation) {
            if (meta?.fingerprint != null) {
              fingerprints.add(meta.fingerprint.toString(16).padStart(8, '0'));
            }
            if (meta?.path?.length >= 2) {
              const coinType = meta.path[1];
              if (coinType === 2147483648) networkScore--;
              if (coinType === 2147483649) networkScore++;
            }
          }
        }
      }

      for (let i = 0; i < tx.outputsLength; i++) {
        const out = tx.getOutput(i);
        totalOutput += out.amount ?? BigInt(0);
        estimatedVBytes += 31;
      }

      let fee = BigInt(0);
      try {
        fee = tx.fee;
      } catch {
        fee = totalInput > totalOutput ? totalInput - totalOutput : BigInt(0);
      }

      let vBytes = estimatedVBytes;
      try {
        const real = tx.vsize;
        if (real > 0) vBytes = real;
      } catch {}

      return {
        valid: true,
        signerCount: fingerprints.size || 1,
        amountBtc: Number(totalOutput) / 100000000,
        networkFeeSat: Number(fee),
        outputCount: tx.outputsLength,
        estimatedVBytes: vBytes,
        detectedNetwork: networkScore > 0 ? 'testnet' : 'bitcoin',
      };
    } catch (e) {
      return null;
    }
  }

  static parseTxDetails(
    psbtBase64: string,
    network: 'bitcoin' | 'testnet' | 'signet' = 'bitcoin',
  ): TxDetails | null {
    try {
      const tx = Transaction.fromPSBT(this.decode(psbtBase64), {
        allowUnknownInputs: true,
        allowUnknownOutputs: true,
      });

      const inputsList = [];
      const outputs = [];
      let totalInput = BigInt(0);
      let totalOutput = BigInt(0);
      let estimatedVBytes = 10;

      for (let i = 0; i < tx.inputsLength; i++) {
        const input = tx.getInput(i);
        let amount = BigInt(0);
        let address = 'Unknown';
        let txId = '????';
        let vout = input.index ?? 0;

        if (input.txid) {
          const full = hex.encode(input.txid);
          txId = full.slice(0, 8) + '...';
        }

        const prev = this.getPrevOut(input);
        if (prev) {
          amount = prev.amount;
          totalInput += amount;
          address = this.formatScriptAddress(prev.script, network);
        } else if (input.nonWitnessUtxo) {
          address = 'Legacy Input (unparsed)';
        }

        estimatedVBytes += this.estimateInputVBytes(input);
        inputsList.push({ address, amount: Number(amount), txId, vout });
      }

      for (let i = 0; i < tx.outputsLength; i++) {
        const output = tx.getOutput(i);
        const amount = output.amount ?? BigInt(0);
        totalOutput += amount;
        estimatedVBytes += 31;

        const address = this.formatScriptAddress(output.script ?? new Uint8Array([]), network);
        let isChange = false;

        if (output.bip32Derivation) {
          for (const [, meta] of output.bip32Derivation as any[]) {
            if (meta?.path && meta.path.length >= 2 && meta.path[meta.path.length - 2] === 1) {
              isChange = true;
              break;
            }
          }
        }
        outputs.push({ address, amount: Number(amount), isChange });
      }

      outputs.sort((a, b) => Number(b.isChange) - Number(a.isChange));

      let fee = BigInt(0);
      try {
        fee = tx.fee;
      } catch {
        fee = totalInput > totalOutput ? totalInput - totalOutput : BigInt(0);
      }

      let vBytes = estimatedVBytes;
      try {
        const real = tx.vsize;
        if (real > 0) vBytes = real;
      } catch {}

      const feeRate = vBytes > 0 ? Number((Number(fee) / vBytes).toFixed(2)) : 0;

      return {
        amount: Number(totalOutput),
        fee: Number(fee),
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

  private static getPrevOut(
    input: ReturnType<Transaction['getInput']>
  ): { amount: bigint; script: Uint8Array } | null {
    if (input.witnessUtxo?.amount !== undefined) {
      return {
        amount: input.witnessUtxo.amount,
        script: input.witnessUtxo.script ?? new Uint8Array(),
      };
    }
    
    if (input.nonWitnessUtxo != null && input.index !== undefined) {
      try {
        const outputs = (input.nonWitnessUtxo as any).outputs;
        if (outputs && outputs[input.index]) {
          const out = outputs[input.index];
          if (out.amount == null) return null;
          return {
            amount: out.amount,
            script: out.script ?? new Uint8Array(),
          };
        }
        return null;
      } catch {
        return null;
      }
    }
    return null;
  }

  private static estimateInputVBytes(
    input: ReturnType<Transaction['getInput']>
  ): number {
    try {
      const { type } = getInputType(input);

      if (type === 'wpkh' || type.startsWith('wpkh')) return 68;
      if (type === 'tr' || type.startsWith('tr')) return 58;
      if (type.includes('sh-wpkh')) return 91;
      if (type === 'pkh' || type === 'sh' || type.startsWith('sh-')) return 148;
    } catch {
      // fall through to heuristics
    }

    if (input.witnessUtxo) {
      return input.redeemScript ? 91 : 68;
    }
    if (input.nonWitnessUtxo) return 148;
    return 68;
  }
}
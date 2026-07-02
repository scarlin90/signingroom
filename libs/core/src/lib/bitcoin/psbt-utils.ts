import { Transaction } from '@scure/btc-signer';
import { base64, hex } from '@scure/base';
import { bech32, bech32m } from '@scure/base';
import { NETWORK, TEST_NETWORK, Address } from '@scure/btc-signer';

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
      try { return base64.encode(hex.decode(clean)); } catch (e) { return input; }
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
      console.error("[Merge Failed]", e);
      return base;
    }
  }

  static getThreshold(psbtBase64: string): number {
    try {
      const tx = Transaction.fromPSBT(base64.decode(psbtBase64));
      const input = tx.getInput(0);
      const script = input.witnessScript || input.redeemScript;
      if (!script || script.length === 0) return 0;
      const firstOp = script[0];
      return (firstOp >= 0x51 && firstOp <= 0x60) ? firstOp - 0x50 : 0;
    } catch { return 0; }
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

  static parseTxDetails(psbtBase64: string, network: 'bitcoin' | 'testnet' | 'signet' = 'bitcoin'): TxDetails | null {
    try {
      const tx = Transaction.fromPSBT(base64.decode(psbtBase64));
      const inputsList = [];
      const outputs = [];
      let totalInput = 0;
      let totalOutput = 0;

      for (let i = 0; i < tx.inputsLength; i++) {
        const input = tx.getInput(i);
        let amount = 0;
        let address = "Legacy/Unknown";
        
        if (input.witnessUtxo) {
            amount = Number(input.witnessUtxo.amount);
            totalInput += amount;
            address = this.formatScriptAddress(input.witnessUtxo.script, network);
        } else if (input.nonWitnessUtxo) {
            address = "Legacy Input";
        }

        let txId = "????";
        let vout = 0;
        try {
            const rawInput = (tx as any).unsignedTx.inputs[i]; 
            if (rawInput?.txid) {
                txId = hex.encode(rawInput.txid).slice(0, 8) + "...";
                vout = rawInput.index;
            }
        } catch(e) {}

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
      let vBytes = 10 + (tx.inputsLength * 100) + (tx.outputsLength * 31); 
      try { vBytes = (tx as any).vsize || vBytes; } catch (e) {}
      const feeRate = vBytes > 0 ? Number((fee / vBytes).toFixed(2)) : 0;

      return { amount: totalOutput, fee, vBytes, feeRate, inputs: tx.inputsLength, inputsList, outputs };
    } catch (e) {
      console.error("Failed to parse PSBT", e);
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
                        isSigned = input.partialSig.some(p => this.areKeysEqual(p[0], pubkey));
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
    } catch (e) { return []; }
  }

  static formatScriptAddress(script: Uint8Array, network: 'bitcoin' | 'testnet' | 'signet'): string {
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
            if ((s.startsWith('0014') && script.length === 22) || 
                (s.startsWith('0020') && script.length === 34)) {
                
                const witnessProgram = script.slice(2);
                const words = bech32.toWords(witnessProgram);
                words.unshift(0);
                return bech32.encode(hrp, words);
            }

            // Taproot + Future Witness Versions (v1 to v16) = Bech32m (BIP-350)
            if (s.length >= 4) {
                const versionByte = parseInt(s.slice(0, 2), 16);
                if (versionByte >= 0x51 && versionByte <= 0x60) {   // OP_1 to OP_16
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
            if (s.startsWith('a914')) return s.slice(4, 44);   // P2SH fallback
            return s;
        }
  }

  private static areKeysEqual(k1: Uint8Array, k2: Uint8Array): boolean {
    if (hex.encode(k1) === hex.encode(k2)) return true;
        try {
            const getX = (k: Uint8Array) => k.length === 33 ? k.slice(1) : k.length === 65 ? k.slice(1, 33) : k;
            return hex.encode(getX(k1)) === hex.encode(getX(k2));
        } catch (e) { return false; }
    }

    static finalizeTx(psbtBase64: string): { hex: string, txId: string } | null {
    try {
        const tx = Transaction.fromPSBT(this.decode(psbtBase64));
        tx.finalize(); 
        return { hex: hex.encode(tx.extract()), txId: tx.id };
    } catch (e) { return null; }
  }

  static analyze(psbtBase64: string): PsbtAnalysis | null {
    try {
        const psbtBytes = this.decode(psbtBase64);
        const tx = Transaction.fromPSBT(psbtBytes, { allowUnknown: true });

        const fingerprints = new Set<string>();
        let totalInput = 0, totalOutput = 0, networkScore = 0;

        for(let i=0; i<tx.inputsLength; i++) {
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
        for(let i=0; i<tx.outputsLength; i++) totalOutput += Number(tx.getOutput(i).amount);

        const fee = totalInput > 0 ? totalInput - totalOutput : 0;

        return {
            valid: true,
            signerCount: fingerprints.size || 1,
            amountBtc: totalOutput / 100000000,
            networkFeeSat: fee,
            outputCount: tx.outputsLength,
            detectedNetwork: networkScore > 0 ? 'testnet' : 'bitcoin'
        };
    } catch (e) { return null; }
  }
}
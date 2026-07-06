import { EncryptionEngine } from '../crypto/encryption-engine';

/**
 * Data payload returned upon room production. Separates records intended for local integration
 * from records prepared for direct network serialization.
 */
export interface RoomCreationPayload {
  /** Private configurations that must be saved locally or injected directly into secure URL hashes. */
  localData: {
    /** The unique string tracking identifier for the session room space. */
    roomId: string;
    /** The base64-encoded symmetric encryption key used to encrypt the session payload boundaries. */
    encryptionKey: string;
    /** The unique administrative token required to modify room privileges or state flags. */
    adminSecret: string;
  };
  /** Pre-formatted data mapping ready to be explicitly POSTed to the host `/api/room` endpoint. */
  httpPayload: {
    /** The unique string tracking identifier for the session room space. */
    roomId: string;
    /** A blinded cryptographic proof used to verify valid room access parameters without leaking keys. */
    expectedPass: string;
    /** The base64-encoded encrypted string representation of the core transaction matrix (PSBT). */
    encryptedPsbt: string;
    /** The base64-encoded encrypted string format of the administrative access token. */
    adminToken: string;
    /** The target blockchain environment constraints configuration. */
    network: 'bitcoin' | 'testnet' | 'signet';
    /** The matching semantic versioning identifier tracking library communications protocols. */
    protocolVersion: string;
    /** The base64-encoded encrypted string representation of the descriptive room title. */
    encryptedRoomName: string;
  };
}

/**
 * Factory coordinator engine managing the setup configurations for temporary collaborative workspaces.
 * Abstracts UUID generation, blind salting, and key distribution configurations across network operations.
 */
export class RoomFactory {
  /**
   * Prepares and encrypts all required token structures into a structured payload ready for backend initialization.
   * Handles all Key, Identifier, and cryptographic signature mappings automatically.
   * * @param engine - The structural EncryptionEngine instance running cryptographic tasks.
   * @param rawPsbtBase64 - The unencrypted Base64 string payload representing a Partically Signed Bitcoin Transaction.
   * @param network - The targeted blockchain network context constraint identifier.
   * @param roomName - The raw descriptive title assigned to the collaborative session space. Default is "Untitled Room".
   * @param protocolVersion - Semantic version configuration mapping. Default is "1.0.0".
   * @returns A Promise resolving to a completed RoomCreationPayload schema mapping.
   */
  static async prepareCreationPayload(
    engine: EncryptionEngine,
    rawPsbtBase64: string,
    network: 'bitcoin' | 'testnet' | 'signet',
    roomName: string = 'Untitled Room',
    protocolVersion: string = '1.0.0',
  ): Promise<RoomCreationPayload> {
    // Generate core secrets safely depending on environmental capabilities
    const encryptionKey = await engine.generateKey();
    const roomId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : this.fallbackUUID();
    const adminSecret =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : this.fallbackUUID();

    // Encrypt payloads using the shared key
    const encryptedData = await engine.encrypt(rawPsbtBase64, encryptionKey);
    const encryptedAdminToken = await engine.encrypt(adminSecret, encryptionKey);
    const encryptedRoomName = await engine.encrypt(roomName, encryptionKey);
    const expectedPass = await engine.blindData(roomId, encryptionKey);

    return {
      localData: {
        roomId,
        encryptionKey,
        adminSecret,
      },
      httpPayload: {
        roomId,
        expectedPass,
        encryptedPsbt: encryptedData,
        adminToken: encryptedAdminToken,
        network,
        protocolVersion,
        encryptedRoomName,
      },
    };
  }

  /**
   * Generates a pseudorandom RFC 4122 version 4 compliant string wrapper for non-standard execution contexts.
   * This is a standard math-based string substitution utility used when native platform `crypto.randomUUID` is locked.
   * * @returns A formatted 36-character canonical string structure identifier.
   */
  private static fallbackUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0,
        v = c == 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

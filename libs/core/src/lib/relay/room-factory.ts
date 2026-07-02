import { EncryptionEngine } from '../crypto/encryption-engine';

export interface RoomCreationPayload {
  // Data for the integrator to save locally/put in the URL
  localData: {
    roomId: string;
    encryptionKey: string;
    adminSecret: string;
  };
  // Data ready to be POSTed to your /api/room endpoint
  httpPayload: {
    roomId: string;
    expectedPass: string;
    encryptedPsbt: string;
    adminToken: string;
    network: 'bitcoin' | 'testnet' | 'signet';
    protocolVersion: string;
    encryptedRoomName: string;
  };
}

export class RoomFactory {
  /**
   * Prepares the fully encrypted payload required to initialize a new room on the server.
   * This handles all Key, UUID, and blind/salt generation automatically.
   */
  static async prepareCreationPayload(
    engine: EncryptionEngine,
    rawPsbtBase64: string,
    network: 'bitcoin' | 'testnet' | 'signet',
    roomName: string = "Untitled Room",
    protocolVersion: string = "1.0.0"
  ): Promise<RoomCreationPayload> {
    
    // 1. Generate core secrets
    const encryptionKey = await engine.generateKey();
    const roomId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : this.fallbackUUID();
    const adminSecret = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : this.fallbackUUID();

    // 2. Encrypt payloads
    const encryptedData = await engine.encrypt(rawPsbtBase64, encryptionKey);
    const encryptedAdminToken = await engine.encrypt(adminSecret, encryptionKey);
    const encryptedRoomName = await engine.encrypt(roomName, encryptionKey);
    const expectedPass = await engine.blindData(roomId, encryptionKey);

    return {
      localData: {
        roomId,
        encryptionKey,
        adminSecret
      },
      httpPayload: {
        roomId,
        expectedPass,
        encryptedPsbt: encryptedData,
        adminToken: encryptedAdminToken,
        network,
        protocolVersion,
        encryptedRoomName
      }
    };
  }

  private static fallbackUUID(): string {
    // Simple fallback for environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
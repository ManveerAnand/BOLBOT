import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../../../src/security/webhookCrypto";

describe("webhookCrypto", () => {
  it("round-trips a webhook token without storing plaintext", () => {
    const key = Buffer.alloc(32, 9);
    const token = "discord-webhook-token-example";
    const ciphertext = encryptSecret(token, key);
    expect(ciphertext).not.toContain(token);
    expect(decryptSecret(ciphertext, key)).toBe(token);
  });
});

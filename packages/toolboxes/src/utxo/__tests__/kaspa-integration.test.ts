import { describe, expect, it } from "bun:test";
import { Chain } from "@swapkit/helpers";
import { getUtxoToolbox } from "../toolbox";

describe("UTXO Toolbox Kaspa Integration", () => {
  const testPhrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

  it("should create Kaspa toolbox through main UTXO toolbox factory", async () => {
    const toolbox = await getUtxoToolbox(Chain.Kaspa);

    expect(toolbox).toBeDefined();
    expect(typeof toolbox.validateAddress).toBe("function");
    expect(typeof toolbox.getBalance).toBe("function");
    expect(typeof toolbox.getFeeRates).toBe("function");
    expect(typeof toolbox.broadcastTx).toBe("function");
    expect(typeof toolbox.createKeysForPath).toBe("function");
  });

  it("should create Kaspa toolbox with phrase", async () => {
    const toolbox = await getUtxoToolbox(Chain.Kaspa, { phrase: testPhrase });

    expect(toolbox).toBeDefined();
    expect(() => toolbox.getAddress()).not.toThrow();
  });

  it("should generate deterministic Kaspa addresses from mnemonic", async () => {
    const toolbox = await getUtxoToolbox(Chain.Kaspa, { phrase: testPhrase });

    const address = await toolbox.getAddress();
    expect(address).toBeDefined();
    expect(typeof address).toBe("string");

    // Kaspa addresses should have the kaspa: prefix
    expect(address?.startsWith("kaspa:")).toBe(true);

    // Address validation should pass
    expect(toolbox.validateAddress(address || "")).toBe(true);

    // Should generate the same address with the same mnemonic
    const toolbox2 = await getUtxoToolbox(Chain.Kaspa, { phrase: testPhrase });
    const address2 = await toolbox2.getAddress();
    expect(address).toBe(address2);
  });

  it("should validate Kaspa addresses correctly", async () => {
    const toolbox = await getUtxoToolbox(Chain.Kaspa);

    // Valid Kaspa mainnet addresses (with proper checksums verified against Kaspa network)
    expect(toolbox.validateAddress("kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j")).toBe(true);
    expect(toolbox.validateAddress("kaspa:precqv0krj3r6uyyfa36ga7s0u9jct0v4wg8ctsfde2gkrsgwgw8jgxfzfc98")).toBe(true);

    // Invalid: missing prefix (Kaspa addresses MUST have network prefix)
    expect(toolbox.validateAddress("qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j")).toBe(false);

    // Invalid addresses
    expect(toolbox.validateAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2")).toBe(false); // Bitcoin address
    expect(toolbox.validateAddress("")).toBe(false); // Empty string
    expect(toolbox.validateAddress("invalid")).toBe(false); // Invalid string
  });

  it("should create keys for derivation path", async () => {
    const toolbox = await getUtxoToolbox(Chain.Kaspa, { phrase: testPhrase });

    const keys = await toolbox.createKeysForPath({ derivationPath: "m/44'/111111'/0'/0/0", phrase: testPhrase });

    expect(keys).toBeDefined();
    expect(keys.publicKey).toBeDefined();
    expect(keys.privateKey).toBeDefined();

    // Schnorr public key should be 32 bytes (x-only)
    expect(keys.publicKey.length).toBe(32);

    // Private key should be 32 bytes
    expect(keys.privateKey.length).toBe(32);
  });

  it("should get private key from mnemonic in hex format", async () => {
    const toolbox = await getUtxoToolbox(Chain.Kaspa, { phrase: testPhrase });

    const privateKeyHex = await toolbox.getPrivateKeyFromMnemonic({
      derivationPath: "m/44'/111111'/0'/0/0",
      phrase: testPhrase,
    });

    expect(typeof privateKeyHex).toBe("string");
    expect(privateKeyHex.length).toBe(64); // 32 bytes in hex = 64 characters
    expect(/^[0-9a-f]+$/i.test(privateKeyHex)).toBe(true); // Valid hex string
  });

  it("should generate address from keys", async () => {
    const toolbox = await getUtxoToolbox(Chain.Kaspa, { phrase: testPhrase });

    const keys = await toolbox.createKeysForPath({ derivationPath: "m/44'/111111'/0'/0/0", phrase: testPhrase });

    const address = toolbox.getAddressFromKeys(keys);

    expect(address).toBeDefined();
    expect(address.startsWith("kaspa:")).toBe(true);
    expect(toolbox.validateAddress(address)).toBe(true);

    // Should match the address from getAddress()
    const toolboxAddress = await toolbox.getAddress();
    expect(address).toBe(toolboxAddress);
  });

  it("should use correct BIP44 coin type 111111", async () => {
    const toolbox = await getUtxoToolbox(Chain.Kaspa, { phrase: testPhrase });

    // Default derivation path should use coin type 111111
    const keys1 = await toolbox.createKeysForPath({ derivationPath: "m/44'/111111'/0'/0/0", phrase: testPhrase });

    // Should be different from other coin types
    const keysBTC = await toolbox.createKeysForPath({
      derivationPath: "m/44'/0'/0'/0/0", // Bitcoin coin type
      phrase: testPhrase,
    });

    // Keys should be different due to different coin types
    expect(Buffer.from(keys1.privateKey).toString("hex")).not.toBe(Buffer.from(keysBTC.privateKey).toString("hex"));
  });

  it("should generate different addresses for different indices", async () => {
    const toolbox1 = await getUtxoToolbox(Chain.Kaspa, { index: 0, phrase: testPhrase });
    const toolbox2 = await getUtxoToolbox(Chain.Kaspa, { index: 1, phrase: testPhrase });

    const address1 = await toolbox1.getAddress();
    const address2 = await toolbox2.getAddress();

    expect(address1).toBeDefined();
    expect(address2).toBeDefined();
    expect(address1).not.toBe(address2);

    // Both should be valid Kaspa addresses
    expect(toolbox1.validateAddress(address1 || "")).toBe(true);
    expect(toolbox2.validateAddress(address2 || "")).toBe(true);
  });

  it("should handle custom derivation paths", async () => {
    const toolbox = await getUtxoToolbox(Chain.Kaspa, {
      derivationPath: [44, 111111, 1, 0, 5], // account 1, index 5
      phrase: testPhrase,
    });

    const address = await toolbox.getAddress();
    expect(address).toBeDefined();
    expect(address?.startsWith("kaspa:")).toBe(true);
    expect(toolbox.validateAddress(address || "")).toBe(true);

    // Should be different from default path
    const defaultToolbox = await getUtxoToolbox(Chain.Kaspa, { phrase: testPhrase });
    const defaultAddress = await defaultToolbox.getAddress();
    expect(address).not.toBe(defaultAddress);
  });

  it("should throw error for transfer (not implemented yet)", async () => {
    const toolbox = await getUtxoToolbox(Chain.Kaspa, { phrase: testPhrase });

    // Transfer is not implemented yet, should throw error
    expect(() =>
      toolbox.transfer({
        assetValue: {} as any,
        recipient: "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j",
      }),
    ).toThrow();
  });

  describe("Address Format Validation", () => {
    it("should accept addresses with network prefixes and valid checksums", async () => {
      const toolbox = await getUtxoToolbox(Chain.Kaspa);

      // Valid mainnet address with correct checksum
      expect(toolbox.validateAddress("kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j")).toBe(true);

      // Note: We can't just change the prefix without recalculating the checksum
      // Each network prefix changes the checksum calculation
      // So we only test with known valid addresses from each network
    });

    it("should reject addresses with incorrect length", async () => {
      const toolbox = await getUtxoToolbox(Chain.Kaspa);

      expect(toolbox.validateAddress("kaspa:qpau")).toBe(false);
      expect(toolbox.validateAddress("qpauqsvk7yf9unexwmxsnmg547mhyga37c")).toBe(false);
    });

    it("should be case-sensitive for prefix", async () => {
      const toolbox = await getUtxoToolbox(Chain.Kaspa);

      expect(toolbox.validateAddress("KASPA:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j")).toBe(
        false,
      );
      expect(toolbox.validateAddress("Kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j")).toBe(
        false,
      );
    });
  });

  describe("Security and Edge Cases", () => {
    it("should not confuse Kaspa with other UTXO chains", async () => {
      const kaspaToolbox = await getUtxoToolbox(Chain.Kaspa, { phrase: testPhrase });
      const btcToolbox = await getUtxoToolbox(Chain.Bitcoin, { phrase: testPhrase });

      const kaspaAddress = await kaspaToolbox.getAddress();
      const btcAddress = await btcToolbox.getAddress();

      expect(kaspaAddress).not.toBe(btcAddress);
      expect(kaspaToolbox.validateAddress(kaspaAddress || "")).toBe(true);
      expect(kaspaToolbox.validateAddress(btcAddress || "")).toBe(false);
    });

    it("should handle empty phrase gracefully", async () => {
      await expect(getUtxoToolbox(Chain.Kaspa, { phrase: "" })).rejects.toThrow();
    });

    it("should handle invalid mnemonic gracefully", async () => {
      await expect(
        getUtxoToolbox(Chain.Kaspa, { phrase: "invalid mnemonic phrase that is not real" }),
      ).rejects.toThrow();
    });
  });
});

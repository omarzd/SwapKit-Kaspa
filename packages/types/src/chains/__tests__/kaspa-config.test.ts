import { describe, expect, it } from "bun:test";
import { Chain, ChainId } from "../_enums";
import { getChainConfig } from "../index";
import { UTXOChains } from "../utxo";

describe("Kaspa Chain Configuration", () => {
  it("should have correct chain enum value", () => {
    expect(Chain.Kaspa).toBe("KAS");
  });

  it("should have correct chain ID", () => {
    expect(ChainId.Kaspa).toBe("kaspa");
  });

  it("should be included in UTXO chains", () => {
    expect(UTXOChains).toContain(Chain.Kaspa);
  });

  it("should have correct chain configuration", () => {
    const config = getChainConfig(Chain.Kaspa);

    expect(config.chain).toBe(Chain.Kaspa);
    expect(config.chainId).toBe(ChainId.Kaspa);
    expect(config.name).toBe("Kaspa");
    expect(config.nativeCurrency).toBe("KAS");
    expect(config.type).toBe("utxo");
  });

  it("should have correct decimal precision", () => {
    const config = getChainConfig(Chain.Kaspa);
    expect(config.baseDecimal).toBe(8);
  });

  it("should have correct block time", () => {
    const config = getChainConfig(Chain.Kaspa);
    expect(config.blockTime).toBe(1);
  });

  it("should have correct derivation path", () => {
    const config = getChainConfig(Chain.Kaspa);
    expect(config.networkDerivationPath).toEqual([44, 111111, 0, 0, 0]);
  });

  it("should have explorer URL configured", () => {
    const config = getChainConfig(Chain.Kaspa);
    expect(config.explorerUrl).toBe("https://explorer.kaspa.org");
  });

  it("should have RPC URLs configured", () => {
    const config = getChainConfig(Chain.Kaspa);
    expect(config.rpcUrls).toBeDefined();
    expect(config.rpcUrls.length).toBeGreaterThan(0);
    expect(config.rpcUrls[0]).toBe("https://api.kaspa.org");
  });

  it("should have fallback RPC URL", () => {
    const config = getChainConfig(Chain.Kaspa);
    expect(config.rpcUrls.length).toBeGreaterThanOrEqual(2);
    expect(config.rpcUrls[1]).toBe("https://kaspa-rpc.publicnode.com");
  });

  describe("BIP44 Coin Type Verification", () => {
    it("should use correct coin type 111111 per Kaspa specification", () => {
      const config = getChainConfig(Chain.Kaspa);
      const [purpose, coinType] = config.networkDerivationPath;

      expect(purpose).toBe(44);
      expect(coinType).toBe(111111);
    });

    it("should follow BIP44 path structure: m/44'/111111'/0'/0/0", () => {
      const config = getChainConfig(Chain.Kaspa);
      expect(config.networkDerivationPath).toHaveLength(5);
      expect(config.networkDerivationPath[0]).toBe(44);
      expect(config.networkDerivationPath[1]).toBe(111111);
      expect(config.networkDerivationPath[2]).toBe(0);
      expect(config.networkDerivationPath[3]).toBe(0);
      expect(config.networkDerivationPath[4]).toBe(0);
    });
  });

  describe("Safety Checks", () => {
    it("should not confuse Kaspa with Bitcoin", () => {
      const kaspaConfig = getChainConfig(Chain.Kaspa);
      const btcConfig = getChainConfig(Chain.Bitcoin);

      expect(kaspaConfig.chainId).not.toBe(btcConfig.chainId);
      expect(kaspaConfig.networkDerivationPath[1]).not.toBe(btcConfig.networkDerivationPath[1]);
    });

    it("should have different configuration from other UTXO chains", () => {
      const kaspaConfig = getChainConfig(Chain.Kaspa);
      const ltcConfig = getChainConfig(Chain.Litecoin);
      const dogeConfig = getChainConfig(Chain.Dogecoin);

      expect(kaspaConfig.chainId).not.toBe(ltcConfig.chainId);
      expect(kaspaConfig.chainId).not.toBe(dogeConfig.chainId);
      expect(kaspaConfig.networkDerivationPath).not.toEqual(ltcConfig.networkDerivationPath);
      expect(kaspaConfig.networkDerivationPath).not.toEqual(dogeConfig.networkDerivationPath);
    });
  });
});

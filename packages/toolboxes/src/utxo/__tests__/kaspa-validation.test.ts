import { describe, expect, it } from "bun:test";
import { validateKaspaAddress } from "../toolbox/validators";

describe("Kaspa Address Validation", () => {
  describe("Valid Mainnet Addresses", () => {
    it("should validate mainnet addresses with kaspa: prefix", () => {
      const validAddresses = [
        "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j",
        "kaspa:precqv0krj3r6uyyfa36ga7s0u9jct0v4wg8ctsfde2gkrsgwgw8jgxfzfc98",
        "kaspa:qq5g3f5kf5gjz5w3q3q3q3q3q3q3q3q3q3q3q3q3q3q3q3q3q3q3q3qqqfqrp3",
      ];

      for (const address of validAddresses) {
        expect(validateKaspaAddress(address)).toBe(true);
      }
    });

    it("should validate mainnet addresses without prefix", () => {
      const validAddresses = [
        "qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j",
        "precqv0krj3r6uyyfa36ga7s0u9jct0v4wg8ctsfde2gkrsgwgw8jgxfzfc98",
      ];

      for (const address of validAddresses) {
        expect(validateKaspaAddress(address)).toBe(true);
      }
    });
  });

  describe("Valid Testnet/Devnet/Simnet Addresses", () => {
    it("should validate testnet addresses with kaspatest: prefix", () => {
      expect(
        validateKaspaAddress("kaspatest:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j"),
      ).toBe(true);
    });

    it("should validate devnet addresses with kaspadev: prefix", () => {
      expect(
        validateKaspaAddress("kaspadev:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j"),
      ).toBe(true);
    });

    it("should validate simnet addresses with kaspasim: prefix", () => {
      expect(
        validateKaspaAddress("kaspasim:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j"),
      ).toBe(true);
    });
  });

  describe("Invalid Addresses", () => {
    it("should reject addresses with invalid length (too short)", () => {
      expect(validateKaspaAddress("kaspa:qpau")).toBe(false);
      expect(validateKaspaAddress("qpauqsvk7yf9unexwmxsnmg547mhyga37c")).toBe(false);
    });

    it("should reject addresses with invalid length (too long)", () => {
      expect(
        validateKaspaAddress(
          "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5jextracharacters",
        ),
      ).toBe(false);
    });

    it("should reject addresses with invalid characters", () => {
      expect(validateKaspaAddress("kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgztHw5j")).toBe(
        false,
      );
      expect(validateKaspaAddress("kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsg1thw5j")).toBe(
        false,
      );
      expect(validateKaspaAddress("kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgBthw5j")).toBe(
        false,
      );
      expect(validateKaspaAddress("kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgOthw5j")).toBe(
        false,
      );
      expect(validateKaspaAddress("kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgIthw5j")).toBe(
        false,
      );
    });

    it("should reject empty string", () => {
      expect(validateKaspaAddress("")).toBe(false);
    });

    it("should reject invalid string", () => {
      expect(validateKaspaAddress("invalid")).toBe(false);
      expect(validateKaspaAddress("not_a_kaspa_address")).toBe(false);
    });

    it("should reject Bitcoin addresses", () => {
      expect(validateKaspaAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2")).toBe(false);
      expect(validateKaspaAddress("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toBe(false);
    });

    it("should reject Ethereum addresses", () => {
      expect(validateKaspaAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb")).toBe(false);
    });

    it("should reject Litecoin addresses", () => {
      expect(validateKaspaAddress("LRpYf2jLHyVGq3v8UpZsJkeaW4pD1aYfFh")).toBe(false);
      expect(validateKaspaAddress("ltc1qn3q3sp6dngrpq4pkxv8wyq3cjzp3sqxrp55jdj")).toBe(false);
    });

    it("should reject Zcash addresses", () => {
      expect(validateKaspaAddress("t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F")).toBe(false);
    });

    it("should reject Bitcoin Cash addresses", () => {
      expect(validateKaspaAddress("bitcoincash:qr5agtachyxvrwxu76vzszan5pnvuzy8dm")).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle null/undefined gracefully", () => {
      expect(validateKaspaAddress(null as any)).toBe(false);
      expect(validateKaspaAddress(undefined as any)).toBe(false);
    });

    it("should handle non-string inputs", () => {
      expect(validateKaspaAddress(123 as any)).toBe(false);
      expect(validateKaspaAddress({} as any)).toBe(false);
      expect(validateKaspaAddress([] as any)).toBe(false);
    });

    it("should be case-sensitive for prefix", () => {
      expect(validateKaspaAddress("KASPA:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j")).toBe(
        false,
      );
      expect(validateKaspaAddress("Kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j")).toBe(
        false,
      );
    });
  });
});

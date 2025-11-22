import { beforeEach, describe, expect, it, mock } from "bun:test";
import { RequestClient, SwapKitError } from "@swapkit/helpers";
import {
  broadcastKaspaTransaction,
  getKaspaBalance,
  getKaspaFeeEstimate,
  getKaspaTransaction,
  getKaspaUtxos,
  kasToSompi,
  sompiToKas,
  type KaspaUTXO,
} from "../helpers/kaspaApi";

describe("Kaspa API Layer", () => {
  // Reset mocks before each test
  beforeEach(() => {
    mock.restore();
  });

  describe("getKaspaUtxos", () => {
    it("should fetch and parse UTXOs correctly", async () => {
      const mockResponse = {
        address: "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j",
        utxos: [
          {
            outpoint: {
              transactionId: "abc123",
              index: 0,
            },
            utxoEntry: {
              amount: "100000000", // 1 KAS
              scriptPublicKey: {
                scriptPublicKey: "76a914...",
                version: 0,
              },
              blockDaaScore: "12345",
              isCoinbase: false,
            },
          },
          {
            outpoint: {
              transactionId: "def456",
              index: 1,
            },
            utxoEntry: {
              amount: "50000000", // 0.5 KAS
              scriptPublicKey: {
                scriptPublicKey: "76a915...",
                version: 0,
              },
              blockDaaScore: "12346",
              isCoinbase: true,
            },
          },
        ],
      };

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve(mockResponse)),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      const utxos = await getKaspaUtxos({
        address: "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j",
      });

      expect(utxos).toBeDefined();
      expect(utxos.length).toBe(2);

      // First UTXO (should be sorted by amount descending)
      expect(utxos[0].transactionId).toBe("abc123");
      expect(utxos[0].index).toBe(0);
      expect(utxos[0].amount).toBe(100000000n);
      expect(utxos[0].scriptPublicKey).toBe("76a914...");
      expect(utxos[0].blockDaaScore).toBe(12345);
      expect(utxos[0].isCoinbase).toBe(false);

      // Second UTXO
      expect(utxos[1].transactionId).toBe("def456");
      expect(utxos[1].index).toBe(1);
      expect(utxos[1].amount).toBe(50000000n);
      expect(utxos[1].isCoinbase).toBe(true);
    });

    it("should sort UTXOs by amount (descending)", async () => {
      // Use a valid Kaspa address for the test
      const validAddress = "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j";

      const mockResponse = {
        address: validAddress,
        utxos: [
          {
            outpoint: { transactionId: "small", index: 0 },
            utxoEntry: {
              amount: "1000",
              scriptPublicKey: { scriptPublicKey: "script1", version: 0 },
              blockDaaScore: "1",
              isCoinbase: false,
            },
          },
          {
            outpoint: { transactionId: "large", index: 0 },
            utxoEntry: {
              amount: "1000000",
              scriptPublicKey: { scriptPublicKey: "script2", version: 0 },
              blockDaaScore: "2",
              isCoinbase: false,
            },
          },
          {
            outpoint: { transactionId: "medium", index: 0 },
            utxoEntry: {
              amount: "10000",
              scriptPublicKey: { scriptPublicKey: "script3", version: 0 },
              blockDaaScore: "3",
              isCoinbase: false,
            },
          },
        ],
      };

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve(mockResponse)),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      const utxos = await getKaspaUtxos({ address: validAddress });

      // Should be sorted largest to smallest
      expect(utxos[0].amount).toBe(1000000n);
      expect(utxos[1].amount).toBe(10000n);
      expect(utxos[2].amount).toBe(1000n);
    });

    it("should handle address with network prefix", async () => {
      const mockResponse = { address: "test", utxos: [] };

      const mockGet = mock(() => Promise.resolve(mockResponse));
      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mockGet,
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      await getKaspaUtxos({ address: "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j" });

      // Should strip the "kaspa:" prefix in the API call
      expect(mockGet).toHaveBeenCalled();
      const callUrl = mockGet.mock.calls[0][0];
      expect(callUrl).toContain("qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j");
      expect(callUrl).not.toContain("kaspa:");
    });

    it("should throw SwapKitError on invalid API response", async () => {
      const validAddress = "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j";

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve(null)),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      await expect(getKaspaUtxos({ address: validAddress })).rejects.toThrow();
    });

    it("should throw SwapKitError on network error", async () => {
      const validAddress = "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j";

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.reject(new Error("Network error"))),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      await expect(getKaspaUtxos({ address: validAddress })).rejects.toThrow();
    });

    it("should handle empty UTXO list", async () => {
      const validAddress = "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j";
      const mockResponse = { address: validAddress, utxos: [] };

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve(mockResponse)),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      const utxos = await getKaspaUtxos({ address: validAddress });
      expect(utxos).toEqual([]);
    });
  });

  describe("getKaspaBalance", () => {
    it("should fetch and parse balance correctly", async () => {
      const validAddress = "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j";
      const mockResponse = {
        address: validAddress,
        balance: "250000000", // 2.5 KAS
      };

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve(mockResponse)),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      const balance = await getKaspaBalance({ address: validAddress });

      expect(balance).toBe(250000000n);
      expect(typeof balance).toBe("bigint");
    });

    it("should handle zero balance", async () => {
      const validAddress = "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j";
      const mockResponse = { address: validAddress, balance: "0" };

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve(mockResponse)),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      const balance = await getKaspaBalance({ address: validAddress });
      expect(balance).toBe(0n);
    });

    it("should handle very large balance", async () => {
      const validAddress = "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j";
      const mockResponse = {
        address: validAddress,
        balance: "999999999999999999", // Very large balance
      };

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve(mockResponse)),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      const balance = await getKaspaBalance({ address: validAddress });
      expect(balance).toBe(999999999999999999n);
    });

    it("should strip network prefix from address", async () => {
      const validAddress = "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j";
      const mockResponse = { address: "test", balance: "100" };
      const mockGet = mock(() => Promise.resolve(mockResponse));

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mockGet,
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      await getKaspaBalance({ address: validAddress });

      const callUrl = mockGet.mock.calls[0][0];
      expect(callUrl).toContain("qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j");
      expect(callUrl).not.toContain("kaspa:");
    });

    it("should throw on invalid response", async () => {
      const validAddress = "kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j";

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve({ address: validAddress })), // Missing balance
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      await expect(getKaspaBalance({ address: validAddress })).rejects.toThrow();
    });
  });

  describe("getKaspaFeeEstimate", () => {
    it("should return normal priority fee by default", async () => {
      const mockResponse = {
        normalBuckets: [
          { feerate: 5, estimatedSeconds: 10 },
          { feerate: 3, estimatedSeconds: 20 },
          { feerate: 7, estimatedSeconds: 5 },
        ],
        priorityBucket: { feerate: 10, estimatedSeconds: 2 },
      };

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve(mockResponse)),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      const feeRate = await getKaspaFeeEstimate({});

      // Should return median of normal buckets: [3, 5, 7] -> median is 5
      expect(feeRate).toBe(5);
    });

    it("should return high priority fee when requested", async () => {
      const mockResponse = {
        normalBuckets: [{ feerate: 5, estimatedSeconds: 10 }],
        priorityBucket: { feerate: 15, estimatedSeconds: 1 },
      };

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve(mockResponse)),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      const feeRate = await getKaspaFeeEstimate({ priority: "high" });
      expect(feeRate).toBe(15);
    });

    it("should return low priority fee when requested", async () => {
      const mockResponse = {
        normalBuckets: [
          { feerate: 10, estimatedSeconds: 5 },
          { feerate: 3, estimatedSeconds: 30 },
          { feerate: 7, estimatedSeconds: 15 },
        ],
        priorityBucket: { feerate: 20, estimatedSeconds: 2 },
      };

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve(mockResponse)),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      const feeRate = await getKaspaFeeEstimate({ priority: "low" });

      // Should return minimum of normal buckets
      expect(feeRate).toBe(3);
    });

    it("should fallback to default fee on API error", async () => {
      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.reject(new Error("API error"))),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      const feeRate = await getKaspaFeeEstimate({});

      // Should return default fee of 1
      expect(feeRate).toBe(1);
    });

    it("should fallback to priority bucket if normal buckets empty", async () => {
      const mockResponse = {
        normalBuckets: [],
        priorityBucket: { feerate: 12, estimatedSeconds: 3 },
      };

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve(mockResponse)),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      const feeRate = await getKaspaFeeEstimate({ priority: "normal" });
      expect(feeRate).toBe(12);
    });
  });

  describe("broadcastKaspaTransaction", () => {
    it("should broadcast transaction successfully", async () => {
      const mockResponse = {
        transactionId: "0xabc123def456",
      };

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve({})),
          post: mock(() => Promise.resolve(mockResponse)),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      const txId = await broadcastKaspaTransaction({
        signedTxHex: "0102030405060708",
      });

      expect(txId).toBe("0xabc123def456");
    });

    it("should send correct request format", async () => {
      const mockResponse = { transactionId: "txid" };
      const mockPost = mock(() => Promise.resolve(mockResponse));

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve({})),
          post: mockPost,
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      await broadcastKaspaTransaction({ signedTxHex: "deadbeef" });

      expect(mockPost).toHaveBeenCalled();
      const [url, options] = mockPost.mock.calls[0];

      expect(url).toContain("/transactions");
      expect(options.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(options.body);
      expect(body.transaction).toBe("deadbeef");
    });

    it("should throw on missing transaction ID in response", async () => {
      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve({})),
          post: mock(() => Promise.resolve({})), // No transactionId
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      await expect(
        broadcastKaspaTransaction({ signedTxHex: "test" }),
      ).rejects.toThrow();
    });

    it("should throw on network error", async () => {
      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve({})),
          post: mock(() => Promise.reject(new Error("Network failure"))),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      await expect(
        broadcastKaspaTransaction({ signedTxHex: "test" }),
      ).rejects.toThrow();
    });
  });

  describe("getKaspaTransaction", () => {
    it("should fetch transaction details", async () => {
      // Use a valid 64-character hex transaction ID
      const validTxId = "a".repeat(64);
      const mockResponse = {
        transactionId: validTxId,
        inputs: [],
        outputs: [],
        blockHash: "blockhash",
      };

      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.resolve(mockResponse)),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      const tx = await getKaspaTransaction({ txId: validTxId });

      expect(tx).toEqual(mockResponse);
    });

    it("should throw on API error", async () => {
      mock.module("@swapkit/helpers", () => ({
        RequestClient: {
          get: mock(() => Promise.reject(new Error("Not found"))),
          post: mock(() => Promise.resolve({})),
        },
        SwapKitError: class extends Error {
          constructor(code: string, details: { error: string }) {
            super(details.error);
            this.name = code;
          }
        },
      }));

      await expect(getKaspaTransaction({ txId: "invalid" })).rejects.toThrow();
    });
  });

  describe("Helper Functions", () => {
    describe("kasToSompi", () => {
      it("should convert 1 KAS to 100,000,000 sompi", () => {
        expect(kasToSompi(1)).toBe(100_000_000n);
      });

      it("should convert fractional KAS correctly", () => {
        expect(kasToSompi(0.5)).toBe(50_000_000n);
        expect(kasToSompi(0.00000001)).toBe(1n);
        expect(kasToSompi(2.5)).toBe(250_000_000n);
      });

      it("should convert large amounts correctly", () => {
        expect(kasToSompi(1000)).toBe(100_000_000_000n);
        expect(kasToSompi(1_000_000)).toBe(100_000_000_000_000n);
      });

      it("should handle zero", () => {
        expect(kasToSompi(0)).toBe(0n);
      });

      it("should floor fractional sompi (no smaller than 1 sompi)", () => {
        // 0.000000001 KAS would be 0.1 sompi, should floor to 0
        expect(kasToSompi(0.000000001)).toBe(0n);
      });
    });

    describe("sompiToKas", () => {
      it("should convert 100,000,000 sompi to 1 KAS", () => {
        expect(sompiToKas(100_000_000n)).toBe(1);
      });

      it("should convert small amounts correctly", () => {
        expect(sompiToKas(50_000_000n)).toBe(0.5);
        expect(sompiToKas(1n)).toBe(0.00000001);
        expect(sompiToKas(250_000_000n)).toBe(2.5);
      });

      it("should convert large amounts correctly", () => {
        expect(sompiToKas(100_000_000_000n)).toBe(1000);
        expect(sompiToKas(100_000_000_000_000n)).toBe(1_000_000);
      });

      it("should handle zero", () => {
        expect(sompiToKas(0n)).toBe(0);
      });

      it("should return a number (not bigint)", () => {
        const result = sompiToKas(100_000_000n);
        expect(typeof result).toBe("number");
      });
    });

    describe("Round-trip conversion", () => {
      it("should maintain precision in round-trip conversions", () => {
        const testValues = [0, 0.00000001, 0.5, 1, 2.5, 100, 1000, 1_000_000];

        for (const kas of testValues) {
          const sompi = kasToSompi(kas);
          const backToKas = sompiToKas(sompi);
          expect(backToKas).toBe(kas);
        }
      });

      it("should handle sompi to KAS to sompi", () => {
        const testValues = [0n, 1n, 50_000_000n, 100_000_000n, 1_000_000_000n];

        for (const sompi of testValues) {
          const kas = sompiToKas(sompi);
          const backToSompi = kasToSompi(kas);
          expect(backToSompi).toBe(sompi);
        }
      });
    });
  });
});

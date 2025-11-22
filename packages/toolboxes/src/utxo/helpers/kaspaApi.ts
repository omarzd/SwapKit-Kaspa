/**
 * Kaspa API client for interacting with Kaspa REST API
 * API Documentation: https://api.kaspa.org/docs
 */

import { RequestClient, SwapKitError } from "@swapkit/helpers";

/**
 * Kaspa UTXO type
 */
export type KaspaUTXO = {
  transactionId: string; // Transaction hash
  index: number; // Output index
  amount: bigint; // Value in sompi (1 KAS = 100,000,000 sompi)
  scriptPublicKey: string; // Script public key hex
  blockDaaScore: number; // DAG ordering score
  isCoinbase: boolean; // Is coinbase output
};

/**
 * Kaspa API response for UTXOs
 */
type KaspaUtxoResponse = {
  address: string;
  utxos: Array<{
    outpoint: {
      transactionId: string;
      index: number;
    };
    utxoEntry: {
      amount: string; // Amount as string (can be very large)
      scriptPublicKey: {
        scriptPublicKey: string;
        version: number;
      };
      blockDaaScore: string;
      isCoinbase: boolean;
    };
  }>;
};

/**
 * Kaspa API response for balance
 */
type KaspaBalanceResponse = {
  address: string;
  balance: string; // Balance in sompi as string
};

/**
 * Kaspa API response for fee estimate
 */
type KaspaFeeEstimateResponse = {
  normalBuckets: Array<{
    feerate: number; // Fee rate per mass unit
    estimatedSeconds: number;
  }>;
  priorityBucket: {
    feerate: number;
    estimatedSeconds: number;
  };
};

/**
 * Default Kaspa API URL
 */
const DEFAULT_KASPA_API_URL = "https://api.kaspa.org";

/**
 * Get Kaspa API base URL from environment or use default
 */
function getKaspaApiUrl(customUrl?: string): string {
  return customUrl || DEFAULT_KASPA_API_URL;
}

/**
 * Fetch UTXOs for a Kaspa address
 *
 * @param address - Kaspa address (with or without prefix)
 * @param apiUrl - Optional custom API URL
 * @returns Array of UTXOs
 */
export async function getKaspaUtxos({
  address,
  apiUrl,
}: {
  address: string;
  apiUrl?: string;
}): Promise<KaspaUTXO[]> {
  try {
    const baseUrl = getKaspaApiUrl(apiUrl);

    // Strip network prefix if present (kaspa:, kaspatest:, etc.)
    const strippedAddress = address.includes(":")
      ? address.split(":")[1]
      : address;

    const url = `${baseUrl}/addresses/${strippedAddress}/utxos`;

    const response = await RequestClient.get<KaspaUtxoResponse>(url);

    if (!response || !response.utxos) {
      throw new SwapKitError("toolbox_kaspa_api_error", {
        error: "Invalid response from Kaspa API",
      });
    }

    // Convert API response to our UTXO type
    const utxos: KaspaUTXO[] = response.utxos.map((utxo) => ({
      transactionId: utxo.outpoint.transactionId,
      index: utxo.outpoint.index,
      amount: BigInt(utxo.utxoEntry.amount),
      scriptPublicKey: utxo.utxoEntry.scriptPublicKey.scriptPublicKey,
      blockDaaScore: Number.parseInt(utxo.utxoEntry.blockDaaScore, 10),
      isCoinbase: utxo.utxoEntry.isCoinbase,
    }));

    // Sort UTXOs by amount (descending) for efficient coin selection
    return utxos.sort((a, b) => {
      if (a.amount > b.amount) return -1;
      if (a.amount < b.amount) return 1;
      return 0;
    });
  } catch (error) {
    if (error instanceof SwapKitError) throw error;

    throw new SwapKitError("toolbox_kaspa_utxo_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error fetching UTXOs",
    });
  }
}

/**
 * Get balance for a Kaspa address
 *
 * @param address - Kaspa address (with or without prefix)
 * @param apiUrl - Optional custom API URL
 * @returns Balance in sompi
 */
export async function getKaspaBalance({
  address,
  apiUrl,
}: {
  address: string;
  apiUrl?: string;
}): Promise<bigint> {
  try {
    const baseUrl = getKaspaApiUrl(apiUrl);

    // Strip network prefix if present
    const strippedAddress = address.includes(":")
      ? address.split(":")[1]
      : address;

    const url = `${baseUrl}/addresses/${strippedAddress}/balance`;

    const response = await RequestClient.get<KaspaBalanceResponse>(url);

    if (!response || response.balance === undefined) {
      throw new SwapKitError("toolbox_kaspa_api_error", {
        error: "Invalid response from Kaspa API",
      });
    }

    return BigInt(response.balance);
  } catch (error) {
    if (error instanceof SwapKitError) throw error;

    throw new SwapKitError("toolbox_kaspa_balance_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error fetching balance",
    });
  }
}

/**
 * Get current fee estimate for Kaspa transactions
 *
 * Kaspa uses "mass" instead of "size" for fee calculation.
 * Fee = mass * feeRate
 *
 * @param apiUrl - Optional custom API URL
 * @param priority - Fee priority: "low", "normal", or "high"
 * @returns Fee rate per mass unit (in sompi per mass)
 */
export async function getKaspaFeeEstimate({
  apiUrl,
  priority = "normal",
}: {
  apiUrl?: string;
  priority?: "low" | "normal" | "high";
}): Promise<number> {
  try {
    const baseUrl = getKaspaApiUrl(apiUrl);
    const url = `${baseUrl}/info/fee-estimate`;

    const response = await RequestClient.get<KaspaFeeEstimateResponse>(url);

    if (!response || !response.normalBuckets || !response.priorityBucket) {
      // Fallback to default fee rate if API fails
      console.warn("Fee estimate API failed, using default fee rate");
      return 1; // 1 sompi per mass unit (very low fee)
    }

    // Select fee rate based on priority
    if (priority === "high") {
      return response.priorityBucket.feerate;
    }

    if (priority === "low" && response.normalBuckets.length > 0) {
      // Use the lowest fee rate from normal buckets
      return Math.min(...response.normalBuckets.map((b) => b.feerate));
    }

    // Normal priority: use median fee rate from normal buckets
    if (response.normalBuckets.length > 0) {
      const sortedRates = response.normalBuckets
        .map((b) => b.feerate)
        .sort((a, b) => a - b);
      const medianIndex = Math.floor(sortedRates.length / 2);
      return sortedRates[medianIndex];
    }

    // Fallback
    return response.priorityBucket.feerate;
  } catch (error) {
    // On error, return a safe default fee rate
    console.warn(
      "Fee estimate failed, using default:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return 1; // 1 sompi per mass unit
  }
}

/**
 * Broadcast a signed Kaspa transaction
 *
 * @param signedTxHex - Signed transaction as hex string
 * @param apiUrl - Optional custom API URL
 * @returns Transaction ID
 */
export async function broadcastKaspaTransaction({
  signedTxHex,
  apiUrl,
}: {
  signedTxHex: string;
  apiUrl?: string;
}): Promise<string> {
  try {
    const baseUrl = getKaspaApiUrl(apiUrl);
    const url = `${baseUrl}/transactions`;

    const body = JSON.stringify({
      transaction: signedTxHex,
    });

    const response = await RequestClient.post<{ transactionId: string }>(url, {
      body,
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response || !response.transactionId) {
      throw new SwapKitError("toolbox_kaspa_broadcast_failed", {
        error: "Invalid response from Kaspa API - no transaction ID returned",
      });
    }

    return response.transactionId;
  } catch (error) {
    if (error instanceof SwapKitError) throw error;

    throw new SwapKitError("toolbox_kaspa_broadcast_failed", {
      error: error instanceof Error ? error.message : "Unknown error broadcasting transaction",
    });
  }
}

/**
 * Get transaction details by transaction ID
 *
 * @param txId - Transaction ID
 * @param apiUrl - Optional custom API URL
 * @returns Transaction details
 */
export async function getKaspaTransaction({
  txId,
  apiUrl,
}: {
  txId: string;
  apiUrl?: string;
}): Promise<unknown> {
  try {
    const baseUrl = getKaspaApiUrl(apiUrl);
    const url = `${baseUrl}/transactions/${txId}`;

    const response = await RequestClient.get(url);

    if (!response) {
      throw new SwapKitError("toolbox_kaspa_api_error", {
        error: "Invalid response from Kaspa API",
      });
    }

    return response;
  } catch (error) {
    if (error instanceof SwapKitError) throw error;

    throw new SwapKitError("toolbox_kaspa_tx_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error fetching transaction",
    });
  }
}

/**
 * Helper: Convert KAS to sompi
 * 1 KAS = 100,000,000 sompi
 */
export function kasToSompi(kas: number): bigint {
  return BigInt(Math.floor(kas * 100_000_000));
}

/**
 * Helper: Convert sompi to KAS
 * 1 KAS = 100,000,000 sompi
 */
export function sompiToKas(sompi: bigint): number {
  return Number(sompi) / 100_000_000;
}

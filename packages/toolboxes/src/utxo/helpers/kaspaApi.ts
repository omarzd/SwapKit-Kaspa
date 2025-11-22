/**
 * Kaspa API client for interacting with Kaspa REST API
 * API Documentation: https://api.kaspa.org/docs
 */

import { RequestClient, SwapKitError } from "@swapkit/helpers";
import { validateKaspaAddress } from "../toolbox/validators";

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
 * Validate and sanitize custom API URL
 * Security: Ensures URL is HTTPS and properly formed
 */
function validateApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Must be HTTPS for security
    if (parsed.protocol !== "https:") {
      return false;
    }
    // Must have a valid hostname
    if (!parsed.hostname) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Kaspa API base URL from environment or use default
 * Security: Validates custom URLs to prevent data exfiltration
 */
function getKaspaApiUrl(customUrl?: string): string {
  if (customUrl) {
    if (!validateApiUrl(customUrl)) {
      throw new SwapKitError("toolbox_kaspa_invalid_api_url", {
        error: "Custom API URL must be a valid HTTPS URL",
      });
    }
    return customUrl;
  }
  return DEFAULT_KASPA_API_URL;
}

/**
 * Safely parse a string to BigInt
 * Security: Prevents crashes from malformed input
 */
function safeParseBigInt(value: string, fieldName: string): bigint {
  try {
    // Validate it's a numeric string
    if (!/^\d+$/.test(value)) {
      throw new Error(`Invalid numeric string: ${value}`);
    }
    return BigInt(value);
  } catch (error) {
    throw new SwapKitError("toolbox_kaspa_invalid_data", {
      error: `Failed to parse ${fieldName}: ${error instanceof Error ? error.message : "Invalid format"}`,
    });
  }
}

/**
 * Safely parse a string to number
 * Security: Validates result is not NaN
 */
function safeParseInt(value: string, fieldName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new SwapKitError("toolbox_kaspa_invalid_data", {
      error: `Failed to parse ${fieldName}: invalid number format`,
    });
  }
  return parsed;
}

/**
 * Validate and sanitize Kaspa address
 * Security: Prevents URL injection via malicious addresses
 */
function sanitizeAddress(address: string): string {
  // Validate address format
  if (!validateKaspaAddress(address)) {
    throw new SwapKitError("toolbox_kaspa_invalid_address", {
      error: "Invalid Kaspa address format",
    });
  }

  // Strip network prefix (kaspa:, kaspatest:, etc.)
  const strippedAddress = address.includes(":")
    ? address.split(":")[1]
    : address;

  // URL-encode to prevent injection
  return encodeURIComponent(strippedAddress);
}

/**
 * Validate transaction ID format
 * Security: Ensures txId is valid hex to prevent injection
 */
function validateTxId(txId: string): string {
  // Transaction IDs should be hex strings (64 characters for SHA-256)
  if (!/^[0-9a-fA-F]{64}$/.test(txId)) {
    throw new SwapKitError("toolbox_kaspa_invalid_txid", {
      error: "Invalid transaction ID format (must be 64-character hex string)",
    });
  }
  return encodeURIComponent(txId);
}

/**
 * Validate signed transaction hex
 * Security: Ensures transaction data is valid hex
 */
function validateSignedTxHex(hex: string): void {
  if (!hex || hex.length === 0) {
    throw new SwapKitError("toolbox_kaspa_invalid_tx", {
      error: "Signed transaction hex cannot be empty",
    });
  }
  // Must be valid hex string
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new SwapKitError("toolbox_kaspa_invalid_tx", {
      error: "Signed transaction must be a valid hex string",
    });
  }
  // Reasonable length check (prevent DoS with extremely large inputs)
  if (hex.length > 1_000_000) {
    // ~500KB max
    throw new SwapKitError("toolbox_kaspa_invalid_tx", {
      error: "Signed transaction hex is too large",
    });
  }
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

    // Validate and sanitize address (prevents URL injection)
    const sanitizedAddress = sanitizeAddress(address);

    const url = `${baseUrl}/addresses/${sanitizedAddress}/utxos`;

    const response = await RequestClient.get<KaspaUtxoResponse>(url);

    if (!response || !response.utxos) {
      throw new SwapKitError("toolbox_kaspa_api_error", {
        error: "Invalid response from Kaspa API",
      });
    }

    // Convert API response to our UTXO type (with safe parsing)
    const utxos: KaspaUTXO[] = response.utxos.map((utxo) => ({
      transactionId: utxo.outpoint.transactionId,
      index: utxo.outpoint.index,
      amount: safeParseBigInt(utxo.utxoEntry.amount, "UTXO amount"),
      scriptPublicKey: utxo.utxoEntry.scriptPublicKey.scriptPublicKey,
      blockDaaScore: safeParseInt(utxo.utxoEntry.blockDaaScore, "block DAA score"),
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

    // Validate and sanitize address (prevents URL injection)
    const sanitizedAddress = sanitizeAddress(address);

    const url = `${baseUrl}/addresses/${sanitizedAddress}/balance`;

    const response = await RequestClient.get<KaspaBalanceResponse>(url);

    if (!response || response.balance === undefined) {
      throw new SwapKitError("toolbox_kaspa_api_error", {
        error: "Invalid response from Kaspa API",
      });
    }

    return safeParseBigInt(response.balance, "balance");
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
    // Validate transaction hex (prevents malicious input)
    validateSignedTxHex(signedTxHex);

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
    // Validate and sanitize transaction ID (prevents URL injection)
    const sanitizedTxId = validateTxId(txId);

    const baseUrl = getKaspaApiUrl(apiUrl);
    const url = `${baseUrl}/transactions/${sanitizedTxId}`;

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

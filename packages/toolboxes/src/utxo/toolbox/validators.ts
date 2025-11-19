import { networks, address as zcashAddress } from "@bitgo/utxo-lib";
import bs58check from "bs58check";
import { UtxoNetwork as bchNetwork, detectAddressNetwork, isValidAddress } from "../helpers";

export function stripPrefix(address: string) {
  return address.replace(/(bchtest:|bitcoincash:)/, "");
}

export function bchValidateAddress(address: string) {
  const strippedAddress = stripPrefix(address);
  return isValidAddress(strippedAddress) && detectAddressNetwork(strippedAddress) === bchNetwork.Mainnet;
}

export function validateZcashAddress(address: string): boolean {
  try {
    if (address.startsWith("z")) {
      console.warn("Shielded Zcash addresses (z-addresses) are not supported. Use transparent addresses (t1/t3) only.");
      return false;
    }

    const network = networks.zcash;

    try {
      zcashAddress.toOutputScript(address, network);
      return true;
    } catch {
      const decoded = bs58check.decode(address);
      if (decoded.length < 21) return false;

      const version = decoded[0];
      return version === network.pubKeyHash || version === network.scriptHash;
    }
  } catch {
    return false;
  }
}

/**
 * Kaspa bech32 character set
 * Source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/bech32.rs
 */
const KASPA_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

/**
 * Reverse lookup table for Kaspa bech32 characters
 */
const KASPA_REV_CHARSET: Record<string, number> = {};
for (let i = 0; i < KASPA_CHARSET.length; i++) {
  const char = KASPA_CHARSET.charAt(i);
  KASPA_REV_CHARSET[char] = i;
}

/**
 * Kaspa custom polymod function for checksum calculation
 * Uses 5 XOR constants specific to Kaspa (not standard bech32 or bech32m)
 * Source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/bech32.rs
 */
function kaspaPolymod(values: Uint8Array): bigint {
  let c = 1n;
  for (const d of values) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);

    if (c0 & 0x01n) c ^= 0x98f2bc8e61n;
    if (c0 & 0x02n) c ^= 0x79b76d99e2n;
    if (c0 & 0x04n) c ^= 0xf33e5fb3c4n;
    if (c0 & 0x08n) c ^= 0xae2eabe2a8n;
    if (c0 & 0x10n) c ^= 0x1e4f43e470n;
  }
  return c ^ 1n;
}

/**
 * Convert 5-bit values back to 8-bit bytes
 */
function convert5to8(data: Uint8Array): Uint8Array {
  const eightBit = new Uint8Array((data.length * 5) / 8);
  let currentIdx = 0;
  let buff = 0;
  let bits = 0;

  for (const value of data) {
    buff = (buff << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      eightBit[currentIdx++] = (buff >> bits) & 0xff;
      buff &= (1 << bits) - 1;
    }
  }
  return eightBit;
}

/**
 * Calculate Kaspa address checksum
 * Combines prefix (lowercase 5-bit), separator (0), payload (5-bit), and 8 zero bytes
 */
function kaspaChecksum(payload5bit: Uint8Array, prefix: string): bigint {
  const prefix5bit = new Uint8Array(prefix.length);
  for (let i = 0; i < prefix.length; i++) {
    prefix5bit[i] = prefix.charCodeAt(i) & 0x1f;
  }

  const combined = new Uint8Array(prefix5bit.length + 1 + payload5bit.length + 8);
  combined.set(prefix5bit, 0);
  combined[prefix5bit.length] = 0; // separator
  combined.set(payload5bit, prefix5bit.length + 1);
  // Last 8 bytes are already zero from initialization

  return kaspaPolymod(combined);
}

/**
 * Extract network prefix from Kaspa address
 */
function extractKaspaNetworkPrefix(address: string): { prefix: string; stripped: string } | null {
  const prefixes = [
    { full: "kaspa:", name: "kaspa" },
    { full: "kaspatest:", name: "kaspatest" },
    { full: "kaspadev:", name: "kaspadev" },
    { full: "kaspasim:", name: "kaspasim" },
  ];

  for (const { full, name } of prefixes) {
    if (address.startsWith(full)) {
      return { prefix: name, stripped: address.substring(full.length) };
    }
  }
  return null;
}

/**
 * Verify Kaspa address checksum
 */
function verifyKaspaChecksum(checksum5bit: Uint8Array, expectedChecksum: bigint): boolean {
  const checksum8bit = convert5to8(checksum5bit);
  const expectedChecksumBytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    expectedChecksumBytes[7 - i] = Number((expectedChecksum >> BigInt(i * 8)) & 0xffn);
  }
  const expectedChecksum5bytes = expectedChecksumBytes.slice(3);

  if (checksum8bit.length !== expectedChecksum5bytes.length) return false;

  for (let i = 0; i < checksum8bit.length; i++) {
    if (checksum8bit[i] !== expectedChecksum5bytes[i]) return false;
  }
  return true;
}

/**
 * Validate Kaspa payload version and size
 */
function validateKaspaPayload(payload8bit: Uint8Array): boolean {
  const version = payload8bit[0];
  if (version !== 0 && version !== 1 && version !== 8) return false;

  const payloadSize = payload8bit.length - 1;
  if ((version === 0 || version === 8) && payloadSize !== 32) return false;
  if (version === 1 && payloadSize !== 33) return false;

  return true;
}

/**
 * Validates a Kaspa address with proper checksum verification
 * Kaspa uses custom bech32 encoding (not standard bech32 or bech32m) with network-specific prefixes
 * Mainnet: kaspa:, Testnet: kaspatest:, Devnet: kaspadev:, Simnet: kaspasim:
 * Address types: P2PK (v0), P2PK ECDSA (v1), P2SH (v8)
 *
 * Implementation based on: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/bech32.rs
 *
 * Example: kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j
 */
export function validateKaspaAddress(address: string): boolean {
  try {
    if (!address || typeof address !== "string") return false;

    const parsed = extractKaspaNetworkPrefix(address);
    if (!parsed) return false;

    const { prefix: networkPrefix, stripped: strippedAddress } = parsed;

    if (strippedAddress.length < 8) return false;
    if (strippedAddress.length < 59 || strippedAddress.length > 65) return false;

    // Convert from bech32 characters to 5-bit values
    const address5bit = new Uint8Array(strippedAddress.length);
    for (let i = 0; i < strippedAddress.length; i++) {
      const char = strippedAddress.charAt(i);
      const value = KASPA_REV_CHARSET[char];
      if (value === undefined) return false;
      address5bit[i] = value;
    }

    const payload5bit = address5bit.slice(0, -8);
    const checksum5bit = address5bit.slice(-8);

    const expectedChecksum = kaspaChecksum(payload5bit, networkPrefix);
    if (!verifyKaspaChecksum(checksum5bit, expectedChecksum)) return false;

    const payload8bit = convert5to8(payload5bit);
    return validateKaspaPayload(payload8bit);
  } catch {
    return false;
  }
}

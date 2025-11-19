import secp256k1 from "@bitcoinerlab/secp256k1";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import {
  Chain,
  type ChainSigner,
  type DerivationPathArray,
  derivationPathToString,
  FeeOption,
  NetworkDerivationPath,
  SwapKitError,
  updateDerivationPath,
} from "@swapkit/helpers";
import { match, P } from "ts-pattern";
import { getBalance } from "../../utils";
import { getUtxoApi } from "../helpers";
import { validateKaspaAddress } from "./validators";

type KaspaTransaction = unknown; // TODO: Define proper Kaspa transaction type when implementing tx building
type KaspaSigner = ChainSigner<KaspaTransaction, KaspaTransaction>;

/**
 * Kaspa bech32 character set
 * Source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/bech32.rs
 */
const KASPA_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

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
 * Convert 8-bit bytes to 5-bit values for bech32 encoding
 */
function convert8to5(data: Uint8Array): Uint8Array {
  const padding = data.length % 5 === 0 ? 0 : 1;
  const fiveBit = new Uint8Array((data.length * 8) / 5 + padding);
  let currentIdx = 0;
  let buff = 0;
  let bits = 0;

  for (const byte of data) {
    buff = (buff << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      fiveBit[currentIdx++] = (buff >> bits) & 0x1f;
      buff &= (1 << bits) - 1;
    }
  }
  if (bits > 0) {
    fiveBit[currentIdx] = (buff << (5 - bits)) & 0x1f;
  }
  return fiveBit;
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
 * Derives Schnorr public key from secp256k1 private key for Kaspa P2PK addresses
 * Kaspa P2PK addresses use Schnorr signatures with the x-only public key (32 bytes)
 *
 * @param privateKey - 32-byte secp256k1 private key
 * @returns 32-byte x-only public key
 * @throws SwapKitError if key generation fails
 */
function getKaspaSchnorrPublicKey(privateKey: Uint8Array): Uint8Array {
  if (privateKey.length !== 32) {
    throw new SwapKitError("toolbox_kaspa_invalid_key", {
      error: `Invalid private key length: expected 32 bytes, got ${privateKey.length}`,
    });
  }

  const fullPublicKey = secp256k1.pointFromScalar(privateKey, true);

  if (!fullPublicKey || fullPublicKey.length !== 33) {
    throw new SwapKitError("toolbox_kaspa_invalid_key", { error: "Failed to generate public key" });
  }

  // Extract x-only public key (skip the 0x02/0x03 prefix byte, take 32 bytes)
  return fullPublicKey.slice(1, 33);
}

/**
 * Encodes a Kaspa address using custom bech32 encoding
 * Address format: {prefix}:{bech32_encoded_data}
 * For P2PK v0 (Schnorr): version byte 0x00 + x-only public key (32 bytes)
 *
 * Implementation based on: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/bech32.rs
 *
 * @param publicKey - 32-byte x-only public key
 * @param networkPrefix - Network prefix (kaspa, kaspatest, kaspadev, kaspasim)
 * @returns Kaspa address string
 * @throws SwapKitError if encoding fails or validation fails
 */
function encodeKaspaAddress(publicKey: Uint8Array, networkPrefix = "kaspa"): string {
  // Validate public key size
  if (publicKey.length !== 32) {
    throw new SwapKitError("toolbox_kaspa_invalid_key", {
      error: `Invalid public key length: expected 32 bytes, got ${publicKey.length}`,
    });
  }

  try {
    // Kaspa P2PK v0 address: version 0x00 + x-only public key (32 bytes)
    const version = 0x00;
    const payload = new Uint8Array(33);
    payload[0] = version;
    payload.set(publicKey, 1);

    // Convert payload to 5-bit values
    const payload5bit = convert8to5(payload);

    // Calculate checksum (last 5 bytes of the 8-byte polymod result)
    const checksumValue = kaspaChecksum(payload5bit, networkPrefix);
    const checksumBytes = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      checksumBytes[7 - i] = Number((checksumValue >> BigInt(i * 8)) & 0xffn);
    }
    const checksum5bit = convert8to5(checksumBytes.slice(3)); // Last 5 bytes

    // Combine payload and checksum
    const combined5bit = new Uint8Array(payload5bit.length + checksum5bit.length);
    combined5bit.set(payload5bit, 0);
    combined5bit.set(checksum5bit, payload5bit.length);

    // Encode to bech32 charset
    let encoded = "";
    for (const value of combined5bit) {
      encoded += KASPA_CHARSET[value];
    }

    const address = `${networkPrefix}:${encoded}`;

    // Self-validate the generated address
    if (!validateKaspaAddress(address)) {
      throw new SwapKitError("toolbox_kaspa_address_encoding_failed", { error: "Generated address failed validation" });
    }

    return address;
  } catch (error) {
    if (error instanceof SwapKitError) throw error;
    throw new SwapKitError("toolbox_kaspa_address_encoding_failed", { error });
  }
}

function createKaspaSignerFromPhrase({
  phrase,
  derivationPath,
}: {
  phrase: string;
  derivationPath: string;
}): KaspaSigner {
  const seed = mnemonicToSeedSync(phrase);
  const root = HDKey.fromMasterSeed(seed);
  const node = root.derive(derivationPath);

  if (!node.privateKey) {
    throw new SwapKitError("toolbox_utxo_invalid_params", { error: "Could not derive private key" });
  }

  // Generate Schnorr public key for Kaspa
  const schnorrPubKey = getKaspaSchnorrPublicKey(node.privateKey);

  // Encode address with mainnet prefix (already validated in encodeKaspaAddress)
  const address = encodeKaspaAddress(schnorrPubKey, "kaspa");

  return {
    getAddress: () => Promise.resolve(address),

    signTransaction: (_transaction: KaspaTransaction) => {
      // Transaction signing will be implemented in the transaction building phase
      throw new SwapKitError("toolbox_kaspa_not_implemented", {
        error: "Kaspa transaction signing not yet implemented",
      });
    },
  };
}

export async function createKaspaToolbox(
  toolboxParams: { signer?: KaspaSigner } | { phrase?: string; derivationPath?: DerivationPathArray; index?: number },
) {
  const signer = await match(toolboxParams)
    .with({ signer: P.not(P.nullish) }, ({ signer }) => Promise.resolve(signer))
    .with({ phrase: P.string }, ({ phrase, derivationPath, index = 0 }) => {
      const baseDerivationPath = derivationPath || NetworkDerivationPath[Chain.Kaspa] || [44, 111111, 0, 0, 0];
      const updatedPath = updateDerivationPath(baseDerivationPath, { index });
      const pathString = derivationPathToString(updatedPath);

      return createKaspaSignerFromPhrase({ derivationPath: pathString, phrase });
    })
    .otherwise(() => Promise.resolve(undefined));

  function getAddress() {
    return signer?.getAddress();
  }

  function transfer(): Promise<string> {
    throw new SwapKitError("toolbox_kaspa_not_implemented", {
      error: "Kaspa transfer not yet implemented - requires transaction building",
    });
  }

  function createKeysForPath({
    phrase,
    derivationPath = "m/44'/111111'/0'/0/0",
  }: {
    phrase: string;
    derivationPath?: string;
  }) {
    const seed = mnemonicToSeedSync(phrase);
    const root = HDKey.fromMasterSeed(seed);
    const node = root.derive(derivationPath);

    if (!node.privateKey) {
      throw new SwapKitError("toolbox_utxo_invalid_params", { error: "Could not derive private key" });
    }

    // Return object with key information
    return {
      chainCode: node.chainCode,
      privateKey: node.privateKey,
      publicKey: getKaspaSchnorrPublicKey(node.privateKey),
    };
  }

  function getPrivateKeyFromMnemonic({
    phrase,
    derivationPath = "m/44'/111111'/0'/0/0",
  }: {
    phrase: string;
    derivationPath: string;
  }) {
    const keys = createKeysForPath({ derivationPath, phrase });
    // Return hex-encoded private key
    return Buffer.from(keys.privateKey).toString("hex");
  }

  function getAddressFromKeys(keys: { publicKey: Uint8Array }) {
    return encodeKaspaAddress(keys.publicKey, "kaspa");
  }

  // Base toolbox functions using Kaspa API
  const api = getUtxoApi(Chain.Kaspa);

  async function getFeeRates() {
    const suggestedFeeRate = await api.getSuggestedTxFee();

    return {
      [FeeOption.Average]: suggestedFeeRate,
      [FeeOption.Fast]: Math.ceil(suggestedFeeRate * 1.5),
      [FeeOption.Fastest]: Math.ceil(suggestedFeeRate * 2),
    };
  }

  return {
    broadcastTx: (txHash: string) => api.broadcastTx(txHash),
    createKeysForPath,
    getAddress,
    getAddressFromKeys,
    getBalance: getBalance(Chain.Kaspa),
    getFeeRates,
    getPrivateKeyFromMnemonic,
    transfer,
    validateAddress: validateKaspaAddress,
  };
}

import { bech32 } from "@scure/base";
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

type KaspaSigner = ChainSigner<any, any>;

/**
 * Derives Schnorr public key from secp256k1 private key for Kaspa P2PK addresses
 * Kaspa P2PK addresses use Schnorr signatures with the x-only public key
 */
function getKaspaSchnorrPublicKey(privateKey: Uint8Array): Uint8Array {
  // For Schnorr signatures, we use the x-only public key (32 bytes)
  // This is the x-coordinate of the secp256k1 public key point
  const secp256k1 = require("@bitcoinerlab/secp256k1");
  const fullPublicKey = secp256k1.pointFromScalar(privateKey, true);

  if (!fullPublicKey || fullPublicKey.length !== 33) {
    throw new SwapKitError("toolbox_kaspa_invalid_key", { error: "Failed to generate public key" });
  }

  // Extract x-only public key (skip the prefix byte, take 32 bytes)
  return fullPublicKey.slice(1, 33);
}

/**
 * Encodes a Kaspa address using bech32 encoding
 * Address format: {prefix}:{bech32_encoded_data}
 * For P2PK v0 (Schnorr): version byte 0x00 + x-only public key (32 bytes)
 */
function encodeKaspaAddress(publicKey: Uint8Array, networkPrefix = "kaspa"): string {
  try {
    // Kaspa P2PK v0 address: version 0x00 + x-only public key (32 bytes)
    const version = 0x00;
    const payload = new Uint8Array(33);
    payload[0] = version;
    payload.set(publicKey, 1);

    // Convert to 5-bit words for bech32 encoding
    const words = bech32.toWords(payload);

    // Encode using bech32 with 'q' as HRP (Kaspa standard)
    // The 'q' HRP is a placeholder used in Kaspa's bech32 encoding
    const encoded = bech32.encode("q", words, 1023); // max length

    // Remove the HRP and separator ('q1')
    const addressData = encoded.slice(2);

    return `${networkPrefix}:${addressData}`;
  } catch (error) {
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

  // Encode address with mainnet prefix
  const address = encodeKaspaAddress(schnorrPubKey, "kaspa");

  return {
    getAddress: () => Promise.resolve(address),

    signTransaction: (_psbt: any) => {
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

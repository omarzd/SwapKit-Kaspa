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
 * Validates a Kaspa address
 * Kaspa uses bech32 encoding (not bech32m) with network-specific prefixes
 * Mainnet: kaspa:, Testnet: kaspatest:, Devnet: kaspadev:, Simnet: kaspasim:
 * Address types: P2PK (v0), P2PK ECDSA (v1), P2SH (v8)
 * Example: kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j
 */
export function validateKaspaAddress(address: string): boolean {
  try {
    const kaspaPrefix = "kaspa:";
    const testnetPrefix = "kaspatest:";
    const devnetPrefix = "kaspadev:";
    const simnetPrefix = "kaspasim:";

    let strippedAddress = address;
    if (address.startsWith(kaspaPrefix)) {
      strippedAddress = address.substring(kaspaPrefix.length);
    } else if (address.startsWith(testnetPrefix)) {
      strippedAddress = address.substring(testnetPrefix.length);
    } else if (address.startsWith(devnetPrefix)) {
      strippedAddress = address.substring(devnetPrefix.length);
    } else if (address.startsWith(simnetPrefix)) {
      strippedAddress = address.substring(simnetPrefix.length);
    }

    // Kaspa addresses typically range from 59-63 characters after stripping prefix
    // This accounts for different address types (P2PK Schnorr, P2PK ECDSA, P2SH)
    if (strippedAddress.length < 59 || strippedAddress.length > 65) {
      return false;
    }

    const validChars = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;
    if (!validChars.test(strippedAddress)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

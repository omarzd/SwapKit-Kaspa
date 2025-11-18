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

export function validateKaspaAddress(address: string): boolean {
  try {
    const kaspaPrefix = "kaspa:";
    const strippedAddress = address.startsWith(kaspaPrefix)
      ? address.substring(kaspaPrefix.length)
      : address;

    if (strippedAddress.length < 61 || strippedAddress.length > 63) {
      return false;
    }

    const validChars = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;
    return validChars.test(strippedAddress);
  } catch {
    return false;
  }
}

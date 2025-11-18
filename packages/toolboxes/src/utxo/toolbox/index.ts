import { Chain, type DerivationPathArray, SwapKitError, type UTXOChain } from "@swapkit/helpers";
import { createBCHToolbox } from "./bitcoinCash";
import { createKaspaToolbox } from "./kaspa";
import type { UtxoToolboxParams } from "./params";
import { createUTXOToolbox } from "./utxo";
import { createZcashToolbox } from "./zcash";

type BCHToolbox = Awaited<ReturnType<typeof createBCHToolbox>>;
type CommonUTXOToolbox = Awaited<
  ReturnType<
    typeof createUTXOToolbox<Exclude<UTXOChain, typeof Chain.BitcoinCash | typeof Chain.Kaspa | typeof Chain.Zcash>>
  >
>;
type KaspaToolbox = Awaited<ReturnType<typeof createKaspaToolbox>>;
type ZcashToolbox = Awaited<ReturnType<typeof createZcashToolbox>>;

export type UTXOToolboxes = {
  [Chain.BitcoinCash]: BCHToolbox;
  [Chain.Bitcoin]: CommonUTXOToolbox;
  [Chain.Dogecoin]: CommonUTXOToolbox;
  [Chain.Litecoin]: CommonUTXOToolbox;
  [Chain.Dash]: CommonUTXOToolbox;
  [Chain.Kaspa]: KaspaToolbox;
  [Chain.Zcash]: ZcashToolbox;
};

export type UTXOWallets = {
  [key in keyof UTXOToolboxes]: UTXOToolboxes[key];
};

export async function getUtxoToolbox<T extends keyof UTXOToolboxes>(
  chain: T,
  params?: UtxoToolboxParams[T] | { phrase?: string; derivationPath?: DerivationPathArray; index?: number },
): Promise<UTXOToolboxes[T]> {
  switch (chain) {
    case Chain.BitcoinCash: {
      const toolbox = await createBCHToolbox((params as UtxoToolboxParams[typeof Chain.BitcoinCash]) || {});
      return toolbox as UTXOToolboxes[T];
    }

    case Chain.Kaspa: {
      const toolbox = await createKaspaToolbox(params as UtxoToolboxParams[typeof Chain.Kaspa]);
      return toolbox as UTXOToolboxes[T];
    }

    case Chain.Zcash: {
      const toolbox = await createZcashToolbox(params as UtxoToolboxParams[typeof Chain.Zcash]);
      return toolbox as UTXOToolboxes[T];
    }

    case Chain.Bitcoin:
    case Chain.Dogecoin:
    case Chain.Litecoin:
    case Chain.Dash: {
      const toolbox = await createUTXOToolbox({
        chain,
        ...(params as UtxoToolboxParams[Exclude<
          T,
          typeof Chain.BitcoinCash | typeof Chain.Kaspa | typeof Chain.Zcash
        >]),
      });
      return toolbox as UTXOToolboxes[Exclude<T, typeof Chain.BitcoinCash | typeof Chain.Kaspa | typeof Chain.Zcash>];
    }

    default:
      throw new SwapKitError("toolbox_utxo_not_supported", { chain });
  }
}

export { stripToCashAddress } from "./bitcoinCash";
export * from "./params";
export { bchValidateAddress, stripPrefix, validateKaspaAddress, validateZcashAddress } from "./validators";

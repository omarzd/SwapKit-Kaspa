"use client";
import { type AssetValue, FeeOption, type QuoteResponseRoute } from "@swapkit/sdk";
import { useCallback } from "react";

import type { SwapKitClient } from "../swapKitClient";
import { SwapInputs } from "./SwapInputs";

export default function Swap({
  inputAsset,
  outputAsset,
  skClient,
}: {
  inputAsset?: AssetValue;
  outputAsset?: AssetValue;
  skClient?: SwapKitClient;
}) {
  const handleSwap = useCallback(
    async (route: QuoteResponseRoute, isChainFlipBoost = false) => {
      const inputChain = inputAsset?.chain;
      const outputChain = outputAsset?.chain;
      if (!(outputChain && inputChain && skClient)) return;

      const txHash = await skClient.swap({
        route,
        feeOptionKey: FeeOption.Fast,
        ...(isChainFlipBoost ? { maxBoostFeeBps: 10 } : {}),
      });

      window.open(skClient.getExplorerTxUrl({ chain: inputChain, txHash }), "_blank");
    },
    [inputAsset, outputAsset?.chain, skClient],
  );

  return (
    <>
      <h4>Swap</h4>
      <SwapInputs
        handleSwap={handleSwap}
        inputAsset={inputAsset}
        outputAsset={outputAsset}
        skClient={skClient}
      />
    </>
  );
}

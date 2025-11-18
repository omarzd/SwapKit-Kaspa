# SwapKit-Kaspa Integration Project

## Project Overview

This project is an **incomplete attempt** (approximately **10% complete**) to integrate **Kaspa (KAS)** blockchain support into the SwapKit SDK ecosystem. SwapKit is a comprehensive blockchain integration framework used by ThorSwap and Maya Protocol to enable cross-chain swaps and interactions.

## What is SwapKit?

SwapKit is a monorepo containing packages and tooling for:
- Multi-chain wallet integrations (Ledger, Trezor, MetaMask, Phantom, etc.)
- Blockchain toolboxes (EVM, UTXO, Cosmos, Substrate, Solana, Radix)
- Cross-chain swap plugins (THORChain, Maya Protocol, Chainflip)
- Token management and asset handling
- Standardized APIs for blockchain interactions

### Currently Supported Chains

SwapKit currently supports the following chains (see `packages/swapkit/helpers/src/types/chains.ts`):

**EVM Chains:**
- Ethereum (ETH)
- Arbitrum (ARB)
- Avalanche (AVAX)
- Base (BASE)
- Binance Smart Chain (BSC)
- Optimism (OP)
- Polygon (MATIC)

**UTXO Chains:**
- Bitcoin (BTC)
- Bitcoin Cash (BCH)
- Litecoin (LTC)
- Dogecoin (DOGE)
- Dash (DASH)

**Cosmos Chains:**
- Cosmos Hub (GAIA)
- THORChain (THOR)
- Maya Protocol (MAYA)
- Kujira (KUJI)

**Other Chains:**
- Solana (SOL)
- Polkadot (DOT)
- Chainflip (FLIP)
- Radix (XRD)

## About Kaspa

Kaspa is a proof-of-work cryptocurrency that uses a blockDAG (Directed Acyclic Graph) architecture instead of a traditional blockchain. It's based on the GHOSTDAG protocol and is designed for high block rates and fast confirmation times.

**Key Characteristics:**
- **Type:** UTXO-based (similar to Bitcoin)
- **Ticker:** KAS
- **Block Time:** ~1 second
- **Decimal Places:** 8
- **Architecture:** BlockDAG (not linear blockchain)

## Project Goal

The goal was to integrate Kaspa into the SwapKit ecosystem, likely for use with:
- **ThorSwap**: Cross-chain DEX aggregator
- **Maya Protocol**: THORChain fork supporting different asset sets

This would enable users to:
1. Connect Kaspa wallets
2. Perform cross-chain swaps involving KAS
3. Use Kaspa in liquidity pools (if supported by the protocol)

## Current State (~25% Complete)

### What HAS Been Implemented (December 2024 Update)

After merging the latest SwapKit codebase (develop branch) and implementing core functionality:

1. **✅ Chain Definition**: Kaspa added to `Chain` enum as `Kaspa = "KAS"` (`packages/types/src/chains/_enums.ts:23`)
2. **✅ Chain ID**: Kaspa added to `ChainId` enum as `Kaspa = "kaspa"` (`packages/types/src/chains/_enums.ts:83`)
3. **✅ Chain Configuration**: Full Kaspa chain config created in `packages/types/src/chains/utxo.ts:71-82`:
   - Base decimal: 8
   - Block time: 1 second
   - Explorer URL: https://explorer.kaspa.org
   - RPC URLs: https://api.kaspa.org (primary), https://kaspa-rpc.publicnode.com (fallback)
   - Network derivation path: [44, 111111, 0, 0, 0]
   - Native currency: KAS
4. **✅ UTXO Chain Integration**: Kaspa added to `UTXOChains` array and `UTXOChainConfigs`
5. **✅ Address Validation**: Kaspa address validator added (`packages/toolboxes/src/utxo/toolbox/validators.ts:38-54`):
   - Validates bech32m format addresses
   - Supports both prefixed (kaspa:) and non-prefixed addresses
   - Integrated into UTXO address validation flow
6. **✅ Token Definition**: Native KAS token added to token lists (`packages/tokens/src/lists/kaspa.ts`):
   - Identifier: KAS.KAS
   - Decimals: 8
   - Integrated into token loading system
7. **✅ Type Safety**: All type definitions compile without errors

### What's NOT Been Implemented

1. **No Complete Kaspa Toolbox**: While address validation exists, still missing:
   - Address generation from seed phrases
   - Transaction building (Kaspa's UTXO model differs from Bitcoin due to DAG structure)
   - UTXO selection adapted for parallel blocks
   - Transaction signing with Kaspa's signature format
   - Key pair generation
2. **No Wallet Support**: No Kaspa wallet integrations (Kasware, Kaspa desktop wallet, etc.)
3. **No Plugin Integration**: No integration with THORChain or Maya Protocol swap plugins
4. **No API Client**: No Kaspa blockchain API integration for balance queries and UTXO fetching
5. **No Tests**: No unit or integration tests for Kaspa functionality

### What Would Need to Be Done

To complete the Kaspa integration, the following tasks are required:

#### 1. Core Chain Definition
- [x] Add `Kaspa = "KAS"` to `Chain` enum in `packages/types/src/chains/_enums.ts`
- [x] Add `Kaspa` to `ChainId` enum
- [x] Add Kaspa to `BaseDecimal` record (8 decimals)
- [x] Add Kaspa to `BlockTimes` record (1 second)
- [x] Add Kaspa to `UTXOChains` type and array
- [x] Configure `RPC_URLS` and `EXPLORER_URLS` for Kaspa

#### 2. Toolbox Implementation
- [x] Implement Kaspa address validation (bech32m format with optional "kaspa:" prefix)
- [ ] Implement Kaspa address generation from seed phrases
- [ ] Implement transaction building for Kaspa's UTXO model
- [ ] Handle Kaspa's unique DAG structure for UTXO selection
- [ ] Implement balance queries and UTXO management
- [ ] Implement key pair generation and transaction signing

#### 3. Token Support
- [x] Create Kaspa token list with native KAS token
- [x] Add to token loading system (kaspa list)
- [ ] Add support for KRC-20 tokens (if applicable)

#### 4. Wallet Integration
- [ ] Research which wallets support Kaspa (e.g., Kaspa desktop wallet, Kasware, etc.)
- [ ] Create wallet integration packages if applicable
- [ ] Add Kaspa support to existing hardware wallets (Ledger, Trezor) if they support KAS

#### 5. API Integration
- [ ] Identify Kaspa blockchain explorers and APIs
- [ ] Implement API client for balance queries
- [ ] Implement transaction broadcasting
- [ ] Add UTXO fetching functionality

#### 6. Plugin Integration
- [ ] Determine if THORChain or Maya Protocol support Kaspa
- [ ] If supported, add Kaspa to the appropriate plugin's supported chains
- [ ] Implement swap quote logic for KAS pairs
- [ ] Add Kaspa-specific memo format handling

#### 7. Testing
- [ ] Add unit tests for Kaspa toolbox functions
- [ ] Add integration tests for wallet operations
- [ ] Test cross-chain swaps involving Kaspa
- [ ] Create playground examples

#### 8. Documentation
- [ ] Document Kaspa integration in SwapKit docs
- [ ] Provide code examples for developers
- [ ] Update changelog and version packages

## Technical Considerations

### Kaspa's Unique Challenges

1. **BlockDAG vs Blockchain**: Kaspa uses a DAG structure, which may require special handling for:
   - Block confirmations (different from linear chains)
   - UTXO selection algorithms
   - Transaction fee estimation

2. **High Block Rate**: Kaspa produces blocks every ~1 second, which may require:
   - Different confirmation strategies
   - More frequent polling for transaction status
   - Optimized UTXO management

3. **UTXO Compatibility**: While Kaspa is UTXO-based like Bitcoin, there may be differences in:
   - Address formats (Kaspa uses bech32-style addresses)
   - Script types
   - Signature algorithms
   - Transaction structure

4. **Protocol Support**: Need to verify if THORChain or Maya Protocol actually support Kaspa. If not, the integration may be limited to wallet management without cross-chain swap functionality.

## Repository Structure

```
SwapKit-Kaspa/
├── packages/
│   ├── plugins/          # Swap protocol integrations (THORChain, Maya)
│   ├── swapkit/          # Core SDK packages
│   │   ├── api/          # API clients
│   │   ├── core/         # Core SwapKit client
│   │   ├── helpers/      # Chain definitions, utilities
│   │   └── tokens/       # Token list management
│   ├── toolboxes/        # Blockchain-specific implementations
│   │   ├── utxo/         # UTXO chains (BTC, LTC, DOGE, etc.)
│   │   ├── evm/          # EVM chains
│   │   ├── cosmos/       # Cosmos chains
│   │   └── ...
│   └── wallets/          # Wallet integrations
│       ├── ledger/
│       ├── trezor/
│       └── ...
├── playgrounds/          # Testing environments
└── tools/
```

## Getting Started with Development

### Prerequisites

1. Install Bun:
```bash
curl -fsSL https://bun.sh/install | bash
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Install dependencies:
```bash
bun bootstrap
```

### Development Commands

```bash
bun build              # Build all packages
bun test               # Run tests
bun lint               # Lint code
bun type-check         # Type check
```

## Next Steps

If you want to continue this integration:

1. **Research**: Confirm whether THORChain or Maya Protocol have Kaspa support in their roadmap
2. **Start Small**: Begin by adding Kaspa to the Chain enum and creating basic toolbox functions
3. **Test Incrementally**: Use the playground environments to test each piece as you build it
4. **Follow Patterns**: Look at how other UTXO chains (BTC, LTC, DOGE) are implemented and follow similar patterns

## Resources

- **SwapKit Docs**: https://docs.thorswap.finance/swapkit-docs
- **Kaspa Official**: https://kaspa.org
- **Kaspa Docs**: https://github.com/kaspanet/docs
- **THORChain**: https://thorchain.org
- **Maya Protocol**: https://www.mayaprotocol.com

## Project Status

⚠️ **This project is approximately 10% complete and requires significant additional work to become functional.**

The foundation (SwapKit SDK) is robust and production-ready for other chains, but Kaspa-specific implementation has barely begun. This would be a substantial undertaking requiring deep knowledge of:
- Kaspa's UTXO and DAG architecture
- Cross-chain swap protocols
- Wallet integration standards
- TypeScript/JavaScript blockchain development

## License

Apache-2.0 (inherited from SwapKit)

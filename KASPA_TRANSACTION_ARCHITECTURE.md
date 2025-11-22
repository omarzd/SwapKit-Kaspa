# Kaspa Transaction Building Architecture

## Overview

This document outlines the architecture for implementing Kaspa transaction building in the SwapKit toolbox, based on analysis of the Bitcoin implementation and Kaspa-specific requirements.

## Key Components

### 1. Kaspa API Layer (`packages/toolboxes/src/utxo/helpers/kaspaApi.ts`)

**Purpose:** Interface with Kaspa REST API and RPC for UTXO fetching and transaction broadcasting

**Functions:**
```typescript
// Fetch UTXOs for a Kaspa address
async function getKaspaUtxos({
  address: string,
  apiUrl?: string,  // Default: https://api.kaspa.org
}): Promise<KaspaUTXO[]>

// Get current fee estimate (mass-based, not byte-based)
async function getKaspaFeeEstimate({
  apiUrl?: string,
}): Promise<number>  // Returns fee per mass unit

// Broadcast signed transaction
async function broadcastKaspaTransaction({
  signedTxHex: string,
  apiUrl?: string,
}): Promise<string>  // Returns transaction ID

// Get balance for address
async function getKaspaBalance({
  address: string,
  apiUrl?: string,
}): Promise<number>  // Returns balance in sompi (1 KAS = 100000000 sompi)
```

**API Endpoints:**
- GET `/addresses/{address}/utxos` - Fetch UTXOs
- GET `/info/fee-estimate` - Get fee estimates
- POST `/transactions` - Submit transaction
- GET `/addresses/{address}/balance` - Get balance

### 2. Kaspa Transaction Types (`packages/toolboxes/src/utxo/kaspa/types.ts`)

```typescript
// Kaspa UTXO type (different from Bitcoin)
export type KaspaUTXO = {
  transactionId: string;      // Transaction hash
  index: number;              // Output index
  amount: bigint;             // Value in sompi (not number - can be very large)
  scriptPublicKey: string;    // Script public key hex
  blockDaaScore: number;      // DAG ordering score
  isCoinbase: boolean;        // Is coinbase output
};

// Kaspa transaction input
export type KaspaTransactionInput = {
  previousOutpoint: {
    transactionId: string;
    index: number;
  };
  signatureScript: string;    // Empty before signing
  sequence: bigint;           // Usually MAX_SEQUENCE
  sigOpCount: number;        // Number of signature operations
};

// Kaspa transaction output
export type KaspaTransactionOutput = {
  value: bigint;              // Amount in sompi
  scriptPublicKey: {
    version: number;          // 0 for current
    script: string;           // Output script hex
  };
};

// Complete Kaspa transaction
export type KaspaTransaction = {
  version: number;            // Transaction version (currently 0)
  inputs: KaspaTransactionInput[];
  outputs: KaspaTransactionOutput[];
  lockTime: bigint;          // Lock time (usually 0)
  subnetworkId: string;      // Subnetwork ID (usually native)
  gas: bigint;               // Gas limit (usually 0 for standard tx)
  payload: string;           // Extra data (hex, usually empty)
};

// Signing parameters
export type KaspaSigningParams = {
  transaction: KaspaTransaction;
  privateKey: Uint8Array;
  addresses: string[];        // Addresses to sign for
};
```

### 3. Kaspa Transaction Builder (`packages/toolboxes/src/utxo/kaspa/transaction.ts`)

**Purpose:** Build and sign Kaspa transactions using kaspa-wasm library

```typescript
import * as kaspa from 'kaspa-wasm';

// Initialize Kaspa WASM (must be called before using kaspa-wasm)
export async function initKaspaWasm() {
  await kaspa.init();
}

// Create unsigned Kaspa transaction
export async function createKaspaTransaction({
  utxos,
  outputs,
  changeAddress,
  feeRate,
}: {
  utxos: KaspaUTXO[];
  outputs: Array<{ address: string; amount: bigint }>;
  changeAddress: string;
  feeRate: number;
}): Promise<kaspa.Transaction> {

  // 1. Calculate total input value
  const totalInput = utxos.reduce((sum, utxo) => sum + utxo.amount, 0n);

  // 2. Calculate total output value
  const totalOutput = outputs.reduce((sum, out) => sum + out.amount, 0n);

  // 3. Estimate transaction mass (Kaspa uses "mass" instead of "size")
  const estimatedMass = estimateTransactionMass({
    inputCount: utxos.length,
    outputCount: outputs.length + 1,  // +1 for change
  });

  // 4. Calculate fee
  const fee = BigInt(Math.ceil(estimatedMass * feeRate));

  // 5. Calculate change
  const change = totalInput - totalOutput - fee;

  if (change < 0n) {
    throw new SwapKitError("toolbox_kaspa_insufficient_funds", {
      error: `Insufficient funds: need ${totalOutput + fee}, have ${totalInput}`,
    });
  }

  // 6. Build transaction using kaspa-wasm
  const tx = new kaspa.Transaction();
  tx.version = 0;
  tx.lockTime = 0n;

  // Add inputs
  for (const utxo of utxos) {
    tx.addInput(new kaspa.TransactionInput({
      previousOutpoint: new kaspa.TransactionOutpoint({
        transactionId: utxo.transactionId,
        index: utxo.index,
      }),
      signatureScript: '',  // Empty before signing
      sequence: kaspa.MAX_SEQUENCE,
      sigOpCount: 1,
    }));
  }

  // Add outputs
  for (const output of outputs) {
    const scriptPublicKey = addressToScriptPublicKey(output.address);
    tx.addOutput(new kaspa.TransactionOutput({
      value: output.amount,
      scriptPublicKey,
    }));
  }

  // Add change output if significant
  const DUST_THRESHOLD = 1000n;  // 0.00001 KAS
  if (change > DUST_THRESHOLD) {
    const changeScript = addressToScriptPublicKey(changeAddress);
    tx.addOutput(new kaspa.TransactionOutput({
      value: change,
      scriptPublicKey: changeScript,
    }));
  }

  return tx;
}

// Sign Kaspa transaction with private key
export async function signKaspaTransaction({
  transaction,
  privateKey,
  utxos,
}: {
  transaction: kaspa.Transaction;
  privateKey: Uint8Array;
  utxos: KaspaUTXO[];
}): Promise<kaspa.Transaction> {

  // Create signer from private key
  const keyPair = new kaspa.Keypair(privateKey);

  // Sign each input
  for (let i = 0; i < transaction.inputs.length; i++) {
    const input = transaction.inputs[i];
    const utxo = utxos[i];

    // Create signature hash (SigHashAll)
    const sighash = transaction.createInputSignature(
      i,
      utxo.scriptPublicKey,
      utxo.amount,
      kaspa.SigHashType.All,
    );

    // Sign with Schnorr
    const signature = keyPair.signSchnorr(sighash);

    // Create signature script
    const signatureScript = createSignatureScript({
      signature,
      publicKey: keyPair.publicKey,
      sigHashType: kaspa.SigHashType.All,
    });

    // Set signature script on input
    input.signatureScript = signatureScript;
  }

  return transaction;
}

// Estimate transaction mass (Kaspa-specific)
function estimateTransactionMass({
  inputCount,
  outputCount,
}: {
  inputCount: number;
  outputCount: number;
}): number {
  // Based on Kaspa mass calculation
  // Base transaction overhead: 100
  // Per input: 150 (UTXO + signature)
  // Per output: 50

  const baseMass = 100;
  const inputMass = inputCount * 150;
  const outputMass = outputCount * 50;

  return baseMass + inputMass + outputMass;
}

// Convert Kaspa address to scriptPublicKey
function addressToScriptPublicKey(address: string): kaspa.ScriptPublicKey {
  // Remove network prefix (kaspa:, kaspatest:, etc.)
  const strippedAddress = address.split(':')[1] || address;

  // Decode bech32 address
  const decoded = kaspa.Address.decode(address);

  return new kaspa.ScriptPublicKey({
    version: decoded.version,
    script: decoded.payload,
  });
}

// Create signature script from signature and public key
function createSignatureScript({
  signature,
  publicKey,
  sigHashType,
}: {
  signature: Uint8Array;
  publicKey: Uint8Array;
  sigHashType: number;
}): string {
  // Kaspa signature script format:
  // <signature_length> <signature> <sighash_type> <pubkey_length> <pubkey>

  const sigLength = signature.length;
  const pubKeyLength = publicKey.length;

  const script = new Uint8Array(2 + sigLength + 1 + 1 + pubKeyLength);
  let offset = 0;

  // Add signature length (1 byte)
  script[offset++] = sigLength;

  // Add signature
  script.set(signature, offset);
  offset += sigLength;

  // Add sighash type (1 byte)
  script[offset++] = sigHashType;

  // Add public key length (1 byte)
  script[offset++] = pubKeyLength;

  // Add public key
  script.set(publicKey, offset);

  return Buffer.from(script).toString('hex');
}
```

### 4. Integration with UTXO Toolbox (`packages/toolboxes/src/utxo/toolbox/kaspa.ts`)

**Modifications needed:**

```typescript
import * as kaspa from 'kaspa-wasm';
import { initKaspaWasm, createKaspaTransaction, signKaspaTransaction } from '../kaspa/transaction';
import { getKaspaUtxos, broadcastKaspaTransaction, getKaspaFeeEstimate } from '../helpers/kaspaApi';

// Initialize WASM when toolbox is created
let kaspaInitialized = false;

async function ensureKaspaInitialized() {
  if (!kaspaInitialized) {
    await initKaspaWasm();
    kaspaInitialized = true;
  }
}

// Add transfer function to Kaspa toolbox
export async function createKaspaTransfer({
  privateKey,
  fromAddress,
  toAddress,
  amount,
  memo,
}: {
  privateKey: Uint8Array;
  fromAddress: string;
  toAddress: string;
  amount: bigint;  // In sompi
  memo?: string;
}): Promise<string> {

  // 1. Initialize WASM
  await ensureKaspaInitialized();

  // 2. Fetch UTXOs
  const utxos = await getKaspaUtxos({ address: fromAddress });

  if (utxos.length === 0) {
    throw new SwapKitError("toolbox_kaspa_no_utxos", {
      error: "No UTXOs available for this address",
    });
  }

  // 3. Get fee estimate
  const feeRate = await getKaspaFeeEstimate();

  // 4. Create unsigned transaction
  const outputs = [{ address: toAddress, amount }];

  // Add memo as OP_RETURN if provided
  if (memo) {
    outputs.push({
      address: '', // OP_RETURN has no address
      amount: 0n,
      script: createMemoScript(memo),
    });
  }

  const unsignedTx = await createKaspaTransaction({
    utxos,
    outputs,
    changeAddress: fromAddress,
    feeRate,
  });

  // 5. Sign transaction
  const signedTx = await signKaspaTransaction({
    transaction: unsignedTx,
    privateKey,
    utxos,
  });

  // 6. Serialize transaction
  const txHex = signedTx.toHex();

  // 7. Broadcast transaction
  const txId = await broadcastKaspaTransaction({ signedTxHex: txHex });

  return txId;
}

function createMemoScript(memo: string): string {
  // OP_RETURN (0x6a) followed by memo bytes
  const memoBytes = Buffer.from(memo, 'utf8');
  const script = Buffer.concat([
    Buffer.from([0x6a]),  // OP_RETURN
    Buffer.from([memoBytes.length]),  // Data length
    memoBytes,
  ]);
  return script.toString('hex');
}
```

## Implementation Phases

### Phase 1: API Layer (Priority: High)
- Implement `kaspaApi.ts` with REST API integration
- Add error handling and retries
- Test UTXO fetching with real addresses

### Phase 2: Transaction Building (Priority: High)
- Install and configure kaspa-wasm
- Implement transaction creation
- Implement mass estimation
- Test with mock data

### Phase 3: Transaction Signing (Priority: High)
- Implement Schnorr signing
- Create signature scripts
- Test signing with test keys

### Phase 4: Integration (Priority: Medium)
- Update kaspa.ts with transfer function
- Integrate with UTXO toolbox
- Update transfer() to use new Kaspa logic

### Phase 5: Testing (Priority: High)
- Unit tests for each component
- Integration tests with testnet
- Edge case testing (insufficient funds, large transactions, etc.)

## Security Considerations

1. **Private Key Handling:** Never log or expose private keys
2. **Input Validation:** Validate all addresses, amounts, and UTXOs
3. **Fee Estimation:** Ensure adequate fees to prevent stuck transactions
4. **Dust Prevention:** Filter out UTXOs smaller than dust threshold
5. **Change Handling:** Always return change to sender
6. **Memo Sanitization:** Validate memo content and length

## Testing Strategy

### Unit Tests
- Test each function in isolation
- Mock API calls
- Test edge cases (zero amounts, invalid addresses, etc.)

### Integration Tests
- Use Kaspa testnet
- Test full transaction flow
- Verify transactions on testnet explorer

### Performance Tests
- Test with many UTXOs (100+)
- Test large transactions
- Measure transaction building time

## References

- Kaspa API Docs: https://api.kaspa.org/docs
- kaspa-wasm NPM: https://www.npmjs.com/package/kaspa-wasm
- Rusty-Kaspa GitHub: https://github.com/kaspanet/rusty-kaspa
- Bitcoin Implementation: `packages/toolboxes/src/utxo/toolbox/utxo.ts`

## Next Steps

1. Complete kaspa-wasm installation (in progress)
2. Implement kaspaApi.ts
3. Create transaction.ts with basic transaction building
4. Write initial tests
5. Integrate with existing toolbox
6. Test on Kaspa testnet

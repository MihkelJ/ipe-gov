import { bytesToHex, type Hex } from "viem";

// The relayer SDK is browser-only (WASM). We load it lazily so that SSR
// never evaluates the module.
type RelayerSdk = typeof import("@zama-fhe/relayer-sdk/web");
type FhevmInstance = Awaited<ReturnType<RelayerSdk["createInstance"]>>;

let sdkPromise: Promise<RelayerSdk> | null = null;
let instancePromise: Promise<FhevmInstance> | null = null;

function loadSdk(): Promise<RelayerSdk> {
  if (typeof window === "undefined") {
    throw new Error("relayer-sdk can only be used in the browser");
  }
  if (!sdkPromise) sdkPromise = import("@zama-fhe/relayer-sdk/web");
  return sdkPromise;
}

export async function getFhevmInstance(): Promise<FhevmInstance> {
  if (!instancePromise) {
    instancePromise = (async () => {
      const sdk = await loadSdk();
      await sdk.initSDK();
      // relayer-sdk accepts the EIP-1193 provider or an RPC URL; cast to its
      // expected shape without dragging ethers into the web package's deps.
      // `network` is required and accepts either an EIP-1193 provider or an
      // RPC URL. Prefer the injected wallet provider; fall back to a public
      // Sepolia endpoint for read-only flows.
      const injected = (
        window as unknown as { ethereum?: Parameters<typeof sdk.createInstance>[0]["network"] }
      ).ethereum;
      return sdk.createInstance({
        ...sdk.SepoliaConfig,
        network: injected ?? "https://rpc.sepolia.org",
      });
    })();
  }
  return instancePromise;
}

/** Encrypts a ballot value (0 = against, 1 = for, 2 = abstain). */
export async function encryptVote(
  contractAddress: Hex,
  userAddress: Hex,
  support: 0 | 1 | 2,
): Promise<{ handle: Hex; inputProof: Hex }> {
  const inst = await getFhevmInstance();
  const input = inst.createEncryptedInput(contractAddress, userAddress);
  input.add32(support);
  const { handles, inputProof } = await input.encrypt();
  return {
    handle: bytesToHex(handles[0]),
    inputProof: bytesToHex(inputProof),
  };
}

/**
 * Publicly decrypts a list of ciphertext handles via the Zama gateway.
 * The handles must have been marked `makePubliclyDecryptable` on-chain first.
 */
export async function publicDecryptHandles(handles: Hex[]): Promise<bigint[]> {
  const inst = await getFhevmInstance();
  const result = await inst.publicDecrypt(handles);
  return handles.map((h) => {
    const value = result.clearValues[h];
    if (typeof value !== "bigint") {
      throw new Error(`Unexpected decrypt result for ${h}: ${typeof value}`);
    }
    return value;
  });
}

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
      const network = (window as unknown as { ethereum?: unknown }).ethereum;
      return sdk.createInstance({ ...sdk.SepoliaConfig, network });
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

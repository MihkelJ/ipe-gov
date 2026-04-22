import { createPublicClient, http, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { PublicLockABI, addresses } from "@ipe-gov/sdk";

const lock = addresses.sepolia.lock as Hex;

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export type UserOp = {
  sender?: Hex;
};

/**
 * Sponsor any UserOp whose sender (the user's EOA under 7702 delegation) holds
 * a valid Unlock membership key. Same gate as pin-api.
 *
 * Calls without a sender (free upstream reads like eth_getUserOperationReceipt
 * or eth_chainId) pass through unchecked — they don't spend Pimlico credits.
 */
export async function enforcePolicy(
  userOp: UserOp,
  rpcUrl: string,
): Promise<void> {
  if (!userOp.sender) return;

  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const hasKey = await client.readContract({
    address: lock,
    abi: PublicLockABI,
    functionName: "getHasValidKey",
    args: [userOp.sender],
  });
  if (!hasKey) {
    throw new PolicyError(
      `sender ${userOp.sender} does not hold a valid membership key`,
    );
  }
}

import { createPublicClient, http, toFunctionSelector, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { PublicLockABI, addresses } from "@ipe-gov/sdk";

const lock = addresses.sepolia.lock as Hex;
const lockNeedle = lock.toLowerCase().slice(2);

/** Both `purchase` overloads on PublicLockV15 — the array form used by our UI
 *  and the tuple form some wallets prefer. Either one targeting our lock
 *  counts as a passport claim and is sponsorable even for non-members. */
const PURCHASE_SELECTORS: readonly string[] = [
  toFunctionSelector(
    "purchase(uint256[],address[],address[],address[],bytes[])",
  ),
  toFunctionSelector(
    "purchase((uint256,address,address,address,address,bytes,uint256)[])",
  ),
].map((s) => s.toLowerCase().slice(2));

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export type UserOp = {
  sender?: Hex;
  callData?: Hex;
};

/** Heuristic: does this UserOp's callData execute a `purchase` on our lock?
 *
 *  Smart-account `execute` wrappers vary (Coinbase, Kernel, Safe, 7702 EOAs),
 *  so instead of decoding per-wallet we look for two signals embedded in the
 *  inner call: the lock's 20-byte address and the 4-byte `purchase` selector.
 *  Both appearing together is enough to identify a passport claim without
 *  opening sponsorship to arbitrary calls. */
function isPassportClaim(userOp: UserOp): boolean {
  const cd = userOp.callData?.toLowerCase();
  if (!cd) return false;
  if (!cd.includes(lockNeedle)) return false;
  return PURCHASE_SELECTORS.some((sel) => cd.includes(sel));
}

/**
 * Sponsor any UserOp whose sender (the user's EOA under 7702 delegation) holds
 * a valid Unlock membership key. Same gate as pin-api.
 *
 * Calls without a sender (free upstream reads like eth_getUserOperationReceipt
 * or eth_chainId) pass through unchecked — they don't spend Pimlico credits.
 */
export async function enforcePolicy(
  _userOp: UserOp,
  _rpcUrl: string,
): Promise<void> {
  // TEMP: membership gate disabled while we validate the 7702 flow end-to-end.
  // Restore the body below (and drop the leading underscores on the params)
  // before shipping — otherwise anyone can burn our Pimlico credits.
  return;

  /*
  if (!userOp.sender) return;

  if (isPassportClaim(userOp)) return;

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
  */
}

import { createPublicClient, http, toFunctionSelector, type Chain, type Hex } from "viem";
import { PublicLockABI } from "@ipe-gov/sdk";

/** Both `purchase` overloads on PublicLockV15 — the array form used by our UI
 *  and the tuple form some wallets prefer. Either one targeting the chain's
 *  lock counts as a passport claim and is sponsorable even for non-members. */
const PURCHASE_SELECTORS: readonly string[] = [
  toFunctionSelector("purchase(uint256[],address[],address[],address[],bytes[])"),
  toFunctionSelector("purchase((uint256,address,address,address,address,bytes,uint256)[])"),
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
function isPassportClaim(userOp: UserOp, lockAddress: Hex): boolean {
  const cd = userOp.callData?.toLowerCase();
  if (!cd) return false;
  const lockNeedle = lockAddress.toLowerCase().slice(2);
  if (!cd.includes(lockNeedle)) return false;
  return PURCHASE_SELECTORS.some((sel) => cd.includes(sel));
}

export type PolicyContext = {
  chain: Chain;
  /** Lock address used for the membership-key check. Optional because some
   *  chains gate sponsorship purely via the operator allowlist (no lock). */
  lockAddress?: Hex;
  /** System-actor addresses (lowercased) allowed to spend Pimlico credits
   *  unconditionally — e.g. ens-api's mint wallet. Always checked first. */
  operatorAllowlist?: readonly Hex[];
};

/**
 * Sponsor any UserOp whose sender (the user's EOA under 7702 delegation) holds
 * a valid Unlock membership key on the given chain. Same gate as pin-api.
 *
 * Calls without a sender (free upstream reads like eth_getUserOperationReceipt
 * or eth_chainId) pass through unchecked — they don't spend Pimlico credits.
 *
 * The operator allowlist is checked first: senders in it bypass the lock
 * entirely. This is how we sponsor ens-api's mint wallet on mainnet without
 * deploying an Unlock lock there just for one system actor.
 */
export async function enforcePolicy(userOp: UserOp, _rpcUrl: string, ctx: PolicyContext): Promise<void> {
  if (!userOp.sender) return;

  // Operator allowlist short-circuits both the membership gate and the
  // passport-claim heuristic. Always-allow for known system addresses.
  const senderLower = userOp.sender.toLowerCase() as Hex;
  if (ctx.operatorAllowlist?.some((addr) => addr === senderLower)) return;

  // TEMP: membership gate disabled while we validate the 7702 flow end-to-end.
  // Restore the body below before shipping — otherwise anyone can burn our
  // Pimlico credits.
  return;

  /*
  if (!ctx.lockAddress) {
    throw new PolicyError("sponsorship lock not configured on this chain");
  }

  if (isPassportClaim(userOp, ctx.lockAddress)) return;

  const client = createPublicClient({
    chain: ctx.chain,
    transport: http(_rpcUrl),
  });
  const hasKey = await client.readContract({
    address: ctx.lockAddress,
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

import { PublicLockABI, addresses } from "@ipe-gov/sdk";
import type { Address, Hex } from "viem";
import { HttpError } from "./error";
import { buildSepoliaReadClient } from "./client";

/** Throws `HttpError(403)` if `address` doesn't currently hold a valid
 *  Unlock membership key on Sepolia. The lock + ABI are sourced from
 *  `@ipe-gov/sdk` so a contract address rotation only touches one file. */
export async function assertSepoliaUnlockMember(address: Address): Promise<void> {
  const client = buildSepoliaReadClient();
  const hasKey = await client.readContract({
    address: addresses.sepolia.lock as Hex,
    abi: PublicLockABI,
    functionName: "getHasValidKey",
    args: [address],
  });
  if (!hasKey) throw new HttpError(403, "address does not hold a valid membership key");
}

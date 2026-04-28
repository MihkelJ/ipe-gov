import { useMemo } from "react";
import { useAccount } from "wagmi";
import { getAddress } from "viem";

import { trustedIssuers } from "@ipe-gov/sdk";

// Returns true if the connected wallet is in the org allowlist for Sepolia.
// All four "official" schemas (IpeResident, IpeCheckin, IpeRole,
// IpeProjectLaunched) share the same org allowlist per spec — this hook
// covers all of them. IpeSkill tier=1 vs tier=2 will need its own check when
// we get there.
export function useIsAttesterAdmin(): boolean {
  const { address } = useAccount();
  return useMemo(() => {
    if (!address) return false;
    const me = getAddress(address);
    return trustedIssuers.sepolia.org.some((a) => getAddress(a) === me);
  }, [address]);
}

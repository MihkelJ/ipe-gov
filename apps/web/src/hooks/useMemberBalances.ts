import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createPublicClient, erc20Abi, http, type Hex } from 'viem';
import { base } from 'viem/chains';
import { tokens } from '@ipe-gov/sdk';
import type { MemberKey } from '#/hooks/useMembers';

export type MemberBalances = {
  balances: Map<Hex, bigint>;
  isLoading: boolean;
  isError: boolean;
};

const baseClient = createPublicClient({
  chain: base,
  transport: http(base.rpcUrls.default.http[0]),
});

export function useMemberBalances(
  members: readonly MemberKey[]
): MemberBalances {
  const owners = useMemo(
    () => members.map((m) => m.owner.toLowerCase() as Hex),
    [members]
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ipe-balances', owners],
    staleTime: 60_000,
    enabled: owners.length > 0,
    queryFn: () =>
      baseClient.multicall({
        allowFailure: true,
        contracts: owners.map((owner) => ({
          address: tokens.base.ipe.address,
          abi: erc20Abi,
          functionName: 'balanceOf' as const,
          args: [owner] as const,
        })),
      }),
  });

  const balances = useMemo(() => {
    const map = new Map<Hex, bigint>();
    if (!data) return map;
    data.forEach((r, i) => {
      if (r.status === 'success') map.set(owners[i], r.result as bigint);
    });
    return map;
  }, [data, owners]);

  return { balances, isLoading, isError };
}

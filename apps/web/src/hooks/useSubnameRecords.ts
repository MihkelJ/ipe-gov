import { useMutation, useQueryClient } from '@tanstack/react-query'
import { encodeFunctionData, type Hex } from 'viem'
import { mainnet } from 'viem/chains'
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from 'wagmi'
import { PublicResolverABI, addresses } from '@ipe-gov/sdk'

export type TextRecordUpdate = {
  key: string
  value: string
}

/** Updates one or more ENSIP-18 text records on a member's wrapped subname.
 *  Uses PublicResolver's `multicall` so a batch of fields lands in a single
 *  on-chain transaction (member only signs once, pays one gas spike). */
export function useSubnameSetTextRecords(params: { node: Hex }) {
  const { address } = useAccount()
  const { data: walletClient, refetch: refetchWalletClient } = useWalletClient()
  const { mutateAsync: switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: mainnet.id })
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['subname-records', params.node],
    mutationFn: async (updates: TextRecordUpdate[]): Promise<Hex> => {
      if (!address) throw new Error('wallet not connected')
      if (!publicClient) throw new Error('mainnet public client unavailable')
      if (updates.length === 0) throw new Error('no records to update')

      // Wallet must be on mainnet before signing the resolver write — the
      // signature is chain-bound via the EIP-1559 envelope, so a wrong-chain
      // wallet would error or hang.
      let client = walletClient
      if (!client) throw new Error('wallet client unavailable')
      if (client.chain.id !== mainnet.id) {
        await switchChainAsync({ chainId: mainnet.id })
        const { data: fresh } = await refetchWalletClient()
        if (!fresh) throw new Error('failed to obtain wallet client after switch')
        client = fresh
      }

      // Single call optimization: skip multicall if there's only one update
      // (saves ~5k gas). Each branch is its own typed simulate -> write so
      // the function-name + args narrow correctly.
      let hash: Hex
      if (updates.length === 1) {
        const { request } = await publicClient.simulateContract({
          account: client.account.address,
          address: addresses.mainnet.publicResolver,
          abi: PublicResolverABI,
          functionName: 'setText',
          args: [params.node, updates[0].key, updates[0].value],
        })
        hash = await client.writeContract(request)
      } else {
        const calls = updates.map((u) =>
          encodeFunctionData({
            abi: PublicResolverABI,
            functionName: 'setText',
            args: [params.node, u.key, u.value],
          }),
        )
        const { request } = await publicClient.simulateContract({
          account: client.account.address,
          address: addresses.mainnet.publicResolver,
          abi: PublicResolverABI,
          functionName: 'multicall',
          args: [calls],
        })
        hash = await client.writeContract(request)
      }
      await publicClient.waitForTransactionReceipt({ hash })

      const lower = address.toLowerCase()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['identity', lower] }),
        queryClient.invalidateQueries({ queryKey: ['l2-subname-identities'] }),
        queryClient.invalidateQueries({ queryKey: ['subname-identity', lower] }),
        queryClient.invalidateQueries({ queryKey: ['ens-text', params.node] }),
        queryClient.invalidateQueries({ queryKey: ['ens-avatar'] }),
      ])
      return hash
    },
  })
}

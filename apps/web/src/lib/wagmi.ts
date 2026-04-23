import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import {
  baseAccount,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  rabbyWallet,
  safeWallet,
  trustWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { sepolia } from 'wagmi/chains'

const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ??
  '00000000000000000000000000000000'

export const wagmiConfig = getDefaultConfig({
  appName: 'ipe-gov',
  projectId,
  chains: [sepolia],
  ssr: false,
  // Ensure a generic `injectedWallet` tile is available so any EIP-1193
  // provider (Rabby, Brave, in-app wallet browsers, …) can connect even when
  // it is not one of the named defaults. Named wallets stay first so their
  // icons show up when detected via EIP-6963.
  wallets: [
    {
      groupName: 'Popular',
      wallets: [
        rainbowWallet,
        metaMaskWallet,
        baseAccount,
        walletConnectWallet,
      ],
    },
    {
      groupName: 'Other',
      wallets: [
        rabbyWallet,
        trustWallet,
        safeWallet,
        injectedWallet,
      ],
    },
  ],
})

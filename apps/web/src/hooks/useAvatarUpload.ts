import { useMutation } from '@tanstack/react-query'
import { useAccount, useSignMessage } from 'wagmi'
import { buildPinImageMessage, pinImage } from '#/lib/pinApi'

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export type AvatarUploadResult = { cid: string; uri: string }

/** Sign a `pin avatar image` message and upload to pin-api. Returns the
 *  resulting `ipfs://<cid>` URI ready to drop into an ENSIP-18 `avatar`
 *  record. Membership re-checked server-side, so a non-member's wallet
 *  signature can't pin junk through us. */
export function useAvatarUpload() {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  return useMutation({
    mutationKey: ['avatar-upload'],
    mutationFn: async (file: File): Promise<AvatarUploadResult> => {
      if (!address) throw new Error('wallet not connected')
      if (file.size > MAX_BYTES) {
        throw new Error('image must be 2 MiB or smaller')
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        throw new Error('image must be PNG, JPEG, WebP, or GIF')
      }

      const timestampMs = Date.now()
      const message = buildPinImageMessage(address, timestampMs)
      const signature = await signMessageAsync({ message })
      return pinImage({ file, address, signature, message })
    },
  })
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchChannelPairing,
  fetchMobileGatewayKeys,
  issueMobileGatewayKey,
  revokeMobileGatewayKey,
  resolveChannelPairingRequest,
  revokeChannelPairedUser,
} from '../api'
import type { MobileGatewayKeyRecord } from '../types'

export const channelKeys = {
  all:        () => ['channels'] as const,
  pairing:    (channel: string) => [...channelKeys.all(), 'pairing', channel] as const,
  mobileKeys: () => [...channelKeys.all(), 'mobile-keys'] as const,
}

export function useChannelPairingQuery(channel: string) {
  return useQuery({
    queryKey: channelKeys.pairing(channel),
    queryFn: () => fetchChannelPairing(channel),
  })
}

export function useMobileGatewayKeysQuery() {
  return useQuery({
    queryKey: channelKeys.mobileKeys(),
    queryFn: fetchMobileGatewayKeys,
  })
}

export function useIssueMobileKeyMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: issueMobileGatewayKey,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: channelKeys.mobileKeys() }),
  })
}

// Optimistic: removes key from cache immediately, restores on error
export function useRevokeMobileKeyMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: revokeMobileGatewayKey,
    onMutate: async (keyId: string) => {
      await queryClient.cancelQueries({ queryKey: channelKeys.mobileKeys() })
      const previous = queryClient.getQueryData<MobileGatewayKeyRecord[]>(channelKeys.mobileKeys())
      queryClient.setQueryData<MobileGatewayKeyRecord[]>(
        channelKeys.mobileKeys(),
        (old) => old?.filter((k) => k.id !== keyId),
      )
      return { previous }
    },
    onError: (_err, _keyId, ctx) =>
      queryClient.setQueryData(channelKeys.mobileKeys(), ctx?.previous),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: channelKeys.mobileKeys() }),
  })
}

// resolveChannelPairingRequest(channel, requestId, approved: boolean)
export function useResolveChannelPairingMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      channel,
      requestId,
      approved,
    }: {
      channel: string
      requestId: string
      approved: boolean
    }) => resolveChannelPairingRequest(channel, requestId, approved),
    onSuccess: (_data, { channel }) =>
      queryClient.invalidateQueries({ queryKey: channelKeys.pairing(channel) }),
  })
}

// revokeChannelPairedUser(channel, senderId)
export function useRevokeChannelPairedUserMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ channel, senderId }: { channel: string; senderId: string }) =>
      revokeChannelPairedUser(channel, senderId),
    onSuccess: (_data, { channel }) =>
      queryClient.invalidateQueries({ queryKey: channelKeys.pairing(channel) }),
  })
}

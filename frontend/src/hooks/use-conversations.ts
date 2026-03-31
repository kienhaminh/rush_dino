import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useConversationsQuery, useDeleteConversationMutation, sessionKeys } from '../lib/queries/sessions';
import type { Conversation } from '../lib/types';

export function useConversations() {
  const queryClient = useQueryClient();
  const { data: conversationsData } = useConversationsQuery();
  const conversations: Conversation[] = conversationsData ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);

  // Auto-select first conversation when data loads and nothing is selected
  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  const deleteMutation = useDeleteConversationMutation();

  const removeConversation = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id);
      if (activeId === id) {
        setActiveId(null);
      }
    },
    [activeId, deleteMutation],
  );

  const createNew = useCallback(() => {
    setActiveId(null);
  }, []);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: sessionKeys.conversations() });
  }, [queryClient]);

  return {
    conversations,
    activeId,
    setActiveId,
    createNew,
    deleteConversation: removeConversation,
    refresh,
  };
}

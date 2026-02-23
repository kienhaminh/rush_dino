import { useCallback, useEffect, useState } from 'react';

import { deleteConversation, fetchConversations } from '../lib/api';
import type { Conversation } from '../lib/types';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const items = await fetchConversations();
    setConversations(items);
    if (!activeId && items.length > 0) {
      setActiveId(items[0].id);
    }
  }, [activeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const removeConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      await refresh();
      if (activeId === id) {
        setActiveId(null);
      }
    },
    [activeId, refresh],
  );

  const createNew = useCallback(() => {
    setActiveId(null);
  }, []);

  return {
    conversations,
    activeId,
    setActiveId,
    createNew,
    deleteConversation: removeConversation,
    refresh,
  };
}

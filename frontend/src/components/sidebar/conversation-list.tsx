import type { Conversation } from '../../lib/types';
import { ConversationItem } from './conversation-item';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNew,
}: ConversationListProps) {
  return (
    <aside className="w-full rounded-2xl border border-ink/10 bg-white/60 p-3 md:w-80">
      <button className="mb-3 w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white" onClick={onNew} type="button">
        New Chat
      </button>
      <div className="space-y-2">
        {conversations.map((item) => (
          <ConversationItem
            key={item.id}
            conversation={item}
            active={activeId === item.id}
            onClick={() => onSelect(item.id)}
            onDelete={() => onDelete(item.id)}
          />
        ))}
      </div>
    </aside>
  );
}

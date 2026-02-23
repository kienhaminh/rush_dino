import type { Conversation } from '../../lib/types';

interface ConversationItemProps {
  conversation: Conversation;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export function ConversationItem({ conversation, active, onClick, onDelete }: ConversationItemProps) {
  return (
    <button
      className={`w-full rounded-lg px-3 py-2 text-left transition ${active ? 'bg-ink text-white' : 'bg-white/60 text-ink hover:bg-white'}`}
      onClick={onClick}
      type="button"
    >
      <div className="text-sm font-semibold">{conversation.title || 'Untitled'}</div>
      <div className="mt-2 flex items-center justify-between text-xs opacity-70">
        <span>{new Date(conversation.updated_at).toLocaleString()}</span>
        <span className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
          Delete
        </span>
      </div>
    </button>
  );
}

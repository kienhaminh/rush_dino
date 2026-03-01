import { MessageCircle, Trash2 } from "lucide-react";
import type { Conversation } from "../../lib/types";
import { Button } from "@/components/ui/button";

interface ConversationItemProps {
  conversation: Conversation;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export function ConversationItem({
  conversation,
  active,
  onClick,
  onDelete,
}: ConversationItemProps) {
  const date = new Date(conversation.updated_at);
  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  return (
    <button
      className={`group w-full flex flex-col gap-1 rounded-xl px-3 py-3 text-left transition-all ${
        active
          ? "bg-primary/10 text-primary hover:bg-primary/15"
          : "bg-transparent text-muted-foreground hover:bg-muted/50"
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center gap-2 w-full">
        <MessageCircle
          size={14}
          className={
            active ? "text-primary" : "text-muted-foreground opacity-70"
          }
        />
        <span
          className={`text-sm truncate flex-1 ${active ? "font-semibold" : "font-medium"}`}
        >
          {conversation.title || "New Conversation"}
        </span>
      </div>

      <div className="flex items-center justify-between pl-6 text-[11px] opacity-70 w-full">
        <span>
          {dateStr} • {timeStr}
        </span>

        <div
          role="button"
          tabIndex={0}
          className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/10 hover:text-destructive ${active ? "text-primary/70" : "text-muted-foreground"}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              onDelete();
            }
          }}
        >
          <Trash2 size={12} />
        </div>
      </div>
    </button>
  );
}

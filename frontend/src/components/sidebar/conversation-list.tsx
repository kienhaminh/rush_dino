import { MessageSquare, Plus, Trash2 } from "lucide-react";
import type { Conversation } from "../../lib/types";
import { ConversationItem } from "./conversation-item";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

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
    <div className="flex flex-col flex-1 min-h-0 bg-white shadow-sm border rounded-2xl overflow-hidden">
      <div className="p-4 border-b bg-muted/30">
        <Button
          onClick={onNew}
          className="w-full gap-2 rounded-xl"
          variant="default"
        >
          <Plus size={16} /> New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1 px-3 py-3">
        <div className="space-y-1">
          {conversations.length === 0 && (
            <div className="text-center p-4 text-sm text-muted-foreground flex flex-col items-center gap-2">
              <MessageSquare className="h-8 w-8 opacity-20" />
              <p>No conversations yet.</p>
            </div>
          )}
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
      </ScrollArea>
    </div>
  );
}

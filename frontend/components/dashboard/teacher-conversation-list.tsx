"use client";

import { useState } from "react";
import {
  Edit2,
  MessageSquare,
  MessageSquarePlus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TeacherConversationResponse } from "@/lib/api";

interface TeacherConversationListProps {
  conversations: TeacherConversationResponse[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onRenameConversation: (id: string, newTitle: string) => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
  isLoading?: boolean;
}

export function TeacherConversationList({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onRenameConversation,
  onDeleteConversation,
  isLoading = false,
}: TeacherConversationListProps) {
  const [editingConv, setEditingConv] = useState<TeacherConversationResponse | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingConv, setDeletingConv] = useState<TeacherConversationResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStartRename = (conv: TeacherConversationResponse) => {
    setEditingConv(conv);
    setEditTitle(conv.title);
  };

  const handleSaveRename = async () => {
    if (!editingConv || !editTitle.trim()) return;
    try {
      setIsSubmitting(true);
      await onRenameConversation(editingConv.id, editTitle.trim());
      setEditingConv(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingConv) return;
    try {
      setIsSubmitting(true);
      await onDeleteConversation(deletingConv.id);
      setDeletingConv(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col h-full">
        {/* New Chat Button */}
        <div className="p-3 border-b border-border/60">
          <Button
            onClick={onNewConversation}
            disabled={isLoading}
            variant="default"
            size="sm"
            className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-9 font-medium shadow-xs cursor-pointer"
          >
            <MessageSquarePlus className="size-4" />
            <span>New Chat</span>
          </Button>
        </div>

        {/* Conversation Items */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="text-center py-8 px-4 text-xs text-muted-foreground">
              <MessageSquare className="size-6 text-muted-foreground/40 mx-auto mb-2" />
              <p>No chat history yet.</p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                Start a new conversation to ask doubts.
              </p>
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const dateStr = new Date(conv.updated_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              });

              return (
                <div
                  key={conv.id}
                  className={`group relative flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer ${
                    isActive
                      ? "bg-brand-soft text-primary font-medium border border-primary/25"
                      : "text-foreground hover:bg-muted/60 border border-transparent"
                  }`}
                  onClick={() => onSelectConversation(conv.id)}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2 flex-1">
                    <MessageSquare className={`size-3.5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="truncate">
                      <p className="truncate text-xs font-medium">{conv.title}</p>
                      <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                        {dateStr} · {conv.message_count} {conv.message_count === 1 ? "msg" : "msgs"}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div
                    className="flex items-center gap-1 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleStartRename(conv)}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80"
                      title="Rename conversation"
                    >
                      <Edit2 className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingConv(conv)}
                      className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Delete conversation"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Rename Dialog */}
      <Dialog open={!!editingConv} onOpenChange={(open) => !open && setEditingConv(null)}>
        <DialogContent className="sm:max-w-md p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Rename Conversation</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs border rounded-lg bg-background focus:outline-hidden focus:ring-1 focus:ring-primary"
              placeholder="Conversation title"
              maxLength={256}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveRename();
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingConv(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveRename}
              disabled={isSubmitting || !editTitle.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingConv} onOpenChange={(open) => !open && setDeletingConv(null)}>
        <DialogContent className="sm:max-w-md p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-destructive">
              Delete Conversation
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete &ldquo;{deletingConv?.title}&rdquo;? All messages in this conversation will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeletingConv(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isSubmitting}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

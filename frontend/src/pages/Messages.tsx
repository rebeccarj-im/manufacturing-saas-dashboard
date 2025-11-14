import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Message, getMessages, markMessageRead, deleteMessage, createMessage, markAllRead } from "@/services/messages";
import { Trash2, Mail, MailOpen, Archive, Plus, Check } from "lucide-react";

export default function Messages() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "archived">("all");
  
  const [newMessageTitle, setNewMessageTitle] = useState("");
  const [newMessageContent, setNewMessageContent] = useState("");

  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setShowNewDialog(true);
      setSearchParams({});
    }
    loadMessages();
  }, [filter]);

  const loadMessages = async () => {
    setLoading(true);
    try {
      let params: { archived?: boolean; read?: boolean } = {};
      if (filter === "unread") {
        params.read = false;
        params.archived = false;
      } else if (filter === "archived") {
        params.archived = true;
      } else {
        params.archived = false;
      }
      const data = await getMessages(params);
      setMessages(data);
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await markMessageRead(id);
      await loadMessages();
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
      await deleteMessage(id);
      await loadMessages();
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  };

  const handleCreateMessage = async () => {
    if (!newMessageTitle.trim() || !newMessageContent.trim()) {
      alert("Please fill in both title and content");
      return;
    }
    try {
      await createMessage({
        title: newMessageTitle,
        content: newMessageContent,
        priority: "normal",
      });
      setNewMessageTitle("");
      setNewMessageContent("");
      setShowNewDialog(false);
      await loadMessages();
    } catch (error) {
      console.error("Failed to create message:", error);
      alert("Failed to create message");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead();
      await loadMessages();
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const unreadCount = messages.filter((m) => !m.read && !m.archived).length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Messages</h1>
          <p className="text-muted-foreground">Manage your messages and notifications</p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" onClick={handleMarkAllRead}>
              <Check className="h-4 w-4 mr-2" />
              Mark All Read
            </Button>
          )}
          <Button onClick={() => setShowNewDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Message
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          All Messages
        </Button>
        <Button
          variant={filter === "unread" ? "default" : "outline"}
          onClick={() => setFilter("unread")}
        >
          Unread ({unreadCount})
        </Button>
        <Button
          variant={filter === "archived" ? "default" : "outline"}
          onClick={() => setFilter("archived")}
        >
          Archived
        </Button>
      </div>

      {/* Messages List */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading messages...</div>
      ) : messages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No messages found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {messages.map((message) => {
            const isUrgent = message.priority === "urgent";
            const isHigh = message.priority === "high";
            const isLow = message.priority === "low";
            return (
              <Card 
                key={message.id} 
                className={`${
                  !message.read 
                    ? isUrgent 
                      ? "border-red-500/50 bg-red-50/50 dark:bg-red-950/20 border-l-4" 
                      : isHigh
                      ? "border-orange-500/50 bg-orange-50/30 dark:bg-orange-950/10 border-l-2"
                      : "border-primary/50 bg-primary/5"
                    : ""
                }`}
              >
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {message.read ? (
                          <MailOpen className={`h-3.5 w-3.5 flex-shrink-0 ${
                            isUrgent ? "text-red-500" : isHigh ? "text-orange-500" : "text-muted-foreground"
                          }`} />
                        ) : (
                          <Mail className={`h-3.5 w-3.5 flex-shrink-0 ${
                            isUrgent ? "text-red-500" : isHigh ? "text-orange-500" : "text-primary"
                          }`} />
                        )}
                        <CardTitle className={`text-base truncate ${
                          !message.read 
                            ? isUrgent 
                              ? "font-bold text-red-700 dark:text-red-400" 
                              : isHigh
                              ? "font-semibold text-orange-700 dark:text-orange-400"
                              : "font-semibold"
                            : ""
                        }`}>
                          {message.title}
                        </CardTitle>
                        {isUrgent && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-red-500 text-white font-bold flex-shrink-0">
                            URGENT
                          </span>
                        )}
                        {isHigh && message.priority !== "urgent" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500 text-white font-semibold flex-shrink-0">
                            HIGH
                          </span>
                        )}
                        {isLow && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400 flex-shrink-0">
                            LOW
                          </span>
                        )}
                      </div>
                      {message.sender && (
                        <CardDescription className="mt-0.5 text-xs">From: {message.sender}</CardDescription>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {!message.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkRead(message.id)}
                          title="Mark as read"
                          className="h-7 w-7 p-0"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(message.id)}
                        title="Delete"
                        className="h-7 w-7 p-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-3 px-4">
                  <p className="text-sm whitespace-pre-wrap line-clamp-2">{message.content}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDate(message.created_at)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Message Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog} title="New Message">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={newMessageTitle}
              onChange={(e) => setNewMessageTitle(e.target.value)}
              placeholder="Message title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content">Content *</Label>
            <textarea
              id="content"
              value={newMessageContent}
              onChange={(e) => setNewMessageContent(e.target.value)}
              className="flex min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Message content"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateMessage}>Send</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}


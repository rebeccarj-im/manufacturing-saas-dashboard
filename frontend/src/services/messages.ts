// frontend/src/services/messages.ts
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/fetcher";

export interface Message {
  id: number;
  title: string;
  content: string;
  sender?: string;
  recipient_id?: number;
  priority: string;
  read: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageCreate {
  title: string;
  content: string;
  recipient_id?: number;
  priority?: string;
}

export interface MessageUpdate {
  read?: boolean;
  archived?: boolean;
}

/**
 * Get all messages
 */
export async function getMessages(params?: {
  read?: boolean;
  archived?: boolean;
  limit?: number;
}): Promise<Message[]> {
  const query = new URLSearchParams();
  if (params?.read !== undefined) query.append("read", String(params.read));
  if (params?.archived !== undefined) query.append("archived", String(params.archived));
  if (params?.limit !== undefined) query.append("limit", String(params.limit));
  
  const path = query.toString() ? `/api/messages?${query}` : "/api/messages";
  return apiGet<Message[]>(path);
}

/**
 * Get unread message count
 */
export async function getUnreadCount(): Promise<{ count: number }> {
  return apiGet<{ count: number }>("/api/messages/unread-count");
}

/**
 * Get a single message by ID
 */
export async function getMessage(id: number): Promise<Message> {
  return apiGet<Message>(`/api/messages/${id}`);
}

/**
 * Create a new message
 */
export async function createMessage(message: MessageCreate): Promise<Message> {
  return apiPost<Message>("/api/messages", message);
}

/**
 * Update a message
 */
export async function updateMessage(id: number, update: MessageUpdate): Promise<Message> {
  return apiPut<Message>(`/api/messages/${id}`, update);
}

/**
 * Mark a message as read
 */
export async function markMessageRead(id: number): Promise<Message> {
  return apiPost<Message>(`/api/messages/${id}/mark-read`);
}

/**
 * Mark all messages as read
 */
export async function markAllRead(): Promise<{ status: string; message: string }> {
  return apiPost<{ status: string; message: string }>("/api/messages/mark-all-read");
}

/**
 * Delete a message
 */
export async function deleteMessage(id: number): Promise<void> {
  return apiDelete<void>(`/api/messages/${id}`);
}


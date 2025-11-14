// frontend/src/services/meetings.ts
import { apiGet, apiPost, apiPut, apiDelete, withQuery } from "@/lib/fetcher";

export interface Meeting {
  id: number;
  title: string;
  description?: string;
  start_time: string; // ISO datetime string
  end_time: string; // ISO datetime string
  location?: string;
  attendees?: string;
  category?: string; // "meeting" or "personal"
  created_at: string;
  updated_at: string;
}

export interface MeetingCreate {
  title: string;
  description?: string;
  start_time: string; // ISO datetime string
  end_time: string; // ISO datetime string
  location?: string;
  attendees?: string;
  category?: string; // "meeting" or "personal"
}

export interface MeetingUpdate {
  title?: string;
  description?: string;
  start_time?: string; // ISO datetime string
  end_time?: string; // ISO datetime string
  location?: string;
  attendees?: string;
  category?: string; // "meeting" or "personal"
}

export interface MeetingQueryParams {
  start_date?: string; // YYYY-MM-DD or ISO datetime
  end_date?: string; // YYYY-MM-DD or ISO datetime
}

/**
 * Get all meetings, optionally filtered by date range
 */
export async function getMeetings(params?: MeetingQueryParams): Promise<Meeting[]> {
  const queryPath = withQuery("/api/meetings", (params || {}) as Record<string, any>);
  return apiGet<Meeting[]>(queryPath);
}

/**
 * Get a single meeting by ID
 */
export async function getMeeting(id: number): Promise<Meeting> {
  return apiGet<Meeting>(`/api/meetings/${id}`);
}

/**
 * Create a new meeting
 */
export async function createMeeting(meeting: MeetingCreate): Promise<Meeting> {
  return apiPost<Meeting>("/api/meetings", meeting);
}

/**
 * Update an existing meeting
 */
export async function updateMeeting(id: number, meeting: MeetingUpdate): Promise<Meeting> {
  return apiPut<Meeting>(`/api/meetings/${id}`, meeting);
}

/**
 * Delete a meeting
 */
export async function deleteMeeting(id: number): Promise<void> {
  return apiDelete<void>(`/api/meetings/${id}`);
}

/**
 * Get meetings for a specific date range
 */
export async function getMeetingsByDateRange(startDate: Date, endDate: Date): Promise<Meeting[]> {
  const start = startDate.toISOString().split("T")[0]; // YYYY-MM-DD
  const end = endDate.toISOString().split("T")[0]; // YYYY-MM-DD
  return getMeetings({ start_date: start, end_date: end });
}

/**
 * Get meetings for a specific month
 */
export async function getMeetingsByMonth(year: number, month: number): Promise<Meeting[]> {
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return getMeetingsByDateRange(startDate, endDate);
}


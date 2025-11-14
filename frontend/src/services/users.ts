// frontend/src/services/users.ts
import { apiGet, apiPut } from "@/lib/fetcher";

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  avatar_url?: string;
  role?: string;
  department?: string;
  phone?: string;
  timezone?: string;
  created_at: string;
  updated_at: string;
}

export interface UserProfileUpdate {
  name?: string;
  email?: string;
  avatar_url?: string;
  role?: string;
  department?: string;
  phone?: string;
  timezone?: string;
}

export interface UserSettings {
  theme?: string;
  notifications_enabled?: boolean;
  email_notifications?: boolean;
  language?: string;
  date_format?: string;
  time_format?: string;
}

/**
 * Get current user profile
 */
export async function getCurrentUser(): Promise<UserProfile> {
  return apiGet<UserProfile>("/api/users/me");
}

/**
 * Update current user profile
 */
export async function updateUserProfile(update: UserProfileUpdate): Promise<UserProfile> {
  return apiPut<UserProfile>("/api/users/me", update);
}

/**
 * Get user settings
 */
export async function getUserSettings(): Promise<UserSettings> {
  return apiGet<UserSettings>("/api/users/me/settings");
}

/**
 * Update user settings
 */
export async function updateUserSettings(settings: UserSettings): Promise<UserSettings> {
  return apiPut<UserSettings>("/api/users/me/settings", settings);
}


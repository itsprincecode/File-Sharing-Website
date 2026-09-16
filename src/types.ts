/**
 * Shared types for Sendro Application
 */

export type PageId = "home" | "transfer" | "workspace" | "contact" | "login";

export type TransferSubTab = "transfer" | "collect" | "download";

export interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface WorkspaceFolder {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
}

export interface UserSession {
  isLoggedIn: boolean;
  email: string | null;
  displayName: string | null;
  tier: "Free" | "Pro";
  workspaceId?: string;
  workspaceName?: string;
  createdAt?: number;
}

export const DEFAULT_USER_SESSION: UserSession = {
  isLoggedIn: false,
  email: null,
  displayName: null,
  tier: "Free",
};

export interface WorkspaceFileMetadata {
  code: string;
  name: string;
  size: number;
  type: string;
  folderId?: string;
  uploadedAt: number;
  expiresAt: number;
  isFolder?: boolean;
  fileCount?: number;
  isPaused?: boolean; // When true, expiry is frozen and file will not delete automatically
  pausedRemainingMs?: number; // Preserves the exact remaining duration when paused
}

export interface UploadProgress {
  active: boolean;
  fileName: string;
  percent: number;
  speed: string; // e.g. "4.2 MB/s"
  loaded: string; // e.g. "12.4 MB of 25.0 MB"
  statusMessage?: string;
  isFolder?: boolean;
}

/**
 * Personal Workspace Storage Engine for Sendro
 * Persists user accounts, workspace lockers, custom folders, and workspace files
 * directly in Supabase database with local storage caching for maximum speed and resilience.
 */

import {
  UserSession,
  WorkspaceFolder,
  WorkspaceFileMetadata,
  DEFAULT_USER_SESSION,
} from "../types";
import { supabase, hashPassword, toEpochMs } from "./supabase";

const SESSION_KEY = "zapya_user_session";
const USERS_KEY = "zapya_registered_users";
const WORKSPACES_KEY = "zapya_workspaces_data";

export interface RegisteredUser {
  id: string;
  email: string;
  password?: string;
  passwordHash: string;
  displayName: string;
  workspaceId: string;
  workspaceName: string;
  createdAt: number;
}

export interface WorkspaceData {
  id: string;
  name: string;
  ownerEmail: string;
  folders: WorkspaceFolder[];
  files: WorkspaceFileMetadata[];
  storageLimitBytes: number; // 10 GB for Pro accounts
}

/**
 * Load persisted user session from localStorage
 */
export function loadSavedSession(): UserSession {
  // Sync any cached accounts to Supabase database in the background
  try {
    syncCachedMembersToDatabase().catch(() => {});
  } catch {
    // Ignore background sync errors
  }

  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return DEFAULT_USER_SESSION;
    const session = JSON.parse(raw) as UserSession;
    return session && session.isLoggedIn ? session : DEFAULT_USER_SESSION;
  } catch (err) {
    console.warn("Could not load session from localStorage:", err);
    return DEFAULT_USER_SESSION;
  }
}

/**
 * Save user session to localStorage
 */
export function saveSessionToStorage(session: UserSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.warn("Could not save session to localStorage:", err);
  }
}

/**
 * Clear user session from localStorage
 */
export function clearSessionFromStorage(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (err) {
    console.warn("Could not clear session:", err);
  }
}

/**
 * Helper to get all locally cached registered users
 */
function getRegisteredUsers(): RegisteredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Helper to save all registered users locally
 */
function saveRegisteredUsers(users: RegisteredUser[]): void {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (err) {
    console.warn("Could not save users:", err);
  }
}

/**
 * Helper to generate a compliant RFC4122 v4 UUID
 */
export function generateUuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    try {
      return crypto.randomUUID();
    } catch {
      // fallback
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validate UUID format
 */
export function isValidUuid(val?: string | null): boolean {
  if (!val || typeof val !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    val,
  );
}

/**
 * Automatically syncs any locally stored member accounts, lockers, and files into Supabase database.
 * Ensures workspace_members, workspaces, and workspace_files rows are all populated.
 */
export async function syncCachedMembersToDatabase(): Promise<void> {
  const users = getRegisteredUsers();
  const allWorkspaces = getAllWorkspaces();
  if (!users || users.length === 0) return;

  let hasIdUpdates = false;

  for (const u of users) {
    try {
      if (!isValidUuid(u.id)) {
        u.id = generateUuid();
        hasIdUpdates = true;
      }

      // 1. Sync member record to Supabase
      const memberPayload: any = {
        id: u.id,
        workspace_id: u.workspaceId,
        email: u.email,
        display_name: u.displayName || "Member",
        workspace_name: u.workspaceName || "Personal Workspace",
        password: u.password || null,
        password_hash: u.passwordHash,
        updated_at: Date.now(),
      };

      const { error: memberErr } = await supabase
        .from("workspace_members")
        .upsert(memberPayload, { onConflict: "email" });

      if (memberErr) {
        console.warn("Could not sync member to Supabase:", memberErr.message);
      }

      // 2. Sync corresponding workspace record to Supabase
      const ws = allWorkspaces[u.workspaceId];
      const nowIso = new Date().toISOString();
      const wsPayload: any = {
        workspace_id: u.workspaceId,
        name: u.workspaceName || ws?.name || "Personal Workspace",
        owner_email: u.email,
        folders: ws?.folders || [],
        storage_limit_bytes: ws?.storageLimitBytes || 10737418240,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const { error: wsErr } = await supabase
        .from("workspaces")
        .upsert(wsPayload, { onConflict: "workspace_id" });

      if (wsErr) {
        console.warn("Could not sync workspace to Supabase:", wsErr.message);
      }

      // 3. Sync files for this workspace to workspace_files
      if (ws && Array.isArray(ws.files) && ws.files.length > 0) {
        for (const file of ws.files) {
          try {
            const { data: existingFile } = await supabase
              .from("workspace_files")
              .select("id")
              .eq("workspace_id", u.workspaceId)
              .eq("code", file.code)
              .maybeSingle();

            const filePayload: any = {
              id: existingFile?.id || generateUuid(),
              workspace_id: u.workspaceId,
              owner_email: u.email,
              code: file.code,
              name: file.name,
              size: file.size,
              type: file.type,
              folder_id: file.folderId || "all",
              is_folder: !!file.isFolder,
              file_count: file.fileCount || 1,
              is_paused: !!file.isPaused,
              paused_remaining_ms: file.pausedRemainingMs || 0,
              uploaded_at: new Date(
                file.uploadedAt || Date.now(),
              ).toISOString(),
              expires_at: new Date(
                file.expiresAt || Date.now() + 86400000,
              ).toISOString(),
              base64_data: (file as any).base64Data || null,
            };

            await supabase.from("workspace_files").upsert(filePayload);
          } catch (fileErr) {
            console.warn("Could not sync file to Supabase:", fileErr);
          }
        }
      }
    } catch (err) {
      console.warn("Error during background sync of member:", err);
    }
  }

  if (hasIdUpdates) {
    saveRegisteredUsers(users);
  }
}

const SAMPLE_CODES = new Set(["772910", "482019"]);
const SAMPLE_NAMES = new Set([
  "Workspace_Onboarding_Guide.pdf",
  "Brand_Design_Assets.zip",
]);
export const PREDEFINED_FOLDER_IDS = new Set([
  "docs",
  "media",
  "archives",
  "all",
]);
export const PREDEFINED_FOLDER_NAMES = new Set([
  "Documents",
  "Media Assets",
  "Archives & Backups",
  "All Files",
]);

/**
 * Helper to get all workspace data objects from local cache
 */
export function getAllWorkspaces(): Record<string, WorkspaceData> {
  try {
    const raw = localStorage.getItem(WORKSPACES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, WorkspaceData>;
    let hasChanges = false;

    // Purge sample files and any pre-defined default folders from all workspaces
    for (const ws of Object.values(parsed)) {
      if (Array.isArray(ws.files)) {
        const origLen = ws.files.length;
        ws.files = ws.files.filter(
          (f) => !SAMPLE_CODES.has(f.code) && !SAMPLE_NAMES.has(f.name),
        );
        for (const file of ws.files) {
          if (file.folderId && PREDEFINED_FOLDER_IDS.has(file.folderId)) {
            file.folderId = "all";
            hasChanges = true;
          }
        }
        if (ws.files.length !== origLen) {
          hasChanges = true;
        }
      }

      // Remove pre-defined folders so only user-created folders remain
      if (Array.isArray(ws.folders)) {
        const origFolderLen = ws.folders.length;
        ws.folders = ws.folders.filter(
          (f) =>
            !PREDEFINED_FOLDER_IDS.has(f.id) &&
            !PREDEFINED_FOLDER_NAMES.has(f.name),
        );
        if (ws.folders.length !== origFolderLen) {
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      localStorage.setItem(WORKSPACES_KEY, JSON.stringify(parsed));
    }

    return parsed;
  } catch {
    return {};
  }
}

/**
 * Helper to save all workspace data objects locally
 */
export function saveAllWorkspaces(data: Record<string, WorkspaceData>): void {
  try {
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("Could not save workspaces:", err);
  }
}

/**
 * Returns a set of all file codes that belong to personal workspaces
 */
export function getAllWorkspaceFileCodes(): Set<string> {
  const workspaces = getAllWorkspaces();
  const codes = new Set<string>();
  for (const ws of Object.values(workspaces)) {
    if (Array.isArray(ws.files)) {
      for (const f of ws.files) {
        if (f.code) {
          codes.add(f.code);
        }
      }
    }
  }
  return codes;
}

/**
 * Checks if a 6-digit code belongs to a personal workspace file
 */
export function isWorkspaceFileCode(code: string): boolean {
  if (!code) return false;
  const codes = getAllWorkspaceFileCodes();
  return codes.has(code);
}

/**
 * TRUE AUTHENTICATION: Log in an existing member with their email and password.
 * Checks against Supabase database (workspace_members table) with local storage sync.
 * If credentials do not match or user is not found, throws "Invalid ID or password."
 */
export async function loginMember(
  emailInput: string,
  passwordInput: string,
): Promise<{ session: UserSession }> {
  const normalizedEmail = emailInput.trim().toLowerCase();
  if (!normalizedEmail || !passwordInput) {
    throw new Error("Invalid ID or password. Both fields are required.");
  }

  const hash = await hashPassword(passwordInput);

  // 1. Check Supabase workspace_members table
  let supabaseMember: any = null;
  let supabaseError: any = null;

  try {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("*")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (error) {
      supabaseError = error;
    } else {
      supabaseMember = data;
    }
  } catch (err: any) {
    supabaseError = err;
  }

  // If Supabase returned a member record, verify password
  if (supabaseMember) {
    const isPasswordValid =
      supabaseMember.password === passwordInput ||
      supabaseMember.password_hash === hash ||
      supabaseMember.password_hash === passwordInput;

    if (!isPasswordValid) {
      throw new Error(
        "Invalid ID or password. Please verify your credentials.",
      );
    }

    // Ensure plain password column is populated in Supabase if missing
    if (!supabaseMember.password) {
      try {
        await supabase
          .from("workspace_members")
          .update({
            password: passwordInput,
            password_hash: hash,
            updated_at: Date.now(),
          })
          .eq("id", supabaseMember.id);
      } catch (pwErr) {
        console.warn("Could not backfill password in Supabase:", pwErr);
      }
    }

    // Credentials match! Fetch workspace data from Supabase
    await fetchWorkspaceFromSupabase(
      supabaseMember.workspace_id,
      supabaseMember.email,
    );

    const session: UserSession = {
      isLoggedIn: true,
      email: supabaseMember.email,
      displayName: supabaseMember.display_name,
      tier: "Pro",
      workspaceId: supabaseMember.workspace_id,
      workspaceName: supabaseMember.workspace_name,
      createdAt: supabaseMember.created_at,
    };

    saveSessionToStorage(session);

    // Also sync to local registered users cache
    const localUsers = getRegisteredUsers();
    const existingIdx = localUsers.findIndex(
      (u) => u.email === normalizedEmail,
    );
    const updatedUser: RegisteredUser = {
      id: supabaseMember.id,
      email: supabaseMember.email,
      password: passwordInput,
      passwordHash: supabaseMember.password_hash || hash,
      displayName: supabaseMember.display_name,
      workspaceId: supabaseMember.workspace_id,
      workspaceName: supabaseMember.workspace_name,
      createdAt: supabaseMember.created_at,
    };
    if (existingIdx >= 0) {
      localUsers[existingIdx] = updatedUser;
    } else {
      localUsers.push(updatedUser);
    }
    saveRegisteredUsers(localUsers);

    return { session };
  }

  // 2. If not found in Supabase (or if table doesn't exist yet), check local cache
  const localUsers = getRegisteredUsers();
  const localUser = localUsers.find((u) => u.email === normalizedEmail);

  if (localUser) {
    // Validate password (support both plain text and hashed)
    const isPasswordValid =
      localUser.password === passwordInput ||
      localUser.passwordHash === hash ||
      (localUser as any).password === passwordInput;

    if (!isPasswordValid) {
      throw new Error(
        "Invalid ID or password. Please verify your credentials.",
      );
    }

    // Auto-migrate local member to Supabase with BOTH email, password, and password_hash
    try {
      const validUserId = isValidUuid(localUser.id)
        ? localUser.id
        : generateUuid();
      localUser.id = validUserId;
      saveRegisteredUsers(localUsers);

      const memberPayload: any = {
        id: validUserId,
        email: localUser.email,
        password: passwordInput,
        password_hash: hash,
        display_name: localUser.displayName,
        workspace_id: localUser.workspaceId,
        workspace_name: localUser.workspaceName,
        updated_at: Date.now(),
      };
      const { error: upsertErr } = await supabase
        .from("workspace_members")
        .upsert(memberPayload, { onConflict: "email" });

      if (upsertErr && upsertErr.message?.includes("password")) {
        delete memberPayload.password;
        await supabase
          .from("workspace_members")
          .upsert(memberPayload, { onConflict: "email" });
      }

      // Ensure their workspace exists in Supabase
      const allWs = getAllWorkspaces();
      const ws = allWs[localUser.workspaceId];
      const nowIso = new Date().toISOString();
      await supabase.from("workspaces").upsert(
        {
          workspace_id: localUser.workspaceId,
          name: localUser.workspaceName || "Personal Workspace",
          owner_email: localUser.email,
          folders: ws?.folders || [],
          storage_limit_bytes: ws?.storageLimitBytes || 10737418240,
          created_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "workspace_id" },
      );
    } catch (migrationErr) {
      console.warn("Could not sync local user to Supabase:", migrationErr);
    }

    const session: UserSession = {
      isLoggedIn: true,
      email: localUser.email,
      displayName: localUser.displayName,
      tier: "Pro",
      workspaceId: localUser.workspaceId,
      workspaceName: localUser.workspaceName,
      createdAt: localUser.createdAt,
    };

    saveSessionToStorage(session);
    return { session };
  }

  // User does not exist at all -> strict invalid credentials
  throw new Error(
    "Invalid ID or password. Please check your credentials or create a new personal workspace.",
  );
}

/**
 * MEMBER REGISTRATION: Register a new member and provision their personal workspace.
 * Stores member credentials and workspace locker directly in Supabase database.
 */
export async function registerMember(
  emailInput: string,
  passwordInput: string,
  displayNameInput?: string,
  customWorkspaceName?: string,
): Promise<{ session: UserSession }> {
  const normalizedEmail = emailInput.trim().toLowerCase();
  if (!normalizedEmail || !passwordInput) {
    throw new Error("Please provide both email and password.");
  }

  if (passwordInput.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  // Check if member already exists in Supabase
  try {
    const { data: existingSupabase } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingSupabase) {
      throw new Error(
        "An account with this email already exists. Please sign in.",
      );
    }
  } catch (err: any) {
    // If it's the "already exists" error we just threw, rethrow it
    if (err.message && err.message.includes("already exists")) {
      throw err;
    }
    // If table doesn't exist, we will proceed with creating locally & attempting insert
  }

  // Check if member already exists locally
  const localUsers = getRegisteredUsers();
  if (localUsers.some((u) => u.email === normalizedEmail)) {
    throw new Error(
      "An account with this email already exists. Please sign in.",
    );
  }

  const hash = await hashPassword(passwordInput);
  const now = Date.now();
  const userId = generateUuid();
  const workspaceId = `ws_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const finalName =
    displayNameInput?.trim() || normalizedEmail.split("@")[0] || "Member";
  const finalWsName = customWorkspaceName?.trim() || `${finalName}'s Workspace`;

  // Start with clean slate: NO pre-defined folders. Users create custom folders as needed.
  const defaultFolders: WorkspaceFolder[] = [];

  // 1. Insert into Supabase workspace_members (stores email, plain password & hash in database)
  const memberRecord: any = {
    id: userId,
    email: normalizedEmail,
    password: passwordInput,
    password_hash: hash,
    display_name: finalName,
    workspace_id: workspaceId,
    workspace_name: finalWsName,
    updated_at: now,
  };

  try {
    const { error: insertMemberErr } = await supabase
      .from("workspace_members")
      .upsert(memberRecord, { onConflict: "email" });

    if (insertMemberErr) {
      console.warn("Supabase member insert warning:", insertMemberErr.message);
      // Fallback in case table schema in Supabase has not yet run the 'add column password' statement
      if (insertMemberErr.message?.includes("password")) {
        delete memberRecord.password;
        await supabase
          .from("workspace_members")
          .upsert(memberRecord, { onConflict: "email" });
      }
    }
  } catch (err) {
    console.warn(
      "Could not insert member into Supabase (will use local fallback):",
      err,
    );
  }

  // 2. Insert into Supabase workspaces table
  const nowIso = new Date().toISOString();
  try {
    const { error: insertWsErr } = await supabase.from("workspaces").upsert(
      {
        workspace_id: workspaceId,
        name: finalWsName,
        owner_email: normalizedEmail,
        folders: defaultFolders,
        storage_limit_bytes: 10 * 1024 * 1024 * 1024,
        created_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "workspace_id" },
    );
    if (insertWsErr) {
      console.warn("Supabase workspace insert warning:", insertWsErr.message);
    }
  } catch (err) {
    console.warn("Could not insert workspace into Supabase:", err);
  }

  // 3. Save to local storage cache for 0ms loads
  const newMember: RegisteredUser = {
    id: userId,
    email: normalizedEmail,
    password: passwordInput,
    passwordHash: hash,
    displayName: finalName,
    workspaceId,
    workspaceName: finalWsName,
    createdAt: now,
  };
  localUsers.push(newMember);
  saveRegisteredUsers(localUsers);

  const allWorkspaces = getAllWorkspaces();
  allWorkspaces[workspaceId] = {
    id: workspaceId,
    name: finalWsName,
    ownerEmail: normalizedEmail,
    folders: defaultFolders,
    files: [],
    storageLimitBytes: 10 * 1024 * 1024 * 1024,
  };
  saveAllWorkspaces(allWorkspaces);

  const session: UserSession = {
    isLoggedIn: true,
    email: normalizedEmail,
    displayName: finalName,
    tier: "Pro",
    workspaceId,
    workspaceName: finalWsName,
    createdAt: now,
  };

  saveSessionToStorage(session);
  return { session };
}

/**
 * Legacy compatibility adapter
 */
export async function authenticateOrCreateUser(
  email: string,
  password?: string,
  displayName?: string,
  customWorkspaceName?: string,
): Promise<{ session: UserSession; isNewUser: boolean }> {
  try {
    const { session } = await loginMember(email, password || "123456");
    return { session, isNewUser: false };
  } catch {
    const { session } = await registerMember(
      email,
      password || "123456",
      displayName,
      customWorkspaceName,
    );
    return { session, isNewUser: true };
  }
}

/**
 * Initialize new workspace with folders
 */
export function initWorkspace(
  workspaceId: string,
  workspaceName: string,
  ownerEmail: string,
): WorkspaceData {
  const allWorkspaces = getAllWorkspaces();
  if (allWorkspaces[workspaceId]) {
    return allWorkspaces[workspaceId];
  }

  // Start with empty folders (no pre-defined folders)
  const defaultFolders: WorkspaceFolder[] = [];

  const newWorkspace: WorkspaceData = {
    id: workspaceId,
    name: workspaceName,
    ownerEmail,
    folders: defaultFolders,
    files: [],
    storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10 GB
  };

  allWorkspaces[workspaceId] = newWorkspace;
  saveAllWorkspaces(allWorkspaces);
  return newWorkspace;
}

/**
 * Get workspace data from local cache
 */
export function getWorkspaceData(workspaceId: string): WorkspaceData | null {
  const allWorkspaces = getAllWorkspaces();
  return allWorkspaces[workspaceId] || null;
}

/**
 * Fetch member workspace data directly from Supabase database
 * and synchronize with local cache.
 */
export async function fetchWorkspaceFromSupabase(
  workspaceId: string,
  ownerEmail?: string,
): Promise<WorkspaceData | null> {
  if (!workspaceId) return null;

  let workspaceRecord: any = null;
  let workspaceFiles: any[] = [];

  try {
    // 1. Fetch workspace row (support id or workspace_id column)
    let wsData: any = null;
    let wsRes = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .maybeSingle();

    if (
      wsRes.error &&
      (wsRes.error.code === "42703" || wsRes.error.code === "PGRST204")
    ) {
      wsRes = await supabase
        .from("workspaces")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
    }

    if (!wsRes.error && wsRes.data) {
      workspaceRecord = wsRes.data;
    }

    // 2. Fetch workspace files (support created_at, uploaded_at or client-side sorting)
    let filesRes = await supabase
      .from("workspace_files")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (
      filesRes.error &&
      (filesRes.error.code === "42703" || filesRes.error.code === "PGRST204")
    ) {
      filesRes = await supabase
        .from("workspace_files")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("uploaded_at", { ascending: false });
    }

    if (
      filesRes.error &&
      (filesRes.error.code === "42703" || filesRes.error.code === "PGRST204")
    ) {
      filesRes = await supabase
        .from("workspace_files")
        .select("*")
        .eq("workspace_id", workspaceId);
    }

    if (!filesRes.error && filesRes.data) {
      workspaceFiles = filesRes.data;
    }
  } catch (err) {
    console.warn("Supabase workspace query warning:", err);
  }

  // Sync to local cache
  const allWorkspaces = getAllWorkspaces();
  let existingWs = allWorkspaces[workspaceId];

  if (workspaceRecord) {
    const cleanFolders = (
      Array.isArray(workspaceRecord.folders) ? workspaceRecord.folders : []
    ).filter(
      (f: any) =>
        !PREDEFINED_FOLDER_IDS.has(f?.id) &&
        !PREDEFINED_FOLDER_NAMES.has(f?.name),
    );

    const formattedFiles: WorkspaceFileMetadata[] = workspaceFiles.map(
      (row) => {
        let fId = row.folder_id || "all";
        if (PREDEFINED_FOLDER_IDS.has(fId)) {
          fId = "all";
        }
        return {
          code: row.code,
          name: row.name,
          size: row.size,
          type: row.type,
          folderId: fId,
          uploadedAt: toEpochMs(row.created_at || row.uploaded_at),
          expiresAt: toEpochMs(row.expires_at),
          isFolder: !!row.is_folder,
          fileCount: row.file_count || 1,
          isPaused: !!row.is_paused,
          pausedRemainingMs: row.paused_remaining_ms,
        };
      },
    );

    // Ensure sorted newest first
    formattedFiles.sort((a, b) => b.uploadedAt - a.uploadedAt);

    const synced: WorkspaceData = {
      id: workspaceRecord.id || workspaceRecord.workspace_id || workspaceId,
      name: workspaceRecord.name,
      ownerEmail: workspaceRecord.owner_email || ownerEmail || "",
      folders: cleanFolders,
      files: formattedFiles,
      storageLimitBytes:
        workspaceRecord.storage_limit_bytes ||
        workspaceRecord.limit_bytes ||
        10 * 1024 * 1024 * 1024,
    };

    allWorkspaces[workspaceId] = synced;
    saveAllWorkspaces(allWorkspaces);
    return synced;
  }

  return existingWs || null;
}

/**
 * Save workspace file to Supabase database workspace_files table
 */
export async function saveWorkspaceFileToSupabase(
  workspaceId: string,
  ownerEmail: string,
  fileMeta: WorkspaceFileMetadata,
  base64Data?: string,
): Promise<void> {
  // 1. Add to local cache immediately
  addFileToWorkspace(workspaceId, fileMeta);

  // 2. Save to Supabase workspace_files table
  try {
    const uploadedAtIso = new Date(fileMeta.uploadedAt).toISOString();
    const expiresAtIso = new Date(fileMeta.expiresAt).toISOString();

    const { data: existing } = await supabase
      .from("workspace_files")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("code", fileMeta.code)
      .maybeSingle();

    const filePayload: any = {
      id: existing?.id || generateUuid(),
      workspace_id: workspaceId,
      owner_email: ownerEmail,
      code: fileMeta.code,
      name: fileMeta.name,
      size: fileMeta.size,
      type: fileMeta.type,
      folder_id: fileMeta.folderId || "all",
      is_folder: !!fileMeta.isFolder,
      file_count: fileMeta.fileCount || 1,
      is_paused: !!fileMeta.isPaused,
      paused_remaining_ms: fileMeta.pausedRemainingMs || 0,
      uploaded_at: uploadedAtIso,
      expires_at: expiresAtIso,
      base64_data: base64Data || null,
    };

    const { error } = await supabase
      .from("workspace_files")
      .upsert(filePayload);
    if (error) {
      console.warn(
        "Could not upsert file into Supabase workspace_files:",
        error.message,
      );
    }
  } catch (err) {
    console.warn("Could not upsert file into Supabase workspace_files:", err);
  }
}

/**
 * Delete workspace file from Supabase and local cache
 */
export async function deleteWorkspaceFileFromSupabase(
  workspaceId: string,
  code: string,
): Promise<void> {
  // 1. Remove from local cache
  removeFileFromWorkspace(workspaceId, code);

  // 2. Remove from Supabase workspace_files
  try {
    await supabase
      .from("workspace_files")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("code", code);
  } catch (err) {
    console.warn("Could not delete file from Supabase workspace_files:", err);
  }
}

/**
 * Update workspace name in Supabase and local cache
 */
export async function updateWorkspaceNameInSupabase(
  workspaceId: string,
  newName: string,
): Promise<void> {
  updateWorkspaceName(workspaceId, newName);

  try {
    const nowIso = new Date().toISOString();
    await supabase
      .from("workspaces")
      .update({ name: newName, updated_at: nowIso })
      .eq("workspace_id", workspaceId);

    await supabase
      .from("workspace_members")
      .update({ workspace_name: newName, updated_at: Date.now() })
      .eq("workspace_id", workspaceId);
  } catch (err) {
    console.warn("Could not update workspace name in Supabase:", err);
  }
}

/**
 * Update workspace folders in Supabase and local cache
 */
export async function addFolderToWorkspaceInSupabase(
  workspaceId: string,
  folderName: string,
): Promise<WorkspaceFolder | null> {
  const newFolder = addFolderToWorkspace(workspaceId, folderName);
  if (!newFolder) return null;

  const ws = getWorkspaceData(workspaceId);
  if (ws && ws.folders) {
    try {
      const nowIso = new Date().toISOString();
      await supabase
        .from("workspaces")
        .update({ folders: ws.folders, updated_at: nowIso })
        .eq("workspace_id", workspaceId);
    } catch (err) {
      console.warn("Could not sync folders to Supabase:", err);
    }
  }

  return newFolder;
}

/**
 * Update workspace file pause state in Supabase and local cache
 */
export async function toggleFileExpiryPauseInSupabase(
  workspaceId: string,
  code: string,
): Promise<{
  isPaused: boolean;
  expiresAt: number;
  pausedRemainingMs?: number;
} | null> {
  const result = toggleFileExpiryPause(workspaceId, code);
  if (!result) return null;

  try {
    const expiresAtIso = new Date(result.expiresAt).toISOString();
    let { error } = await supabase
      .from("workspace_files")
      .update({
        is_paused: result.isPaused,
        expires_at: expiresAtIso,
        paused_remaining_ms: result.pausedRemainingMs || null,
      })
      .eq("workspace_id", workspaceId)
      .eq("code", code);

    if (
      error &&
      (error.code === "22P02" ||
        error.message?.includes("bigint") ||
        error.message?.includes("integer"))
    ) {
      await supabase
        .from("workspace_files")
        .update({
          is_paused: result.isPaused,
          expires_at: result.expiresAt,
          paused_remaining_ms: result.pausedRemainingMs || null,
        })
        .eq("workspace_id", workspaceId)
        .eq("code", code);
    }
  } catch (err) {
    console.warn("Could not update file pause in Supabase:", err);
  }

  return result;
}

/**
 * Toggle all files pause in Supabase and local cache
 */
export async function toggleAllFilesExpiryPauseInSupabase(
  workspaceId: string,
  shouldPause: boolean,
): Promise<WorkspaceFileMetadata[]> {
  const updatedFiles = toggleAllFilesExpiryPause(workspaceId, shouldPause);

  try {
    for (const f of updatedFiles) {
      const expiresAtIso = new Date(f.expiresAt).toISOString();
      let { error } = await supabase
        .from("workspace_files")
        .update({
          is_paused: f.isPaused,
          expires_at: expiresAtIso,
          paused_remaining_ms: f.pausedRemainingMs || null,
        })
        .eq("workspace_id", workspaceId)
        .eq("code", f.code);

      if (
        error &&
        (error.code === "22P02" ||
          error.message?.includes("bigint") ||
          error.message?.includes("integer"))
      ) {
        await supabase
          .from("workspace_files")
          .update({
            is_paused: f.isPaused,
            expires_at: f.expiresAt,
            paused_remaining_ms: f.pausedRemainingMs || null,
          })
          .eq("workspace_id", workspaceId)
          .eq("code", f.code);
      }
    }
  } catch (err) {
    console.warn("Could not update all files pause in Supabase:", err);
  }

  return updatedFiles;
}

/**
 * Update workspace name
 */
export function updateWorkspaceName(
  workspaceId: string,
  newName: string,
): void {
  const allWorkspaces = getAllWorkspaces();
  if (allWorkspaces[workspaceId]) {
    allWorkspaces[workspaceId].name = newName;
    saveAllWorkspaces(allWorkspaces);

    // Update in session if matching
    const session = loadSavedSession();
    if (session && session.workspaceId === workspaceId) {
      session.workspaceName = newName;
      saveSessionToStorage(session);
    }
  }
}

/**
 * Add custom folder to workspace
 */
export function addFolderToWorkspace(
  workspaceId: string,
  folderName: string,
): WorkspaceFolder | null {
  const allWorkspaces = getAllWorkspaces();
  const ws = allWorkspaces[workspaceId];
  if (!ws) return null;

  const newFolder: WorkspaceFolder = {
    id: `fld_${Date.now()}`,
    name: folderName.trim(),
    color: "cyan",
    createdAt: Date.now(),
  };

  ws.folders.push(newFolder);
  saveAllWorkspaces(allWorkspaces);
  return newFolder;
}

/**
 * Delete custom folder from workspace (moves files inside to 'all')
 */
export function deleteFolderFromWorkspace(
  workspaceId: string,
  folderId: string,
): void {
  const allWorkspaces = getAllWorkspaces();
  const ws = allWorkspaces[workspaceId];
  if (!ws) return;

  ws.folders = (ws.folders || []).filter((f) => f.id !== folderId);
  if (Array.isArray(ws.files)) {
    for (const f of ws.files) {
      if (f.folderId === folderId) {
        f.folderId = "all";
      }
    }
  }
  allWorkspaces[workspaceId] = ws;
  saveAllWorkspaces(allWorkspaces);
}

/**
 * Delete custom folder from workspace in Supabase and local cache
 */
export async function deleteFolderFromWorkspaceInSupabase(
  workspaceId: string,
  folderId: string,
): Promise<void> {
  deleteFolderFromWorkspace(workspaceId, folderId);
  const ws = getWorkspaceData(workspaceId);
  if (ws) {
    try {
      const nowIso = new Date().toISOString();
      await supabase
        .from("workspaces")
        .update({ folders: ws.folders, updated_at: nowIso })
        .eq("workspace_id", workspaceId);

      await supabase
        .from("workspace_files")
        .update({ folder_id: "all" })
        .eq("workspace_id", workspaceId)
        .eq("folder_id", folderId);
    } catch (err) {
      console.warn("Could not sync deleted folder to Supabase:", err);
    }
  }
}

/**
 * Add an uploaded file to the workspace
 */
export function addFileToWorkspace(
  workspaceId: string,
  fileMeta: WorkspaceFileMetadata,
): void {
  const allWorkspaces = getAllWorkspaces();
  let ws = allWorkspaces[workspaceId];
  if (!ws) {
    ws = initWorkspace(workspaceId, "Personal Workspace", "user");
  }

  // Check if file code already exists
  const existingIndex = ws.files.findIndex((f) => f.code === fileMeta.code);
  if (existingIndex >= 0) {
    ws.files[existingIndex] = fileMeta;
  } else {
    ws.files.unshift(fileMeta);
  }

  allWorkspaces[workspaceId] = ws;
  saveAllWorkspaces(allWorkspaces);
}

/**
 * Remove file from workspace
 */
export function removeFileFromWorkspace(
  workspaceId: string,
  code: string,
): void {
  const allWorkspaces = getAllWorkspaces();
  const ws = allWorkspaces[workspaceId];
  if (!ws) return;

  ws.files = ws.files.filter((f) => f.code !== code);
  allWorkspaces[workspaceId] = ws;
  saveAllWorkspaces(allWorkspaces);
}

const FAR_FUTURE_EXPIRES_AT = 253402300799000; // Year 9999 timestamp so paused files never expire

/**
 * Toggle pause on an individual workspace file's expiry period.
 */
export function toggleFileExpiryPause(
  workspaceId: string,
  code: string,
): { isPaused: boolean; expiresAt: number; pausedRemainingMs?: number } | null {
  const allWorkspaces = getAllWorkspaces();
  const ws = allWorkspaces[workspaceId];
  if (!ws) return null;

  const file = ws.files.find((f) => f.code === code);
  if (!file) return null;

  const now = Date.now();
  if (file.isPaused) {
    // Unpause / resume expiry countdown
    const remaining =
      file.pausedRemainingMs && file.pausedRemainingMs > 0
        ? file.pausedRemainingMs
        : 7 * 24 * 60 * 60 * 1000;

    file.isPaused = false;
    file.expiresAt = now + remaining;
    file.pausedRemainingMs = undefined;
  } else {
    // Pause expiry period - stops countdown & prevents auto-deletion
    const remaining = Math.max(0, file.expiresAt - now);
    file.isPaused = true;
    file.pausedRemainingMs =
      remaining > 0 ? remaining : 7 * 24 * 60 * 60 * 1000;
    file.expiresAt = FAR_FUTURE_EXPIRES_AT;
  }

  allWorkspaces[workspaceId] = ws;
  saveAllWorkspaces(allWorkspaces);
  return {
    isPaused: !!file.isPaused,
    expiresAt: file.expiresAt,
    pausedRemainingMs: file.pausedRemainingMs,
  };
}

/**
 * Toggle pause on ALL workspace files at once.
 */
export function toggleAllFilesExpiryPause(
  workspaceId: string,
  shouldPause: boolean,
): WorkspaceFileMetadata[] {
  const allWorkspaces = getAllWorkspaces();
  const ws = allWorkspaces[workspaceId];
  if (!ws) return [];

  const now = Date.now();
  for (const file of ws.files) {
    if (shouldPause && !file.isPaused) {
      const remaining = Math.max(0, file.expiresAt - now);
      file.isPaused = true;
      file.pausedRemainingMs =
        remaining > 0 ? remaining : 7 * 24 * 60 * 60 * 1000;
      file.expiresAt = FAR_FUTURE_EXPIRES_AT;
    } else if (!shouldPause && file.isPaused) {
      const remaining =
        file.pausedRemainingMs && file.pausedRemainingMs > 0
          ? file.pausedRemainingMs
          : 7 * 24 * 60 * 60 * 1000;
      file.isPaused = false;
      file.expiresAt = now + remaining;
      file.pausedRemainingMs = undefined;
    }
  }

  allWorkspaces[workspaceId] = ws;
  saveAllWorkspaces(allWorkspaces);
  return ws.files;
}

/**
 * Calculate total used bytes in workspace
 */
export function calculateWorkspaceUsage(workspaceId: string): {
  usedBytes: number;
  limitBytes: number;
  percentage: number;
  fileCount: number;
} {
  const ws = getWorkspaceData(workspaceId);
  if (!ws) {
    return {
      usedBytes: 0,
      limitBytes: 10 * 1024 * 1024 * 1024,
      percentage: 0,
      fileCount: 0,
    };
  }

  const usedBytes = ws.files.reduce((acc, f) => acc + (f.size || 0), 0);
  const limitBytes = ws.storageLimitBytes || 10 * 1024 * 1024 * 1024;
  const percentage = Math.min(
    100,
    Math.round((usedBytes / limitBytes) * 1000) / 10,
  );

  return {
    usedBytes,
    limitBytes,
    percentage,
    fileCount: ws.files.length,
  };
}

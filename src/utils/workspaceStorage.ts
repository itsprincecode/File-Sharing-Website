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
 * Verifies if the active user session still exists in Supabase.
 * If the user or workspace was deleted from Supabase (e.g. by SQL query),
 * automatically clears the local session, purges local workspace caches,
 * and returns null so the website immediately updates to the logged-out, clean state.
 */
export async function validateSessionAgainstSupabase(): Promise<UserSession | null> {
  const currentSession = loadSavedSession();
  if (!currentSession || !currentSession.isLoggedIn || !currentSession.email) {
    return null;
  }

  try {
    const { data: member, error } = await supabase
      .from("workspace_members")
      .select("email, workspace_id, workspace_name, display_name")
      .eq("email", currentSession.email.toLowerCase())
      .maybeSingle();

    // If query succeeded and member does NOT exist in Supabase -> user was deleted from DB
    if (!error && !member) {
      console.log(
        "Member was removed from Supabase. Clearing local session and workspace cache.",
      );
      clearSessionFromStorage();
      const allWorkspaces = getAllWorkspaces();
      if (
        currentSession.workspaceId &&
        allWorkspaces[currentSession.workspaceId]
      ) {
        delete allWorkspaces[currentSession.workspaceId];
        saveAllWorkspaces(allWorkspaces);
      }
      const users = getRegisteredUsers().filter(
        (u) => u.email.toLowerCase() !== currentSession.email.toLowerCase(),
      );
      saveRegisteredUsers(users);
      return null;
    }

    if (member) {
      const updatedSession: UserSession = {
        ...currentSession,
        workspaceId: member.workspace_id || currentSession.workspaceId,
        workspaceName: member.workspace_name || currentSession.workspaceName,
        displayName: member.display_name || currentSession.displayName,
      };
      saveSessionToStorage(updatedSession);
      return updatedSession;
    }
  } catch (err) {
    console.warn("Could not validate session against Supabase:", err);
  }

  return currentSession;
}

/**
 * FACTORY RESET: Completely clears all workspaces, files, and members
 * from both Supabase AND local browser storage.
 */
export async function factoryResetAllData(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // 1. Delete all rows from Supabase
    await supabase.from("workspace_files").delete().neq("code", "__never__");
    await supabase.from("workspaces").delete().neq("id", "__never__");
    await supabase.from("workspace_members").delete().neq("email", "__never__");
    await supabase.from("shared_files").delete().neq("code", "__never__");

    // 2. Wipe all local browser storage
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(USERS_KEY);
      localStorage.removeItem(WORKSPACES_KEY);
      localStorage.clear();
    } catch (e) {
      console.warn("Error clearing localStorage:", e);
    }

    return { success: true };
  } catch (err: any) {
    console.error("Factory reset failed:", err);
    return {
      success: false,
      error: err?.message || "Failed to reset database",
    };
  }
}

// Bind to window object for convenient browser console execution
if (typeof window !== "undefined") {
  (window as any).__FACTORY_RESET_ALL__ = factoryResetAllData;
  (window as any).__CLEAR_LOCAL_CACHE__ = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.reload();
  };
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

let isSyncingMembers = false;
let lastSyncTimestamp = 0;

/**
 * Automatically syncs any locally stored member accounts and lockers into Supabase database.
 * Throttled to avoid rapid duplicate background calls.
 */
export async function syncCachedMembersToDatabase(): Promise<void> {
  const now = Date.now();
  if (isSyncingMembers || now - lastSyncTimestamp < 30000) return;
  isSyncingMembers = true;
  lastSyncTimestamp = now;

  try {
    const users = getRegisteredUsers();
    const allWorkspaces = getAllWorkspaces();

    // Query existing members from Supabase as the source of truth
    const { data: dbMembers, error: dbErr } = await supabase
      .from("workspace_members")
      .select("email, id, workspace_id");

    if (!dbErr) {
      // If Supabase workspace_members table is completely empty, it means the database was wiped or factory reset!
      // In this case, NEVER re-insert old deleted accounts or old data!
      if (!dbMembers || dbMembers.length === 0) {
        console.log(
          "Supabase workspace_members is empty. Purging stale local cache to match clean database.",
        );
        saveRegisteredUsers([]);
        saveAllWorkspaces({});
        clearSessionFromStorage();
        return;
      }

      // Prune any local user whose account was deleted from Supabase
      const dbEmailSet = new Set(
        dbMembers.map((m: any) => (m.email || "").toLowerCase()),
      );
      const activeUsers = users.filter((u) =>
        dbEmailSet.has(u.email.toLowerCase()),
      );
      if (activeUsers.length !== users.length) {
        saveRegisteredUsers(activeUsers);
      }

      // Also prune any cached workspaces whose owner no longer exists in Supabase
      let wsModified = false;
      for (const [wsId, ws] of Object.entries(allWorkspaces)) {
        if (ws.ownerEmail && !dbEmailSet.has(ws.ownerEmail.toLowerCase())) {
          delete allWorkspaces[wsId];
          wsModified = true;
        }
      }
      if (wsModified) {
        saveAllWorkspaces(allWorkspaces);
      }

      // If active session user no longer exists in Supabase, clear session immediately
      const currentSession = loadSavedSession();
      if (
        currentSession?.isLoggedIn &&
        currentSession.email &&
        !dbEmailSet.has(currentSession.email.toLowerCase())
      ) {
        console.log(
          "Current session user was deleted from Supabase. Logging out.",
        );
        clearSessionFromStorage();
      }
    }

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
        const nowEpoch = Date.now();
        const wsPayload: any = {
          id: u.workspaceId,
          workspace_id: u.workspaceId,
          name: u.workspaceName || ws?.name || "Personal Workspace",
          owner_email: u.email,
          folders: ws?.folders || [],
          storage_limit_bytes: ws?.storageLimitBytes || 10737418240,
          created_at: nowEpoch,
          updated_at: nowEpoch,
        };

        let { error: wsErr } = await supabase
          .from("workspaces")
          .upsert(wsPayload, { onConflict: "id" });

        if (wsErr) {
          delete wsPayload.created_at;
          delete wsPayload.updated_at;
          await supabase
            .from("workspaces")
            .upsert(wsPayload, { onConflict: "id" });
        }
      } catch (err) {
        console.warn("Error during background sync of member:", err);
      }
    }

    if (hasIdUpdates) {
      saveRegisteredUsers(users);
    }
  } finally {
    isSyncingMembers = false;
  }
}

const SAMPLE_CODES = new Set(["772910", "482019"]);
const SAMPLE_NAMES = new Set([
  "Workspace_Onboarding_Guide.pdf",
  "Brand_Design_Assets.zip",
]);
export const PREDEFINED_FOLDER_IDS = new Set(["docs", "media", "archives"]);

/**
 * Helper to get all workspace data objects from local cache
 */
export function getAllWorkspaces(): Record<string, WorkspaceData> {
  try {
    const raw = localStorage.getItem(WORKSPACES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, WorkspaceData>;
    let hasChanges = false;

    // Deduplicate files by unique file code, purge sample files, and normalize folder structure
    for (const ws of Object.values(parsed)) {
      if (Array.isArray(ws.files)) {
        const origLen = ws.files.length;
        const seenCodes = new Set<string>();
        const uniqueFiles: WorkspaceFileMetadata[] = [];

        for (const file of ws.files) {
          if (!file || !file.code) continue;
          if (SAMPLE_CODES.has(file.code) || SAMPLE_NAMES.has(file.name))
            continue;
          if (!seenCodes.has(file.code)) {
            seenCodes.add(file.code);
            if (!file.folderId) {
              file.folderId = "all";
            }
            uniqueFiles.push(file);
          }
        }

        ws.files = uniqueFiles;
        if (ws.files.length !== origLen) {
          hasChanges = true;
        }
      }

      // Ensure folders array exists and retains all valid user-created folders
      if (!Array.isArray(ws.folders)) {
        ws.folders = [];
        hasChanges = true;
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
      const nowEpoch = Date.now();
      const wsPayload: any = {
        id: localUser.workspaceId,
        workspace_id: localUser.workspaceId,
        name: localUser.workspaceName || "Personal Workspace",
        owner_email: localUser.email,
        folders: ws?.folders || [],
        storage_limit_bytes: ws?.storageLimitBytes || 10737418240,
        created_at: nowEpoch,
        updated_at: nowEpoch,
      };
      let { error: wsUpsertErr } = await supabase
        .from("workspaces")
        .upsert(wsPayload, { onConflict: "id" });
      if (wsUpsertErr) {
        delete wsPayload.created_at;
        delete wsPayload.updated_at;
        await supabase
          .from("workspaces")
          .upsert(wsPayload, { onConflict: "id" });
      }
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
  const nowEpoch = Date.now();
  const wsRecord: any = {
    id: workspaceId,
    workspace_id: workspaceId,
    name: finalWsName,
    owner_email: normalizedEmail,
    folders: defaultFolders,
    storage_limit_bytes: 10 * 1024 * 1024 * 1024,
    created_at: nowEpoch,
    updated_at: nowEpoch,
  };
  try {
    let { error: insertWsErr } = await supabase
      .from("workspaces")
      .upsert(wsRecord, { onConflict: "id" });
    if (insertWsErr) {
      delete wsRecord.created_at;
      delete wsRecord.updated_at;
      await supabase.from("workspaces").upsert(wsRecord, { onConflict: "id" });
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

  const allWorkspaces = getAllWorkspaces();
  let existingWs = allWorkspaces[workspaceId];

  let workspaceRecord: any = null;
  let workspaceFiles: any[] = [];

  try {
    // 1. Fetch workspace row (support id or workspace_id column)
    let wsRes = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .maybeSingle();

    if (wsRes.error || !wsRes.data) {
      wsRes = await supabase
        .from("workspaces")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
    }

    if (!wsRes.error && wsRes.data) {
      workspaceRecord = wsRes.data;
    }

    // Also fallback to workspace_members to get member's updated workspace_name if workspaces table didn't return it
    if ((!workspaceRecord || !workspaceRecord.name) && ownerEmail) {
      const { data: memberData } = await supabase
        .from("workspace_members")
        .select("workspace_name, display_name")
        .eq("email", ownerEmail.toLowerCase())
        .maybeSingle();

      if (memberData && memberData.workspace_name) {
        if (!workspaceRecord) {
          workspaceRecord = {
            id: workspaceId,
            name: memberData.workspace_name,
            owner_email: ownerEmail,
            folders: [],
          };
        } else {
          workspaceRecord.name = memberData.workspace_name;
        }
      }
    }

    // Self-heal: If workspaces table doesn't have the parent record, ensure it exists now
    if (!wsRes.data && (workspaceRecord || existingWs)) {
      ensureWorkspaceInSupabase(
        workspaceId,
        ownerEmail,
        workspaceRecord?.name || existingWs?.name,
      ).catch(() => {});
    }

    // 2. Fetch workspace files (support created_at, uploaded_at or client-side sorting)
    let filesRes = await supabase
      .from("workspace_files")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (filesRes.error) {
      filesRes = await supabase
        .from("workspace_files")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("uploaded_at", { ascending: false });
    }

    if (filesRes.error) {
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

  // If the workspace does not exist in Supabase at all (e.g., administrator deleted it),
  // purge local cache and return null so the website immediately clears the deleted data.
  if (!workspaceRecord && !ownerEmail) {
    delete allWorkspaces[workspaceId];
    saveAllWorkspaces(allWorkspaces);
    return null;
  }

  // Folder synchronization logic - always preserve custom folders
  let finalFolders: WorkspaceFolder[] = [];
  if (
    workspaceRecord &&
    Array.isArray(workspaceRecord.folders) &&
    workspaceRecord.folders.length > 0
  ) {
    finalFolders = workspaceRecord.folders.filter(
      (f: any) => f && f.id && f.name,
    );
  } else if (
    existingWs &&
    Array.isArray(existingWs.folders) &&
    existingWs.folders.length > 0
  ) {
    finalFolders = existingWs.folders.filter((f: any) => f && f.id && f.name);
  }

  // Files synchronization logic - strictly deduplicate and maintain folder_id
  const seenFileCodes = new Set<string>();
  let finalFiles: WorkspaceFileMetadata[] = [];
  let foundDuplicateRows = false;

  if (workspaceFiles && workspaceFiles.length > 0) {
    for (const row of workspaceFiles) {
      if (!row || !row.code) continue;
      if (seenFileCodes.has(row.code)) {
        foundDuplicateRows = true;
        continue;
      }
      seenFileCodes.add(row.code);

      const fId = row.folder_id && row.folder_id.trim() ? row.folder_id : "all";
      finalFiles.push({
        code: row.code,
        name: row.name,
        size: Number(row.size) || 0,
        type: row.type || "application/octet-stream",
        folderId: fId,
        uploadedAt: toEpochMs(row.created_at || row.uploaded_at),
        expiresAt: toEpochMs(row.expires_at),
        isFolder: !!row.is_folder,
        fileCount: row.file_count || 1,
        isPaused: !!row.is_paused,
        pausedRemainingMs: row.paused_remaining_ms,
      });
    }
  }

  // If duplicate records were detected in Supabase, prune them in the background
  if (foundDuplicateRows) {
    cleanupDuplicateWorkspaceFiles(workspaceId).catch(() => {});
  }

  // Ensure sorted newest first
  finalFiles.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));

  const synced: WorkspaceData = {
    id: workspaceRecord?.id || workspaceRecord?.workspace_id || workspaceId,
    name: workspaceRecord?.name || existingWs?.name || "Personal Workspace",
    ownerEmail:
      workspaceRecord?.owner_email ||
      ownerEmail ||
      existingWs?.ownerEmail ||
      "",
    folders: finalFolders,
    files: finalFiles,
    storageLimitBytes:
      workspaceRecord?.storage_limit_bytes ||
      workspaceRecord?.limit_bytes ||
      existingWs?.storageLimitBytes ||
      10 * 1024 * 1024 * 1024,
  };

  allWorkspaces[workspaceId] = synced;
  saveAllWorkspaces(allWorkspaces);
  return synced;
}

let isCleaningDuplicates = false;

/**
 * Automatically purges all duplicate rows in Supabase workspace_files,
 * keeping only the single newest row for each unique (workspace_id, code) pair.
 */
export async function cleanupDuplicateWorkspaceFiles(
  workspaceId?: string,
): Promise<number> {
  if (isCleaningDuplicates) return 0;
  isCleaningDuplicates = true;

  try {
    let query = supabase.from("workspace_files").select("*");

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    const { data: rows, error } = await query;
    if (error || !rows || rows.length === 0) return 0;

    // Group files by workspace_id + '::' + code
    const groups = new Map<string, Array<{ id: string; time: number }>>();
    for (const r of rows) {
      if (!r || !r.code || !r.id) continue;
      const key = `${r.workspace_id || "default"}::${r.code}`;
      const time = toEpochMs(r.created_at || r.uploaded_at);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push({ id: r.id, time });
    }

    const idsToDelete: string[] = [];
    for (const [_key, list] of groups.entries()) {
      if (list.length > 1) {
        // Sort newest first
        list.sort((a, b) => b.time - a.time);
        // Keep index 0, mark all other duplicates for deletion
        for (let i = 1; i < list.length; i++) {
          idsToDelete.push(list[i].id);
        }
      }
    }

    if (idsToDelete.length === 0) return 0;

    // Delete duplicates in batches of 50
    let totalPurged = 0;
    for (let i = 0; i < idsToDelete.length; i += 50) {
      const chunk = idsToDelete.slice(i, i + 50);
      const { error: delErr } = await supabase
        .from("workspace_files")
        .delete()
        .in("id", chunk);

      if (!delErr) {
        totalPurged += chunk.length;
      }
    }

    return totalPurged;
  } catch (err) {
    console.warn("Notice during workspace_files deduplication:", err);
    return 0;
  } finally {
    isCleaningDuplicates = false;
  }
}

/**
 * Ensure workspace record exists in the Supabase 'workspaces' table.
 * This guarantees any foreign key constraint (e.g., workspace_files_workspace_id_fkey)
 * on workspace_files(workspace_id) references an existing parent row.
 */
export async function ensureWorkspaceInSupabase(
  workspaceId: string,
  ownerEmail?: string,
  workspaceName?: string,
  forceInsert: boolean = false,
): Promise<boolean> {
  if (!workspaceId) return false;

  try {
    if (!forceInsert) {
      // Check if row already exists in workspaces table
      const { data: existingRows } = await supabase
        .from("workspaces")
        .select("id")
        .eq("id", workspaceId)
        .limit(1);

      if (existingRows && existingRows.length > 0) {
        return true;
      }
    }

    const allWs = getAllWorkspaces();
    const localWs = allWs[workspaceId];
    const email = (
      ownerEmail ||
      localWs?.ownerEmail ||
      "member@transfer.app"
    ).toLowerCase();
    const name = workspaceName || localWs?.name || "Personal Workspace";
    const folders = localWs?.folders || [
      { id: "all", name: "All Files", color: "indigo", createdAt: Date.now() },
      {
        id: "docs",
        name: "Documents",
        color: "emerald",
        createdAt: Date.now(),
      },
      {
        id: "media",
        name: "Media & Photos",
        color: "amber",
        createdAt: Date.now(),
      },
      {
        id: "archives",
        name: "Archives",
        color: "purple",
        createdAt: Date.now(),
      },
    ];
    const storageLimit = localWs?.storageLimitBytes || 10737418240;
    const nowEpoch = Date.now();
    const nowIso = new Date().toISOString();

    const candidatePayloads: any[] = [
      // 1. Full with id, workspace_id and bigint epoch
      {
        id: workspaceId,
        workspace_id: workspaceId,
        name,
        owner_email: email,
        folders,
        storage_limit_bytes: storageLimit,
        created_at: nowEpoch,
        updated_at: nowEpoch,
      },
      // 2. Full with id, workspace_id and ISO timestamptz
      {
        id: workspaceId,
        workspace_id: workspaceId,
        name,
        owner_email: email,
        folders,
        storage_limit_bytes: storageLimit,
        created_at: nowIso,
        updated_at: nowIso,
      },
      // 3. With id and workspace_id without timestamps
      {
        id: workspaceId,
        workspace_id: workspaceId,
        name,
        owner_email: email,
        folders,
        storage_limit_bytes: storageLimit,
      },
      // 4. Minimal with id
      {
        id: workspaceId,
        name,
        owner_email: email,
        folders,
      },
      // 5. Minimal with workspace_id
      {
        workspace_id: workspaceId,
        name,
        owner_email: email,
        folders,
      },
    ];

    for (const p of candidatePayloads) {
      const { error: insErr } = await supabase
        .from("workspaces")
        .upsert(p as any, { onConflict: "id" });
      if (!insErr || insErr.code === "23505") {
        return true;
      }
      const { error: directInsErr } = await supabase
        .from("workspaces")
        .insert(p as any);
      if (!directInsErr || directInsErr.code === "23505") {
        return true;
      }
    }
  } catch (err) {
    console.warn("Notice: could not ensure workspace row in Supabase:", err);
  }

  return false;
}

/**
 * Save workspace file to Supabase database workspace_files table.
 * Guaranteed to prevent duplicate rows by finding any existing records first.
 */
export async function saveWorkspaceFileToSupabase(
  workspaceId: string,
  ownerEmail: string,
  fileMeta: WorkspaceFileMetadata,
  base64Data?: string,
): Promise<void> {
  if (!workspaceId) return;

  // 1. Add to local cache immediately with exact folderId
  addFileToWorkspace(workspaceId, fileMeta);

  // 2. Ensure parent workspace exists in Supabase to satisfy foreign key constraints
  await ensureWorkspaceInSupabase(workspaceId, ownerEmail);

  // 3. Save to Supabase workspace_files table
  try {
    const uploadedAtMs = fileMeta.uploadedAt || Date.now();
    const expiresAtMs =
      fileMeta.expiresAt || uploadedAtMs + 7 * 24 * 60 * 60 * 1000;
    const uploadedAtIso = new Date(uploadedAtMs).toISOString();
    const expiresAtIso = new Date(expiresAtMs).toISOString();
    const targetFolderId = fileMeta.folderId || "all";

    // Query without maybeSingle to avoid PGRST116 multiple-rows error
    const { data: existingRows } = await supabase
      .from("workspace_files")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("code", fileMeta.code);

    let rowId: string;
    if (existingRows && existingRows.length > 0) {
      rowId = existingRows[0].id;
      // If duplicate rows already exist in Supabase for this file, purge them now
      if (existingRows.length > 1) {
        const extraIds = existingRows.slice(1).map((r) => r.id);
        Promise.resolve(
          supabase.from("workspace_files").delete().in("id", extraIds),
        ).catch(() => {});
      }
    } else {
      rowId = generateUuid();
    }

    // Base payload without timestamp columns
    const basePayload: Record<string, any> = {
      workspace_id: workspaceId,
      owner_email: ownerEmail,
      code: fileMeta.code,
      name: fileMeta.name,
      size: typeof fileMeta.size === "number" ? fileMeta.size : 0,
      type: fileMeta.type || "application/octet-stream",
      folder_id: targetFolderId,
      is_folder: !!fileMeta.isFolder,
      file_count: fileMeta.fileCount || 1,
      is_paused: !!fileMeta.isPaused,
      paused_remaining_ms: fileMeta.pausedRemainingMs || 0,
      base64_data: base64Data || null,
    };

    // Candidate timestamp combinations (covering mixed schemas, pure timestamptz, or pure bigint)
    const timestampVariants = [
      // 1. created_at as bigint ms, expires_at as timestamptz ISO string (User's database schema)
      { created_at: uploadedAtMs, expires_at: expiresAtIso },
      // 2. Both as timestamptz ISO strings
      { created_at: uploadedAtIso, expires_at: expiresAtIso },
      // 3. Both as bigint numeric ms
      { created_at: uploadedAtMs, expires_at: expiresAtMs },
      // 4. created_at as timestamptz ISO, expires_at as bigint numeric ms
      { created_at: uploadedAtIso, expires_at: expiresAtMs },
    ];

    if (existingRows && existingRows.length > 0) {
      // Row already exists - update it using the first matching timestamp variant
      let lastErr: any = null;
      for (const variant of timestampVariants) {
        const updatePayload = { ...basePayload, ...variant };
        let { error: updateErr } = await supabase
          .from("workspace_files")
          .update(updatePayload as any)
          .eq("workspace_id", workspaceId)
          .eq("code", fileMeta.code);

        if (!updateErr) {
          lastErr = null;
          break;
        }

        // If foreign key constraint violation, re-ensure parent workspace and retry once
        if (
          updateErr.code === "23503" ||
          updateErr.message?.includes("foreign key") ||
          updateErr.message?.includes("workspace_id_fkey")
        ) {
          await ensureWorkspaceInSupabase(
            workspaceId,
            ownerEmail,
            undefined,
            true,
          );
          const { error: retryFkErr } = await supabase
            .from("workspace_files")
            .update(updatePayload as any)
            .eq("workspace_id", workspaceId)
            .eq("code", fileMeta.code);
          if (!retryFkErr) {
            lastErr = null;
            break;
          }
          updateErr = retryFkErr;
        }

        lastErr = updateErr;
        // If type/syntax/range mismatch, try next timestamp variant
        if (
          updateErr.code === "22008" ||
          updateErr.code === "22P02" ||
          updateErr.code === "PGRST204" ||
          updateErr.message?.includes("range") ||
          updateErr.message?.includes("date/time") ||
          updateErr.message?.includes("bigint")
        ) {
          continue;
        }
        break;
      }
      if (lastErr) {
        console.warn("Could not update workspace_file:", lastErr.message);
      }
    } else {
      // Row does not exist - insert new record using the first matching variant
      let lastErr: any = null;
      for (const variant of timestampVariants) {
        const insertPayload = { id: rowId, ...basePayload, ...variant };
        let { error: insertErr } = await supabase
          .from("workspace_files")
          .insert(insertPayload as any);

        if (!insertErr) {
          lastErr = null;
          break;
        }

        // If foreign key constraint violation, re-ensure parent workspace and retry once
        if (
          insertErr.code === "23503" ||
          insertErr.message?.includes("foreign key") ||
          insertErr.message?.includes("workspace_id_fkey")
        ) {
          await ensureWorkspaceInSupabase(
            workspaceId,
            ownerEmail,
            undefined,
            true,
          );
          const { error: retryFkErr } = await supabase
            .from("workspace_files")
            .insert(insertPayload as any);
          if (!retryFkErr) {
            lastErr = null;
            break;
          }
          insertErr = retryFkErr;
        }

        // If 'id' column does not exist in the table (PGRST204), try insert without 'id'
        if (
          insertErr.code === "PGRST204" ||
          insertErr.message?.includes("id")
        ) {
          const payloadNoId = { ...basePayload, ...variant };
          let { error: retryErr } = await supabase
            .from("workspace_files")
            .insert(payloadNoId as any);

          if (!retryErr) {
            lastErr = null;
            break;
          }

          if (
            retryErr.code === "23503" ||
            retryErr.message?.includes("foreign key") ||
            retryErr.message?.includes("workspace_id_fkey")
          ) {
            await ensureWorkspaceInSupabase(
              workspaceId,
              ownerEmail,
              undefined,
              true,
            );
            const { error: retryNoIdFk } = await supabase
              .from("workspace_files")
              .insert(payloadNoId as any);
            if (!retryNoIdFk) {
              lastErr = null;
              break;
            }
            retryErr = retryNoIdFk;
          }

          insertErr = retryErr;
        }

        lastErr = insertErr;
        // If date/time syntax error or numeric type mismatch, try next timestamp variant
        if (
          insertErr.code === "22008" ||
          insertErr.code === "22P02" ||
          insertErr.code === "PGRST204" ||
          insertErr.message?.includes("range") ||
          insertErr.message?.includes("date/time") ||
          insertErr.message?.includes("bigint")
        ) {
          continue;
        }
        break;
      }
      if (lastErr) {
        console.warn("Could not insert workspace_file:", lastErr.message);
      }
    }
  } catch (err) {
    console.warn("Could not save file into Supabase workspace_files:", err);
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
 * Permanently delete an entire workspace and all associated files, folders, and accounts.
 * Cleans up Supabase workspace_files, workspaces, workspace_members,
 * and clears all local storage cache and session data.
 */
export async function deleteEntireWorkspace(
  workspaceId: string,
  ownerEmail?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!workspaceId) return { success: false, error: "Invalid workspace ID" };

  try {
    // 1. Delete all workspace files in Supabase for this workspace
    const { error: filesErr } = await supabase
      .from("workspace_files")
      .delete()
      .eq("workspace_id", workspaceId);

    if (filesErr) {
      console.warn("Notice deleting workspace_files:", filesErr.message);
    }

    if (ownerEmail) {
      await supabase
        .from("workspace_files")
        .delete()
        .eq("owner_email", ownerEmail.toLowerCase());
    }

    // 2. Delete workspace entry from Supabase workspaces table
    const { error: wsErr } = await supabase
      .from("workspaces")
      .delete()
      .eq("id", workspaceId);

    if (wsErr) {
      await supabase
        .from("workspaces")
        .delete()
        .eq("workspace_id", workspaceId);
    }

    // 3. Delete workspace member entry from workspace_members
    if (ownerEmail) {
      await supabase
        .from("workspace_members")
        .delete()
        .eq("email", ownerEmail.toLowerCase());
    }

    await supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", workspaceId);

    // 4. Clean local cache
    try {
      const allWorkspaces = getAllWorkspaces();
      delete allWorkspaces[workspaceId];
      saveAllWorkspaces(allWorkspaces);

      const users = getRegisteredUsers();
      const filteredUsers = users.filter(
        (u) =>
          u.workspaceId !== workspaceId &&
          (!ownerEmail || u.email.toLowerCase() !== ownerEmail.toLowerCase()),
      );
      saveRegisteredUsers(filteredUsers);

      clearSessionFromStorage();
    } catch (cacheErr) {
      console.warn("Notice clearing local cache:", cacheErr);
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error deleting workspace:", err);
    return {
      success: false,
      error: err?.message || "Failed to delete workspace",
    };
  }
}

/**
 * Update workspace name in Supabase and local cache
 */
export async function updateWorkspaceNameInSupabase(
  workspaceId: string,
  newName: string,
): Promise<void> {
  const trimmedName = newName.trim();
  if (!trimmedName || !workspaceId) return;

  // 1. Update local cache immediately
  updateWorkspaceName(workspaceId, trimmedName);

  // 2. Fetch current workspace data to preserve folders and owner
  const ws = getWorkspaceData(workspaceId);
  const session = loadSavedSession();
  const ownerEmail = (ws?.ownerEmail || session?.email || "")
    .trim()
    .toLowerCase();
  const nowEpoch = Date.now();

  let anySuccess = false;
  let lastError: any = null;

  try {
    // --- Step A: Update workspace_members table ---
    if (ownerEmail) {
      const { error: memErr1 } = await supabase
        .from("workspace_members")
        .update({ workspace_name: trimmedName, updated_at: nowEpoch })
        .eq("email", ownerEmail);

      if (!memErr1) {
        anySuccess = true;
      } else {
        // Fallback without updated_at if column type differed
        const { error: memErr1b } = await supabase
          .from("workspace_members")
          .update({ workspace_name: trimmedName })
          .eq("email", ownerEmail);
        if (!memErr1b) anySuccess = true;
      }
    }

    const { error: memErr2 } = await supabase
      .from("workspace_members")
      .update({ workspace_name: trimmedName, updated_at: nowEpoch })
      .eq("workspace_id", workspaceId);

    if (!memErr2) {
      anySuccess = true;
    } else {
      const { error: memErr2b } = await supabase
        .from("workspace_members")
        .update({ workspace_name: trimmedName })
        .eq("workspace_id", workspaceId);
      if (!memErr2b) anySuccess = true;
    }

    // --- Step B: Update workspaces table ---
    // 1. Direct update on existing row
    const { error: wsUpdateErr1 } = await supabase
      .from("workspaces")
      .update({ name: trimmedName, updated_at: nowEpoch })
      .eq("id", workspaceId);

    if (!wsUpdateErr1) {
      anySuccess = true;
    } else {
      const { error: wsUpdateErr1b } = await supabase
        .from("workspaces")
        .update({ name: trimmedName })
        .eq("id", workspaceId);
      if (!wsUpdateErr1b) anySuccess = true;
    }

    // Also update by workspace_id column if present
    await supabase
      .from("workspaces")
      .update({ name: trimmedName })
      .eq("workspace_id", workspaceId);

    if (ownerEmail) {
      await supabase
        .from("workspaces")
        .update({ name: trimmedName })
        .eq("owner_email", ownerEmail);
    }

    // 2. Upsert into workspaces table with id as primary key to guarantee persistent row
    const wsRecord: any = {
      id: workspaceId,
      workspace_id: workspaceId,
      name: trimmedName,
      owner_email: ownerEmail || "member@workspace.local",
      folders: ws?.folders || [],
      storage_limit_bytes: ws?.storageLimitBytes || 10737418240,
      created_at: nowEpoch,
      updated_at: nowEpoch,
    };

    let { error: upsertErr } = await supabase
      .from("workspaces")
      .upsert(wsRecord, { onConflict: "id" });

    if (!upsertErr) {
      anySuccess = true;
    } else {
      delete wsRecord.created_at;
      delete wsRecord.updated_at;
      let { error: upsertErr2 } = await supabase
        .from("workspaces")
        .upsert(wsRecord, { onConflict: "id" });
      if (!upsertErr2) anySuccess = true;
      else lastError = upsertErr2;
    }
  } catch (err: any) {
    console.error("Supabase workspace rename exception:", err);
    lastError = err;
  }

  if (!anySuccess && lastError) {
    throw new Error(lastError.message || "Failed to update database record");
  }
}

/**
 * Update workspace folders in Supabase and local cache
 */
export async function addFolderToWorkspaceInSupabase(
  workspaceId: string,
  folderName: string,
): Promise<WorkspaceFolder | null> {
  let newFolder: WorkspaceFolder | null = null;
  if (folderName && folderName.trim()) {
    newFolder = addFolderToWorkspace(workspaceId, folderName);
  }

  const ws = getWorkspaceData(workspaceId);
  if (ws && ws.folders) {
    try {
      const nowIso = new Date().toISOString();
      const nowEpoch = Date.now();

      const wsPayload = {
        id: workspaceId,
        workspace_id: workspaceId,
        name: ws.name || "Personal Workspace",
        owner_email: ws.ownerEmail || "",
        folders: ws.folders,
        storage_limit_bytes: ws.storageLimitBytes || 10737418240,
        updated_at: nowEpoch,
      };

      let { error: err1 } = await supabase
        .from("workspaces")
        .upsert(wsPayload, { onConflict: "id" });
      if (err1) {
        let { error: err2 } = await supabase
          .from("workspaces")
          .upsert(wsPayload, { onConflict: "workspace_id" });
        if (err2) {
          await supabase
            .from("workspaces")
            .update({ folders: ws.folders, updated_at: nowEpoch })
            .eq("id", workspaceId);
          await supabase
            .from("workspaces")
            .update({ folders: ws.folders, updated_at: nowEpoch })
            .eq("workspace_id", workspaceId);
          await supabase
            .from("workspaces")
            .update({ folders: ws.folders, updated_at: nowIso })
            .eq("id", workspaceId);
          await supabase
            .from("workspaces")
            .update({ folders: ws.folders, updated_at: nowIso })
            .eq("workspace_id", workspaceId);
        }
      }
    } catch (err) {
      console.warn("Could not sync folders to Supabase:", err);
    }
  }

  return newFolder;
}

/**
 * Move a workspace file to another folder in local storage and Supabase
 */
export function moveFileToFolder(
  workspaceId: string,
  code: string,
  folderId: string,
): void {
  const allWorkspaces = getAllWorkspaces();
  const ws = allWorkspaces[workspaceId];
  if (!ws || !Array.isArray(ws.files)) return;
  const file = ws.files.find((f) => f.code === code);
  if (file) {
    file.folderId = folderId || "all";
    allWorkspaces[workspaceId] = ws;
    saveAllWorkspaces(allWorkspaces);
  }
}

/**
 * Move a workspace file to another folder and sync with Supabase
 */
export async function moveFileToFolderInSupabase(
  workspaceId: string,
  code: string,
  folderId: string,
): Promise<void> {
  moveFileToFolder(workspaceId, code, folderId);
  try {
    const targetFolderId = folderId || "all";
    await supabase
      .from("workspace_files")
      .update({ folder_id: targetFolderId })
      .eq("workspace_id", workspaceId)
      .eq("code", code);
  } catch (err) {
    console.warn("Could not update file folder in Supabase:", err);
  }
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

    // If schema uses bigint numeric for expires_at, fallback to numeric ms
    if (
      error &&
      (error.code === "22P02" || error.message?.includes("bigint"))
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

      // If schema uses bigint numeric for expires_at, fallback to numeric ms
      if (
        error &&
        (error.code === "22P02" || error.message?.includes("bigint"))
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
  }

  // Update in session if matching
  const session = loadSavedSession();
  if (
    session &&
    (session.workspaceId === workspaceId || !session.workspaceId)
  ) {
    session.workspaceName = newName;
    saveSessionToStorage(session);
  }

  // Update in registered users cache
  const users = getRegisteredUsers();
  let changed = false;
  for (const u of users) {
    if (
      u.workspaceId === workspaceId ||
      (session?.email && u.email.toLowerCase() === session.email.toLowerCase())
    ) {
      u.workspaceName = newName;
      changed = true;
    }
  }
  if (changed) {
    saveRegisteredUsers(users);
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

  ws.folders = ws.folders || [];
  ws.folders.push(newFolder);
  allWorkspaces[workspaceId] = ws;
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
      const nowEpoch = Date.now();

      await supabase
        .from("workspaces")
        .update({ folders: ws.folders, updated_at: nowEpoch })
        .eq("id", workspaceId);

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

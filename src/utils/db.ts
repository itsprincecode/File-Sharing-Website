/**
 * Supabase Data Storage Integration for Sendro Clone
 * Stores and retrieves uploaded files securely in Supabase.
 * Includes fallback helpers and clean schemas.
 */

import {
  supabase,
  blobToBase64,
  base64ToBlob,
  toEpochMs,
  toIsoStringSafe,
} from "./supabase";
import { getAllWorkspaceFileCodes } from "./workspaceStorage";

export type FileSource = "transfer" | "workspace";

export interface SharedFile {
  code: string; // 6-digit code
  name: string;
  size: number;
  type: string;
  data?: Blob;
  createdAt: number;
  expiresAt: number;
  isFolder?: boolean;
  fileCount?: number;
  source?: FileSource;
}

// In-memory cache for ultra-fast tab switching and 0ms instantaneous loads
let cachedSharedFiles: SharedFile[] | null = null;
let lastSharedFilesFetch = 0;
const CACHE_TTL_MS = 10000; // 10-second fresh cache window

export function invalidateSharedFilesCache(): void {
  cachedSharedFiles = null;
  lastSharedFilesFetch = 0;
}

function parseFolderMeta(
  type: string,
  name: string,
): { isFolder: boolean; fileCount?: number } {
  const isFolder =
    (type && type.includes("is_folder=true")) ||
    (name && name.toLowerCase().endsWith(".zip"));
  const fileCountMatch = type ? type.match(/files=(\d+)/) : null;
  const fileCount = fileCountMatch
    ? parseInt(fileCountMatch[1], 10)
    : undefined;
  return { isFolder: !!isFolder, fileCount };
}

function parseSourceMeta(type: string): FileSource {
  if (type && type.includes("source=workspace")) {
    return "workspace";
  }
  return "transfer";
}

/**
 * Generates a unique 6-digit numeric/alphabetic code
 */
async function generateUniqueCode(): Promise<string> {
  const chars = "0123456789";
  let attempts = 0;

  while (attempts < 100) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Check if code already exists in Supabase
    const { data, error } = await supabase
      .from("shared_files")
      .select("code")
      .eq("code", code)
      .maybeSingle();

    if (!data && !error) {
      return code;
    }
    attempts++;
  }

  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Saves a file directly to Supabase and returns its 6-digit code.
 * Tagged with source ("transfer" or "workspace") to keep personal locker files separated from public transfer lists.
 */
export async function saveFile(
  file: File,
  source: FileSource = "transfer",
  isFolder = false,
  fileCount?: number,
): Promise<SharedFile> {
  const code = await generateUniqueCode();
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
  const expiresAt = now + sevenDays;
  const nowIso = new Date(now).toISOString();
  const expiresAtIso = new Date(expiresAt).toISOString();

  const isFolderFlag =
    isFolder ||
    file.type.includes("is_folder=true") ||
    file.name.toLowerCase().endsWith(".zip");

  // Append source & folder tags to type string
  let finalType = file.type || "application/octet-stream";
  if (!finalType.includes("source=")) {
    finalType = `${finalType};source=${source}`;
  }
  if (isFolderFlag && !finalType.includes("is_folder=true")) {
    finalType = `${finalType};is_folder=true`;
  }
  if (fileCount && !finalType.includes("files=")) {
    finalType = `${finalType};files=${fileCount}`;
  }

  // Convert the file blob to Base64 to store in the text column
  let base64Data = "";
  try {
    base64Data = await blobToBase64(file);
  } catch (err) {
    throw new Error("Failed to process binary file stream.");
  }

  // Save to Supabase shared_files table
  // Attempt insertions supporting both schema designs:
  // Schema A (user schema): data_base64 column, TIMESTAMPTZ timestamps
  // Schema B: base64_data column, is_base64_fallback column, bigint/numeric timestamps
  const candidatePayloads: Record<string, any>[] = [
    // 1. data_base64 with ISO string (PostgreSQL TIMESTAMPTZ)
    {
      code,
      name: file.name,
      size: file.size,
      type: finalType,
      created_at: nowIso,
      expires_at: expiresAtIso,
      data_base64: base64Data,
    },
    // 2. base64_data with ISO string (PostgreSQL TIMESTAMPTZ) + is_base64_fallback
    {
      code,
      name: file.name,
      size: file.size,
      type: finalType,
      created_at: nowIso,
      expires_at: expiresAtIso,
      is_base64_fallback: true,
      base64_data: base64Data,
    },
    // 3. base64_data with ISO string without is_base64_fallback
    {
      code,
      name: file.name,
      size: file.size,
      type: finalType,
      created_at: nowIso,
      expires_at: expiresAtIso,
      base64_data: base64Data,
    },
    // 4. data_base64 with numeric epoch ms timestamps (PostgreSQL BIGINT)
    {
      code,
      name: file.name,
      size: file.size,
      type: finalType,
      created_at: now,
      expires_at: expiresAt,
      data_base64: base64Data,
    },
    // 5. base64_data with numeric epoch ms timestamps + is_base64_fallback
    {
      code,
      name: file.name,
      size: file.size,
      type: finalType,
      created_at: now,
      expires_at: expiresAt,
      is_base64_fallback: true,
      base64_data: base64Data,
    },
    // 6. base64_data with numeric epoch ms timestamps
    {
      code,
      name: file.name,
      size: file.size,
      type: finalType,
      created_at: now,
      expires_at: expiresAt,
      base64_data: base64Data,
    },
  ];

  let error: any = null;
  for (const payload of candidatePayloads) {
    const res = await supabase.from("shared_files").insert(payload);
    if (!res.error) {
      error = null;
      break;
    }
    error = res.error;
    // If the table itself doesn't exist (42P01), stop immediately
    if (error.code === "42P01") {
      break;
    }
    // If it's a column mismatch (PGRST204) or date syntax error (22P02, 22008), try next candidate
    if (
      error.code === "PGRST204" ||
      error.code === "22P02" ||
      error.code === "22008" ||
      error.message?.includes("column")
    ) {
      continue;
    }
    // For other unexpected errors, stop
    break;
  }

  if (error) {
    console.error("Supabase Save Error:", error);

    // Check if table missing error (42P01) or other code
    if (error.code === "42P01") {
      throw new Error("SUPABASE_TABLE_MISSING");
    }
    throw new Error(`Cloud Storage failed: ${error.message}`);
  }

  const parsedFolderMeta = parseFolderMeta(finalType, file.name);

  // Invalidate cache so newly uploaded files appear immediately
  invalidateSharedFilesCache();

  return {
    code,
    name: file.name,
    size: file.size,
    type: finalType,
    data: file,
    createdAt: now,
    expiresAt,
    isFolder: parsedFolderMeta.isFolder || isFolder,
    fileCount: parsedFolderMeta.fileCount ?? fileCount,
    source,
  };
}

/**
 * Retrieves a file from Supabase by its 6-digit code.
 * Fetches the base64 payload on demand only when the file is requested/downloaded.
 */
export async function getFile(
  code: string,
): Promise<(SharedFile & { data: Blob }) | null> {
  const { data, error } = await supabase
    .from("shared_files")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") {
      throw new Error("SUPABASE_TABLE_MISSING");
    }
    console.error("Supabase Query Error:", error);
    return null;
  }

  if (!data) return null;

  const now = Date.now();
  const createdAtMs = toEpochMs(data.created_at);
  const expiresAtMs = toEpochMs(data.expires_at);

  // Check if expired
  if (now > expiresAtMs) {
    deleteFile(code).catch(() => {});
    return null;
  }

  // Re-assemble Blob from base64 string on demand (supporting data_base64, base64_data, or data)
  let blob: Blob;
  const base64Str =
    data.data_base64 || data.base64_data || data.data || data.file_data || "";

  if (base64Str) {
    blob = base64ToBlob(base64Str, data.type);
  } else {
    blob = new Blob([], { type: data.type });
  }

  const { isFolder, fileCount } = parseFolderMeta(data.type, data.name);
  const source = parseSourceMeta(data.type || "");

  return {
    code: data.code,
    name: data.name,
    size: data.size,
    type: data.type,
    data: blob,
    createdAt: createdAtMs,
    expiresAt: expiresAtMs,
    isFolder,
    fileCount,
    source,
  };
}

/**
 * Deletes a file by its code
 */
export async function deleteFile(code: string): Promise<void> {
  invalidateSharedFilesCache();

  const { error } = await supabase
    .from("shared_files")
    .delete()
    .eq("code", code);

  if (error) {
    console.error("Supabase Delete Error:", error);
    throw new Error("Failed to delete record from Supabase");
  }
}

/**
 * Updates the expires_at timestamp of a file in Supabase (used when pausing/resuming expiry)
 */
export async function updateFileExpiresAt(
  code: string,
  newExpiresAt: number,
): Promise<void> {
  invalidateSharedFilesCache();
  const expiresAtIso = new Date(newExpiresAt).toISOString();

  try {
    let { error } = await supabase
      .from("shared_files")
      .update({ expires_at: expiresAtIso })
      .eq("code", code);

    if (
      error &&
      (error.code === "22P02" ||
        error.message?.includes("bigint") ||
        error.message?.includes("integer"))
    ) {
      await supabase
        .from("shared_files")
        .update({ expires_at: newExpiresAt })
        .eq("code", code);
    }
  } catch (err) {
    console.warn("Could not update Supabase expires_at:", err);
  }
}

/**
 * Lists all active files from Supabase ultra-fast:
 * 1. Uses an in-memory cache for instant 0ms tab transitions.
 * 2. Fetches ONLY metadata columns (omitting huge base64 payload).
 * 3. Filters expired files server-side via Supabase index (supports TIMESTAMPTZ and bigint).
 * 4. Strictly excludes personal workspace files if onlyTransfer = true.
 */
export async function listAllFiles(
  onlyTransfer = true,
  forceFresh = false,
): Promise<SharedFile[]> {
  const now = Date.now();

  // Instant response from memory cache if fresh
  if (
    !forceFresh &&
    cachedSharedFiles &&
    now - lastSharedFilesFetch < CACHE_TTL_MS
  ) {
    return cachedSharedFiles;
  }

  const nowIso = new Date(now).toISOString();

  // Fast metadata-only query: DOES NOT pull heavy binary / base64 payload
  // Uses ISO format to match PostgreSQL TIMESTAMPTZ column and prevent "date/time field value out of range"
  let { data, error } = await supabase
    .from("shared_files")
    .select("code, name, size, type, created_at, expires_at")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  // Fallback if table column was created with bigint instead of timestamptz
  if (
    error &&
    (error.code === "22P02" ||
      error.code === "42883" ||
      error.message?.includes("bigint"))
  ) {
    const retry = await supabase
      .from("shared_files")
      .select("code, name, size, type, created_at, expires_at")
      .gt("expires_at", now)
      .order("created_at", { ascending: false });
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (error.code === "42P01") {
      return [];
    }
    console.error("Supabase List Error:", error);
    return cachedSharedFiles || [];
  }

  const activeFiles: SharedFile[] = [];
  const workspaceCodes = getAllWorkspaceFileCodes();

  // Also query workspace codes from Supabase workspace_files table to ensure 100% isolation across different browsers/devices
  try {
    const { data: remoteWsFiles } = await supabase
      .from("workspace_files")
      .select("code");
    if (remoteWsFiles && Array.isArray(remoteWsFiles)) {
      for (const rw of remoteWsFiles) {
        if (rw.code) workspaceCodes.add(rw.code);
      }
    }
  } catch {
    // Ignore error and proceed with local workspaceCodes
  }

  for (const item of data || []) {
    const source = parseSourceMeta(item.type || "");

    // Ensure personal workspace data NEVER appears outside the workspace (e.g. in the Collect tab)
    const isWorkspaceTagged =
      source === "workspace" ||
      workspaceCodes.has(item.code) ||
      (item.type && item.type.includes("source=workspace"));

    if (onlyTransfer && isWorkspaceTagged) {
      continue;
    }

    const { isFolder, fileCount } = parseFolderMeta(item.type, item.name);

    activeFiles.push({
      code: item.code,
      name: item.name,
      size: item.size,
      type: item.type,
      createdAt: toEpochMs(item.created_at),
      expiresAt: toEpochMs(item.expires_at),
      isFolder,
      fileCount,
      source,
    });
  }

  // Update memory cache
  cachedSharedFiles = activeFiles;
  lastSharedFilesFetch = now;

  // Non-blocking background cleanup of expired records
  cleanupExpiredFiles().catch(() => {});

  return activeFiles;
}

/**
 * Batch deletes expired files on Supabase in a single fast query
 */
export async function cleanupExpiredFiles(): Promise<number> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  let { data, error } = await supabase
    .from("shared_files")
    .delete()
    .lt("expires_at", nowIso)
    .select("code");

  if (
    error &&
    (error.code === "22P02" ||
      error.code === "42883" ||
      error.message?.includes("bigint"))
  ) {
    const retry = await supabase
      .from("shared_files")
      .delete()
      .lt("expires_at", now)
      .select("code");
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) return 0;

  if (data.length > 0) {
    invalidateSharedFilesCache();
  }

  return data.length;
}

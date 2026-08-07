/**
 * Supabase Data Storage Integration for Zapya Transfer Clone
 * Stores and retrieves uploaded files securely in Supabase.
 * Includes fallback helpers and clean schemas.
 */

import { supabase, blobToBase64, base64ToBlob } from "./supabase";

export interface SharedFile {
  code: string; // 6-digit code
  name: string;
  size: number;
  type: string;
  data: Blob;
  createdAt: number;
  expiresAt: number;
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
 * Falls back to local IndexedDB storage ONLY if the Supabase table doesn't exist yet.
 */
export async function saveFile(file: File): Promise<SharedFile> {
  const code = await generateUniqueCode();
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
  const expiresAt = now + sevenDays;

  // Convert the file blob to Base64 to store in the text column
  let base64Data = "";
  try {
    base64Data = await blobToBase64(file);
  } catch (err) {
    throw new Error("Failed to process binary file stream.");
  }

  // Save to Supabase shared_files table
  const { error } = await supabase
    .from("shared_files")
    .insert({
      code,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      created_at: now,
      expires_at: expiresAt,
      is_base64_fallback: true,
      base64_data: base64Data
    });

  if (error) {
    console.error("Supabase Save Error:", error);
    
    // Check if table missing error (42P01) or other code
    if (error.code === "42P01") {
      throw new Error("SUPABASE_TABLE_MISSING");
    }
    throw new Error(`Cloud Storage failed: ${error.message}`);
  }

  return {
    code,
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    data: file,
    createdAt: now,
    expiresAt,
  };
}

/**
 * Retrieves a file from Supabase by its 6-digit code
 * Automatically deletes the file if it has expired (7 days old)
 */
export async function getFile(code: string): Promise<SharedFile | null> {
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

  // const now = Date.now();
  // // Check if expired
  // if (now > data.expires_at) {
  //   await deleteFile(code);
  //   return null;
  // }

  // Re-assemble Blob from base64 string
  let blob: Blob;
  if (data.is_base64_fallback && data.base64_data) {
    blob = base64ToBlob(data.base64_data, data.type);
  } else {
    blob = new Blob([], { type: data.type });
  }

  return {
    code: data.code,
    name: data.name,
    size: data.size,
    type: data.type,
    data: blob,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
  };
}

/**
 * Deletes a file by its code
 */
export async function deleteFile(code: string): Promise<void> {
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
 * Lists all active files from Supabase
 * Automatically cleans up any expired files found during listing
 */
export async function listAllFiles(): Promise<SharedFile[]> {
  const { data, error } = await supabase
    .from("shared_files")
    .select("*");

  if (error) {
    if (error.code === "42P01") {
      // Just return empty if table doesn't exist yet, instead of crashing list
      return [];
    }
    console.error("Supabase List Error:", error);
    return [];
  }

  const activeFiles: SharedFile[] = [];
  // const now = Date.now();

  // for (const item of (data || [])) {
  //   if (now > item.expires_at) {
  //     await deleteFile(item.code);
  //   } else {
  //     let blob: Blob;
  //     if (item.is_base64_fallback && item.base64_data) {
  //       blob = base64ToBlob(item.base64_data, item.type);
  //     } else {
  //       blob = new Blob([], { type: item.type });
  //     }

  //     activeFiles.push({
  //       code: item.code,
  //       name: item.name,
  //       size: item.size,
  //       type: item.type,
  //       data: blob,
  //       createdAt: item.created_at,
  //       // expiresAt: item.expires_at,
  //     });
  //   }
  // }

  for (const item of (data || [])) {
  let blob: Blob;

  if (item.is_base64_fallback && item.base64_data) {
    blob = base64ToBlob(item.base64_data, item.type);
  } else {
    blob = new Blob([], { type: item.type });
  }

  activeFiles.push({
    code: item.code,
    name: item.name,
    size: item.size,
    type: item.type,
    data: blob,
    createdAt: item.created_at,
    expiresAt: item.expires_at,
  });
}

  return activeFiles;
}

/**
 * Helper to check expired files on Supabase and clean them up
 */
// export async function cleanupExpiredFiles(): Promise<number> {
//   const { data, error } = await supabase
//     .from("shared_files")
//     .select("code, expires_at");

//   if (error || !data) return 0;

//   const now = Date.now();
//   let deletedCount = 0;

//   for (const file of data) {
//     if (now > file.expires_at) {
//       await deleteFile(file.code);
//       deletedCount++;
//     }
//   }

//   return deletedCount;
// }

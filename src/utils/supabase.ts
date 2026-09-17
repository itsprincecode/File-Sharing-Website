import { createClient } from "@supabase/supabase-js";

// Helper to sanitize env values (striops surrounding quotes if present)
function sanitizeValue(val: any): string {
  if (typeof val !== "string") return "";
  let s = val.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

const rawUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
const rawKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

const sanitizedUrl = sanitizeValue(rawUrl);
const sanitizedKey = sanitizeValue(rawKey);

const isValidUrl =
  sanitizedUrl.startsWith("http://") || sanitizedUrl.startsWith("https://");

const SUPABASE_URL = isValidUrl
  ? sanitizedUrl
  : "https://lhbycbjkoaywervmwqwm.supabase.co";
const SUPABASE_ANON_KEY =
  sanitizedKey && sanitizedKey !== "VITE_SUPABASE_ANON_KEY"
    ? sanitizedKey
    : "sb_publishable_GK4kW7Y2DGNbv--cEyzS2w_rB0U6cBf";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * SQL snippet instructions for creating the required table on Supabase
 */
export const SUPABASE_SETUP_SQL = `
-- ====================================================================
-- SUPABASE DATABASE SETUP FOR Sendro & MEMBER WORKSPACE
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- ====================================================================

-- 1. Workspace Members Table (Authentication & Accounts)
create table if not exists workspace_members (
  id text primary key,
  email text unique not null,
  password text,
  password_hash text not null,
  display_name text not null,
  workspace_id text not null,
  workspace_name text not null,
  created_at bigint not null,
  updated_at bigint not null
);

-- Ensure all member credential columns exist if table was created previously
alter table workspace_members add column if not exists password text;
alter table workspace_members add column if not exists password_hash text;
alter table workspace_members add column if not exists display_name text default 'Member';
alter table workspace_members add column if not exists workspace_id text;
alter table workspace_members add column if not exists workspace_name text default 'Personal Workspace';
alter table workspace_members add column if not exists created_at bigint default (extract(epoch from now()) * 1000)::bigint;
alter table workspace_members add column if not exists updated_at bigint default (extract(epoch from now()) * 1000)::bigint;

create index if not exists idx_workspace_members_email on workspace_members (email);

alter table workspace_members enable row level security;
drop policy if exists "Allow all workspace_members operations" on workspace_members;
drop policy if exists "Allow public read members" on workspace_members;
drop policy if exists "Allow public insert members" on workspace_members;
drop policy if exists "Allow public update members" on workspace_members;
drop policy if exists "Allow public delete members" on workspace_members;

create policy "Allow public read members" on workspace_members for select using (true);
create policy "Allow public insert members" on workspace_members for insert with check (email is not null and length(email) >= 3);
create policy "Allow public update members" on workspace_members for update using (email is not null) with check (email is not null);
create policy "Allow public delete members" on workspace_members for delete using (true);

-- 2. Member Workspaces Table (Custom Folders, Limits & Storage)
create table if not exists workspaces (
  id text primary key,
  name text not null,
  owner_email text not null,
  folders jsonb not null default '[]'::jsonb,
  storage_limit_bytes bigint not null default 10737418240, -- 100MB Pro Locker
  created_at bigint not null,
  updated_at bigint not null
);

alter table workspaces add column if not exists folders jsonb not null default '[]'::jsonb;
alter table workspaces add column if not exists storage_limit_bytes bigint default 10737418240;
alter table workspaces add column if not exists created_at bigint default (extract(epoch from now()) * 1000)::bigint;
alter table workspaces add column if not exists updated_at bigint default (extract(epoch from now()) * 1000)::bigint;

create index if not exists idx_workspaces_owner on workspaces (owner_email);

alter table workspaces enable row level security;
drop policy if exists "Allow all workspaces operations" on workspaces;
drop policy if exists "Allow public read workspaces" on workspaces;
drop policy if exists "Allow public insert workspaces" on workspaces;
drop policy if exists "Allow public update workspaces" on workspaces;
drop policy if exists "Allow public delete workspaces" on workspaces;

create policy "Allow public read workspaces" on workspaces for select using (true);
create policy "Allow public insert workspaces" on workspaces for insert with check (owner_email is not null and name is not null);
create policy "Allow public update workspaces" on workspaces for update using (owner_email is not null) with check (owner_email is not null);
create policy "Allow public delete workspaces" on workspaces for delete using (true);

-- 3. Member Workspace Files Table (Isolated by Member Workspace)
create table if not exists workspace_files (
  id text primary key,
  workspace_id text not null,
  owner_email text not null,
  code text not null,
  name text not null,
  size bigint not null,
  type text not null,
  folder_id text not null default 'all',
  created_at bigint not null,
  expires_at bigint not null,
  is_folder boolean default false,
  file_count integer default 1,
  is_paused boolean default false,
  paused_remaining_ms bigint,
  base64_data text
);

alter table workspace_files add column if not exists id text;
alter table workspace_files add column if not exists folder_id text not null default 'all';
alter table workspace_files add column if not exists is_folder boolean default false;
alter table workspace_files add column if not exists file_count integer default 1;
alter table workspace_files add column if not exists is_paused boolean default false;
alter table workspace_files add column if not exists paused_remaining_ms bigint;
alter table workspace_files add column if not exists base64_data text;

create index if not exists idx_workspace_files_ws on workspace_files (workspace_id);
create index if not exists idx_workspace_files_code on workspace_files (code);
create index if not exists idx_workspace_files_owner on workspace_files (owner_email);
create unique index if not exists idx_workspace_files_ws_code on workspace_files (workspace_id, code);

alter table workspace_files enable row level security;
drop policy if exists "Allow all workspace_files operations" on workspace_files;
drop policy if exists "Allow public read workspace_files" on workspace_files;
drop policy if exists "Allow public insert workspace_files" on workspace_files;
drop policy if exists "Allow public update workspace_files" on workspace_files;
drop policy if exists "Allow public delete workspace_files" on workspace_files;

create policy "Allow public read workspace_files" on workspace_files for select using (true);
create policy "Allow public insert workspace_files" on workspace_files for insert with check (code is not null and name is not null);
create policy "Allow public update workspace_files" on workspace_files for update using (code is not null) with check (code is not null);
create policy "Allow public delete workspace_files" on workspace_files for delete using (true);

-- 4. Shared Transfer Files Table (For 6-Digit Peer Redemptions)
create table if not exists shared_files (
  code text primary key,
  name text not null,
  size bigint not null,
  type text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  data_base64 text,
  base64_data text,
  is_base64_fallback boolean default false
);

alter table shared_files add column if not exists data_base64 text;
alter table shared_files add column if not exists base64_data text;
alter table shared_files add column if not exists is_base64_fallback boolean default false;

create index if not exists idx_shared_files_expires_at on shared_files (expires_at);

alter table shared_files enable row level security;
drop policy if exists "Allow all shared_files operations" on shared_files;
drop policy if exists "Allow public read shared_files" on shared_files;
drop policy if exists "Allow public insert shared_files" on shared_files;
drop policy if exists "Allow public update shared_files" on shared_files;
drop policy if exists "Allow public delete shared_files" on shared_files;

create policy "Allow public read shared_files" on shared_files for select using (true);
create policy "Allow public insert shared_files" on shared_files for insert with check (code is not null and length(code) >= 6 and name is not null and size is not null);
create policy "Allow public update shared_files" on shared_files for update using (code is not null) with check (code is not null);
create policy "Allow public delete shared_files" on shared_files for delete using (code is not null);
`;

/**
 * SHA-256 password hashing using Web Crypto API
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "_zapya_vault_salt_v1");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Convert Blob to Base64 string for text storage options
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File conversion error"));
    reader.onload = () => {
      const result = reader.result as string;
      // split schema "data:image/png;base64," to get the raw base64 string
      const base64 = result.split(",")[1];
      resolve(base64 || "");
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert Base64 string back to Blob
 */
export function base64ToBlob(base64: string, contentType: string): Blob {
  const byteCharacters = atob(base64);
  const byteArrays: Uint8Array[] = [];

  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);

    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  return new Blob(byteArrays, { type: contentType });
}

/**
 * Safely converts any timestamp format (ISO 8601 string, timestamptz string, epoch milliseconds, Date object)
 * into numeric epoch milliseconds. Handles undefined/null gracefully.
 */
export function toEpochMs(val: any, fallback = Date.now()): number {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "number") {
    // If it's in seconds instead of milliseconds (e.g. 10 digits)
    if (val > 0 && val < 10000000000) return val * 1000;
    return val;
  }
  if (typeof val === "string") {
    // Check if it's purely digits (epoch ms or epoch s)
    const trimmed = val.trim();
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (!isNaN(num)) {
        if (num < 10000000000) return num * 1000;
        return num;
      }
    }
    const parsed = new Date(val).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  if (val instanceof Date) return val.getTime();
  return fallback;
}

/**
 * Safely converts any timestamp (number, string, Date) into standard ISO 8601 string for Postgres timestamptz.
 */
export function toIsoStringSafe(val: any): string {
  const ms = toEpochMs(val);
  return new Date(ms).toISOString();
}

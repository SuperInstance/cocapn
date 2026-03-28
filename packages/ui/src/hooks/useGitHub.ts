import { useState, useCallback, useRef } from "react";

// ─── Token management ─────────────────────────────────────────────────────────
//
// Public repos: token is optional.
// Private repos: token is stored in memory ONLY — never localStorage/sessionStorage.
// The caller is responsible for providing the token when needed.

const GITHUB_API = "https://api.github.com";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitHubFile {
  path: string;
  name: string;
  sha: string;
  size: number;
  content: string;        // base64-decoded string
  encoding: string;
  download_url: string | null;
}

export interface GitHubEntry {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir" | "symlink" | "submodule";
  url: string;
  download_url: string | null;
}

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  etag: string | null;
  fetchedAt: number;
}

// Shared module-level cache so multiple hook instances share the same data.
const fileCache = new Map<string, CacheEntry<GitHubFile>>();
const dirCache  = new Map<string, CacheEntry<GitHubEntry[]>>();

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function ghFetch(
  path: string,
  token: string | null,
  etag: string | null = null
): Promise<{ status: number; data: unknown; etag: string | null }> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (etag)  headers["If-None-Match"] = etag;

  const res = await fetch(`${GITHUB_API}${path}`, { headers });
  const newEtag = res.headers.get("etag");
  if (res.status === 304) return { status: 304, data: null, etag };
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((body["message"] as string | undefined) ?? `GitHub API error ${res.status}`);
  }
  const data = await res.json();
  return { status: res.status, data, etag: newEtag };
}

function decodeBase64(encoded: string): string {
  // Remove newlines that GitHub includes in base64 content
  return atob(encoded.replace(/\n/g, ""));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface GitHubHandle {
  fetchFile: (
    owner: string,
    repo: string,
    path: string,
    token?: string | null
  ) => Promise<GitHubFile>;

  fetchDirectory: (
    owner: string,
    repo: string,
    path: string,
    token?: string | null
  ) => Promise<GitHubEntry[]>;

  /** Optimistically write a file to the local cache before the bridge commits it. */
  setOptimistic: (owner: string, repo: string, path: string, content: string) => void;

  /** Clear the cache for a specific file (e.g., after a bridge FILE_EDIT confirms). */
  invalidate: (owner: string, repo: string, path: string) => void;

  fileState: (owner: string, repo: string, path: string) => FetchState<GitHubFile>;
}

export function useGitHub(): GitHubHandle {
  // React state for loading/error per file (keyed by "owner/repo/path")
  const [, forceUpdate] = useState(0);
  const loadingSet = useRef(new Set<string>());
  const errorMap   = useRef(new Map<string, string>());

  const cacheKey = (owner: string, repo: string, path: string) =>
    `${owner}/${repo}/${path}`;

  const fetchFile = useCallback(async (
    owner: string,
    repo: string,
    path: string,
    token: string | null = null
  ): Promise<GitHubFile> => {
    const key = cacheKey(owner, repo, path);
    const cached = fileCache.get(key);

    loadingSet.current.add(key);
    errorMap.current.delete(key);
    forceUpdate((n) => n + 1);

    try {
      const { status, data, etag } = await ghFetch(
        `/repos/${owner}/${repo}/contents/${path}`,
        token,
        cached?.etag ?? null
      );

      if (status === 304 && cached) {
        loadingSet.current.delete(key);
        forceUpdate((n) => n + 1);
        return cached.data;
      }

      const raw = data as {
        path: string; name: string; sha: string; size: number;
        content: string; encoding: string; download_url: string | null;
      };

      const file: GitHubFile = {
        ...raw,
        content: raw.encoding === "base64" ? decodeBase64(raw.content) : raw.content,
      };

      fileCache.set(key, { data: file, etag, fetchedAt: Date.now() });
      loadingSet.current.delete(key);
      forceUpdate((n) => n + 1);
      return file;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errorMap.current.set(key, msg);
      loadingSet.current.delete(key);
      forceUpdate((n) => n + 1);
      throw err;
    }
  }, []);

  const fetchDirectory = useCallback(async (
    owner: string,
    repo: string,
    path: string,
    token: string | null = null
  ): Promise<GitHubEntry[]> => {
    const key = cacheKey(owner, repo, path);
    const cached = dirCache.get(key);

    const { status, data, etag } = await ghFetch(
      `/repos/${owner}/${repo}/contents/${path}`,
      token,
      cached?.etag ?? null
    );

    if (status === 304 && cached) return cached.data;

    const entries = data as GitHubEntry[];
    dirCache.set(key, { data: entries, etag, fetchedAt: Date.now() });
    return entries;
  }, []);

  const setOptimistic = useCallback((
    owner: string,
    repo: string,
    path: string,
    content: string
  ) => {
    const key = cacheKey(owner, repo, path);
    const existing = fileCache.get(key);
    if (existing) {
      fileCache.set(key, {
        ...existing,
        data: { ...existing.data, content },
        etag: null, // force re-fetch next time
      });
      forceUpdate((n) => n + 1);
    }
  }, []);

  const invalidate = useCallback((owner: string, repo: string, path: string) => {
    fileCache.delete(cacheKey(owner, repo, path));
    forceUpdate((n) => n + 1);
  }, []);

  const fileState = useCallback((
    owner: string,
    repo: string,
    path: string
  ): FetchState<GitHubFile> => {
    const key = cacheKey(owner, repo, path);
    return {
      data:    fileCache.get(key)?.data ?? null,
      loading: loadingSet.current.has(key),
      error:   errorMap.current.get(key) ?? null,
    };
  }, []);

  return { fetchFile, fetchDirectory, setOptimistic, invalidate, fileState };
}

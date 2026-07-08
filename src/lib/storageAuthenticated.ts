import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";

const STORAGE_UPLOAD_ERROR_MESSAGE = "Storage upload failed";

function encodeStoragePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function makeStorageError(message: string, status?: number): Error & { statusCode?: number } {
  const error = new Error(message) as Error & { statusCode?: number };
  if (status) error.statusCode = status;
  return error;
}

/**
 * Upload a file to Supabase Storage with an explicit verified user bearer token.
 * Intended for protected bucket writes where the caller has already required a session.
 */
export async function uploadFileAuthenticated(
  bucket: string,
  path: string,
  file: File,
  accessToken: string
): Promise<{ path: string | null; error: Error | null }> {
  if (!accessToken) {
    return { path: null, error: makeStorageError("Authenticated upload requires an active session") };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${encodeStoragePath(bucket)}/${encodeStoragePath(path)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
          'content-type': file.type || 'application/octet-stream',
          'cache-control': '3600',
          'x-upsert': 'true',
        },
        body: file,
      }
    );

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const storageMessage =
        payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
          ? payload.message
          : STORAGE_UPLOAD_ERROR_MESSAGE;
      return { path: null, error: makeStorageError(storageMessage, response.status) };
    }

    const returnedPath =
      payload && typeof payload === 'object' && 'Key' in payload && typeof payload.Key === 'string'
        ? payload.Key.replace(new RegExp(`^${bucket}/`), '')
        : path;

    return { path: returnedPath, error: null };
  } catch (error) {
    return { path: null, error: error as Error };
  }
}

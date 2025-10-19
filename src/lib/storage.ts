import { supabase } from "@/integrations/supabase/client";

/**
 * Upload file to private Supabase Storage bucket.
 * Returns the file PATH (not public URL) for storage in database.
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File
): Promise<{ path: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) throw error;

    // Return the path (not a public URL since buckets are private)
    return { path: data.path, error: null };
  } catch (error) {
    return { path: null, error: error as Error };
  }
}

/**
 * Generate a short-lived signed URL for private file access.
 * Default expiry: 1 hour (3600 seconds).
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 3600
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) throw error;

    return { url: data.signedUrl, error: null };
  } catch (error) {
    return { url: null, error: error as Error };
  }
}

/**
 * Delete file from storage bucket.
 */
export async function deleteFile(bucket: string, path: string) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  return { error };
}

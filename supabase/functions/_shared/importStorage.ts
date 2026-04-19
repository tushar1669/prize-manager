export const IMPORTS_BUCKET = "imports";

export function buildImportStoragePath(params: {
  userId: string;
  tournamentId: string;
  date: string;
  fileHash: string;
  fileName: string;
}): string {
  const { userId, tournamentId, date, fileHash, fileName } = params;
  return `${userId}/${tournamentId}/${date}/${fileHash}_${fileName}`;
}

export function isMissingBucketError(message: string | null | undefined, bucketName: string): boolean {
  if (!message) return false;

  const normalized = message.toLowerCase();
  const mentionsBucket = normalized.includes(bucketName.toLowerCase());
  if (!mentionsBucket) return false;

  return /(bucket\s+not\s+found|not\s+found|does\s+not\s+exist|missing)/i.test(message);
}

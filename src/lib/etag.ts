import crypto from 'crypto';

export type MediaListItemInput = {
  id: string;
  md5?: string | null;
  modifiedTime?: string | null;
};

/**
 * Build a stable ETag for media lists. Only changes if
 * ids or content hashes/timestamps change.
 */
export function buildMediaListEtag(items: Array<MediaListItemInput>) {
  const basis = items
    .map((item) => `${item.id}:${item.md5 ?? ''}:${item.modifiedTime ?? ''}`)
    .join('|');
  const hash = crypto.createHash('sha1').update(basis).digest('hex');
  return `"media-list-${hash}"`;
}

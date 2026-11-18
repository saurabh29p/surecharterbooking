/** What each kind of upload may be, checked against the file's real bytes (not its name). */
export type FilePurpose =
  'logo' | 'operator-document' | 'receipt' | 'signed-document' | 'guest-id' | 'document';

export interface FileKind {
  mime: string;
  ext: string;
}

const PDF: FileKind = { mime: 'application/pdf', ext: 'pdf' };
const PNG: FileKind = { mime: 'image/png', ext: 'png' };
const JPEG: FileKind = { mime: 'image/jpeg', ext: 'jpg' };
const WEBP: FileKind = { mime: 'image/webp', ext: 'webp' };

export const PURPOSES: Record<
  FilePurpose,
  { allowed: FileKind[]; maxBytes: number; encrypt: boolean; label: string }
> = {
  logo: {
    allowed: [PNG, JPEG, WEBP],
    maxBytes: 2 * 1024 * 1024,
    encrypt: false,
    label: 'a PNG, JPG or WebP image up to 2 MB',
  },
  'operator-document': {
    allowed: [PDF, PNG, JPEG, WEBP],
    maxBytes: 15 * 1024 * 1024,
    encrypt: false,
    label: 'a PDF or image up to 15 MB',
  },
  receipt: {
    allowed: [PDF, PNG, JPEG, WEBP],
    maxBytes: 15 * 1024 * 1024,
    encrypt: false,
    label: 'a PDF or image up to 15 MB',
  },
  'signed-document': {
    allowed: [PDF, PNG, JPEG],
    maxBytes: 20 * 1024 * 1024,
    encrypt: false,
    label: 'a PDF or image up to 20 MB',
  },
  /** PDFs the app generates (quotes, agreements, invoices). */
  document: {
    allowed: [PDF],
    maxBytes: 10 * 1024 * 1024,
    encrypt: false,
    label: 'a PDF up to 10 MB',
  },
  'guest-id': {
    allowed: [PDF, PNG, JPEG, WEBP],
    maxBytes: 10 * 1024 * 1024,
    encrypt: true,
    label: 'a PDF or image up to 10 MB',
  },
};

/** Identify a file from its first bytes. SVG and anything else unknown are refused. */
export function sniff(buf: Buffer): FileKind | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return PDF;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return PNG;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return JPEG;
  if (
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return WEBP;
  return null;
}

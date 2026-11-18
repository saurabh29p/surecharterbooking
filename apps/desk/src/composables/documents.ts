import type { DocumentType } from '@shubhjets/shared';
import { download, fetchFile } from '../api/client';

export interface DocumentVersionRow {
  id: string;
  version: number;
  draft: boolean;
  missing: string[];
  signed: boolean;
  templateVersion: number | null;
  createdAt: string;
}

export interface DocumentRow {
  id: string;
  type: DocumentType;
  label: string;
  status: 'DRAFT' | 'SHARED' | 'SIGNED';
  quoteId: string | null;
  quoteVersion: number | null;
  invoice: { id: string; number: string; cancelled: boolean } | null;
  rateRequestId: string | null;
  updatedAt: string;
  versions: DocumentVersionRow[];
  shares: {
    id: string;
    version: number;
    channel: string;
    recipient: string | null;
    sharedAt: string;
  }[];
}

export interface InvoiceRow {
  id: string;
  number: string;
  issuedOn: string;
  buyerName: string;
  total: number;
  documentId: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

/** Opens a PDF that needs login in a new tab (the tab is opened first so phones allow it). */
export async function openPdf(path: string): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const { blob } = await fetchFile(path, 'document.pdf');
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}

/**
 * Shares a PDF with the phone's share sheet (WhatsApp, Gmail…). Returns 'shared', 'cancelled',
 * or 'downloaded' when the device has no share sheet (the file is saved instead).
 */
export async function sharePdf(
  path: string,
  fallbackName: string,
  text: string,
): Promise<'shared' | 'cancelled' | 'downloaded'> {
  const { blob, name } = await fetchFile(path, fallbackName);
  const file = new File([blob], name, { type: 'application/pdf' });
  const data = { files: [file], title: name, text };
  if (navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  await download(path, fallbackName);
  return 'downloaded';
}

export type { BankDetails, BusinessProfileView } from '@shubhjets/shared';

export interface DeviceSession {
  id: string;
  userAgent: string | null;
  signedInAt: string;
  lastUsedAt: string | null;
  current: boolean;
}

import { Airport } from '../airports/airport.entity.js';
import { AuditLog } from '../audit/audit-log.entity.js';
import { RefreshToken } from '../auth/refresh-token.entity.js';
import { User } from '../auth/user.entity.js';
import { BusinessProfile } from '../business-profiles/business-profile.entity.js';
import { StoredFile } from '../files/file.entity.js';
import { OPERATOR_ENTITIES } from '../operators/operator.entities.js';
import { PARTNER_ENTITIES } from '../partners/partner.entities.js';
import { CLIENT_ENTITIES } from '../clients/client.entities.js';
import { WEDDING_ENTITIES } from '../weddings/wedding.entities.js';
import { QUOTE_ENTITIES } from '../quotes/quote.entities.js';
import { DOCUMENT_ENTITIES } from '../documents/document.entities.js';
import { Invoice } from '../invoices/invoice.entity.js';
import { Setting } from '../settings/setting.entity.js';

/** Entities are added as each feature is built; the schema itself is complete in the migrations. */
export const ENTITIES = [
  Airport,
  AuditLog,
  BusinessProfile,
  RefreshToken,
  Setting,
  User,
  StoredFile,
  ...OPERATOR_ENTITIES,
  ...PARTNER_ENTITIES,
  ...CLIENT_ENTITIES,
  ...WEDDING_ENTITIES,
  ...QUOTE_ENTITIES,
  ...DOCUMENT_ENTITIES,
  Invoice,
];

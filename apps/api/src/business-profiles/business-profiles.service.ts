import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DEFAULT_STATE_CODE,
  bankHint,
  financialYear,
  formatInvoiceNumber,
  profileReadiness,
  stateName,
  type BankDetails,
  type BusinessProfileView,
  type IsoDate,
} from '@shubhjets/shared';
import { DataSource, IsNull, Not, type EntityManager, type Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { EncryptionService } from '../crypto/encryption.service.js';
import { FilesService } from '../files/files.service.js';
import { BusinessProfile } from './business-profile.entity.js';
import {
  validateUpdate,
  type CreateProfileInput,
  type UpdateProfileInput,
} from './business-profile.dto.js';

const fieldErrors = (fields: Record<string, string>) =>
  new BadRequestException({ message: 'Please fix the highlighted fields', fields });

/** Plain columns that the API copies straight from the request. */
const PLAIN_FIELDS = [
  'label',
  'brandName',
  'legalName',
  'llpin',
  'gstin',
  'stateCode',
  'registeredAddress',
  'signatoryName',
  'signatoryDesignation',
  'arbitrationSeatCity',
  'invoicePrefix',
] as const;

@Injectable()
export class BusinessProfilesService {
  constructor(
    @InjectRepository(BusinessProfile) private readonly repo: Repository<BusinessProfile>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly crypto: EncryptionService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  toView(p: BusinessProfile): BusinessProfileView {
    const hasBankDetails = p.bankHint !== null;
    return {
      id: p.id,
      label: p.label,
      brandName: p.brandName,
      legalName: p.legalName,
      llpin: p.llpin,
      gstin: p.gstin,
      stateCode: p.stateCode,
      registeredAddress: p.registeredAddress,
      hasBankDetails,
      bankHint: p.bankHint,
      signatoryName: p.signatoryName,
      signatoryDesignation: p.signatoryDesignation,
      arbitrationSeatCity: p.arbitrationSeatCity,
      logoFileId: p.logoFileId,
      invoicePrefix: p.invoicePrefix,
      isDefault: p.isDefault,
      archived: p.archivedAt !== null,
      readiness: profileReadiness({ ...p, hasBankDetails }),
    };
  }

  async list(includeArchived = false): Promise<BusinessProfileView[]> {
    const rows = await this.repo.find({
      where: includeArchived ? {} : { archivedAt: IsNull() },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
    return rows.map((p) => this.toView(p));
  }

  private async find(id: string, m?: EntityManager): Promise<BusinessProfile> {
    const repo = m ? m.getRepository(BusinessProfile) : this.repo;
    const p = await repo.findOneBy({ id });
    if (!p) throw new NotFoundException('Business profile not found');
    return p;
  }

  async get(id: string): Promise<BusinessProfileView> {
    return this.toView(await this.find(id));
  }

  /** The default profile, or null before the setup wizard has created one. */
  async getDefault(): Promise<BusinessProfileView | null> {
    const p = await this.repo.findOneBy({ isDefault: true });
    return p ? this.toView(p) : null;
  }

  private async assertGstinFree(
    m: EntityManager,
    gstin: string | null | undefined,
    exceptId?: string,
  ) {
    if (!gstin) return;
    const clash = await m.getRepository(BusinessProfile).findOne({
      where: { gstin, archivedAt: IsNull(), ...(exceptId ? { id: Not(exceptId) } : {}) },
    });
    if (clash)
      throw fieldErrors({ gstin: `This GSTIN is already used by the "${clash.label}" profile` });
  }

  private applyBank(p: BusinessProfile, bank: BankDetails | null | undefined): string | undefined {
    if (bank === undefined) return undefined;
    if (bank === null) {
      p.bankDetailsEnc = null;
      p.bankHint = null;
      return 'removed';
    }
    p.bankDetailsEnc = this.crypto.encryptJson(bank);
    p.bankHint = bankHint(bank);
    return 'changed';
  }

  async create(input: CreateProfileInput, userId: string): Promise<BusinessProfileView> {
    const saved = await this.ds.transaction(async (m) => {
      const repo = m.getRepository(BusinessProfile);
      await this.assertGstinFree(m, input.gstin);
      const isFirst = (await repo.count({ where: { archivedAt: IsNull() } })) === 0;
      const stateCode = input.stateCode ?? DEFAULT_STATE_CODE;
      const p = repo.create({
        label: input.label ?? stateName(stateCode) ?? 'Main',
        brandName: input.brandName ?? null,
        legalName: input.legalName ?? null,
        llpin: input.llpin ?? null,
        gstin: input.gstin ?? null,
        stateCode,
        registeredAddress: input.registeredAddress ?? null,
        signatoryName: input.signatoryName ?? null,
        signatoryDesignation: input.signatoryDesignation ?? null,
        arbitrationSeatCity: input.arbitrationSeatCity ?? null,
        invoicePrefix: input.invoicePrefix ?? 'VK',
        isDefault: isFirst,
        archivedAt: null,
        logoFileId: null,
        bankDetailsEnc: null,
        bankHint: null,
        createdBy: userId,
      });
      this.applyBank(p, input.bankDetails);
      return repo.save(p);
    });
    return this.toView(saved);
  }

  async update(id: string, input: UpdateProfileInput): Promise<BusinessProfileView> {
    const saved = await this.ds.transaction(async (m) => {
      const p = await this.find(id, m);
      if (p.archivedAt) throw new BadRequestException('This profile is archived');
      const check = validateUpdate(input, p.stateCode);
      if (!check.success) {
        const fields: Record<string, string> = {};
        for (const issue of check.error.issues) fields[issue.path.join('.')] ??= issue.message;
        throw fieldErrors(fields);
      }
      // Changing only the state must still agree with a stored GSTIN.
      if (
        input.stateCode &&
        input.gstin === undefined &&
        p.gstin &&
        p.gstin.slice(0, 2) !== input.stateCode
      ) {
        throw fieldErrors({
          stateCode: `The saved GSTIN is registered in ${stateName(p.gstin.slice(0, 2))}; change the GSTIN too`,
        });
      }
      await this.assertGstinFree(m, input.gstin, id);
      let changed = false;
      for (const field of PLAIN_FIELDS) {
        const value = input[field];
        if (value === undefined || value === p[field]) continue;
        if (
          value === null &&
          (field === 'label' || field === 'stateCode' || field === 'invoicePrefix')
        )
          continue; // required
        (p as unknown as Record<string, unknown>)[field] = value;
        changed = true;
      }
      if (this.applyBank(p, input.bankDetails)) changed = true;
      // The audit subscriber logs the before/after values of whatever save() changes.
      return changed ? m.getRepository(BusinessProfile).save(p) : p;
    });
    return this.toView(saved);
  }

  async setDefault(id: string): Promise<BusinessProfileView> {
    const saved = await this.ds.transaction(async (m) => {
      const p = await this.find(id, m);
      if (p.archivedAt) throw new BadRequestException('Archived profiles cannot be the default');
      if (p.isDefault) return p;
      const repo = m.getRepository(BusinessProfile);
      // Entity saves (not a bulk update) so both changes appear in the audit log.
      const previous = await repo.findOneBy({ isDefault: true });
      if (previous) {
        previous.isDefault = false;
        await repo.save(previous);
      }
      p.isDefault = true;
      return repo.save(p);
    });
    return this.toView(saved);
  }

  /** Archived profiles stay attached to old weddings and invoices but can't be chosen for new ones. */
  async archive(id: string): Promise<BusinessProfileView> {
    const p = await this.find(id);
    if (p.isDefault) {
      throw new ConflictException('Make another profile the default before archiving this one');
    }
    if (p.archivedAt) return this.toView(p);
    p.archivedAt = new Date();
    return this.toView(await this.repo.save(p));
  }

  /** Replace the logo shown on PDFs (instead of the Vaanika logo). The old file is deleted. */
  async setLogo(
    id: string,
    upload: { buffer: Buffer; originalName: string },
  ): Promise<BusinessProfileView> {
    const p = await this.find(id);
    if (p.archivedAt) throw new BadRequestException('This profile is archived');
    const file = await this.files.upload({ ...upload, purpose: 'logo' });
    const old = p.logoFileId;
    p.logoFileId = file.id;
    const saved = await this.repo.save(p);
    if (old) await this.files.purge(old);
    return this.toView(saved);
  }

  async removeLogo(id: string): Promise<BusinessProfileView> {
    const p = await this.find(id);
    if (!p.logoFileId) return this.toView(p);
    const old = p.logoFileId;
    p.logoFileId = null;
    const saved = await this.repo.save(p);
    await this.files.purge(old);
    return this.toView(saved);
  }

  /** Full bank details, for the edit form only. Every view is audited. */
  async revealBankDetails(id: string): Promise<BankDetails | null> {
    const p = await this.repo
      .createQueryBuilder('p')
      .addSelect('p.bankDetailsEnc')
      .where('p.id = :id', { id })
      .getOne();
    if (!p) throw new NotFoundException('Business profile not found');
    if (!p.bankDetailsEnc) return null;
    await this.audit.record({
      entity: 'business_profile',
      entityId: id,
      action: 'BANK_DETAILS_VIEWED',
    });
    return this.crypto.decryptJson<BankDetails>(p.bankDetailsEnc);
  }

  /**
   * Reserve the next invoice number for a profile, e.g. "VK/2026-27/0001".
   * Numbering is per profile and restarts every financial year (1 April). Call inside the
   * transaction that creates the invoice so a failed invoice doesn't burn a number.
   */
  async nextInvoiceNumber(
    m: EntityManager,
    profileId: string,
    issuedOn: IsoDate,
  ): Promise<{ number: string; fy: string; seq: number }> {
    const p = await this.find(profileId, m);
    const view = this.toView(p);
    if (!view.readiness.canIssueInvoice) {
      throw new BadRequestException(view.readiness.invoiceBlockers.join('. '));
    }
    const fy = financialYear(issuedOn);
    const [row]: { last_value: number }[] = await m.query(
      `INSERT INTO invoice_sequence (business_profile_id, fy, last_value) VALUES ($1, $2, 1)
       ON CONFLICT (business_profile_id, fy) DO UPDATE SET last_value = invoice_sequence.last_value + 1
       RETURNING last_value`,
      [profileId, fy],
    );
    const seq = row!.last_value;
    return { number: formatInvoiceNumber(p.invoicePrefix, issuedOn, seq), fy, seq };
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AGREEMENT_LABELS,
  PLACEHOLDERS,
  templateProblems,
  toIstDate,
  type AgreementKind,
  type IsoDate,
} from '@shubhjets/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { PdfService } from '../pdf/pdf.service.js';
import { agreementHtml } from './agreement-render.js';
import { DocumentTemplate, TemplateVersion } from './document.entities.js';
import { sampleValues } from './sample-values.js';

/**
 * Agreement templates (BRIEF.md §5.5): Markdown with {{placeholders}}, editable and versioned,
 * with a lawyer-approved flag and date. Until approved, documents made from a template carry
 * the "DRAFT – NOT FOR SIGNATURE" watermark.
 */
@Injectable()
export class TemplatesService {
  now: () => Date = () => new Date();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly pdf: PdfService,
  ) {}

  private async template(m: EntityManager, kind: AgreementKind): Promise<DocumentTemplate> {
    const t = await m.getRepository(DocumentTemplate).findOneBy({ kind });
    if (!t) throw new NotFoundException('Template not found; run the migrations');
    return t;
  }

  /** The newest version of a template (what new documents are made from). */
  async current(kind: AgreementKind, m: EntityManager = this.ds.manager): Promise<TemplateVersion> {
    const t = await this.template(m, kind);
    const v = await m
      .getRepository(TemplateVersion)
      .findOne({ where: { templateId: t.id }, order: { version: 'DESC' } });
    if (!v) throw new NotFoundException('Template has no versions');
    return v;
  }

  async list() {
    const rows: {
      kind: AgreementKind;
      name: string;
      id: string;
      version: number;
      lawyer_approved: boolean;
      approved_on: string | null;
      created_at: Date;
    }[] = await this.ds.query(
      `SELECT DISTINCT ON (t.kind) t.kind, t.name, v.id, v.version, v.lawyer_approved, v.approved_on, v.created_at
         FROM document_template t JOIN template_version v ON v.template_id = t.id
        ORDER BY t.kind, v.version DESC`,
    );
    const order = Object.keys(AGREEMENT_LABELS);
    return rows
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
      .map((r) => ({
        kind: r.kind,
        name: r.name,
        versionId: r.id,
        version: r.version,
        lawyerApproved: r.lawyer_approved,
        approvedOn: r.approved_on,
        updatedAt: r.created_at,
      }));
  }

  async get(kind: AgreementKind) {
    const t = await this.template(this.ds.manager, kind);
    const versions = await this.ds
      .getRepository(TemplateVersion)
      .find({ where: { templateId: t.id }, order: { version: 'DESC' } });
    const current = versions[0]!;
    return {
      kind,
      name: t.name,
      current: {
        id: current.id,
        version: current.version,
        bodyMd: current.bodyMd,
        lawyerApproved: current.lawyerApproved,
        approvedOn: current.approvedOn,
        createdAt: current.createdAt,
      },
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        lawyerApproved: v.lawyerApproved,
        approvedOn: v.approvedOn,
        createdAt: v.createdAt,
      })),
      placeholders: PLACEHOLDERS[kind],
    };
  }

  /** Saves an edited template as a new version (never approved: the lawyer reviews it again). */
  async saveVersion(kind: AgreementKind, bodyMd: string, userId: string) {
    const problems = templateProblems(kind, bodyMd);
    if (problems.length)
      throw new BadRequestException({
        message: problems[0],
        fields: { bodyMd: problems.join('. ') },
      });
    await this.ds.transaction(async (m) => {
      const t = await this.template(m, kind);
      await m.query(`SELECT 1 FROM document_template WHERE id = $1 FOR UPDATE`, [t.id]);
      const latest = await this.current(kind, m);
      if (latest.bodyMd === bodyMd) throw new ConflictException('Nothing changed in the template');
      const repo = m.getRepository(TemplateVersion);
      await repo.save(
        repo.create({
          templateId: t.id,
          version: latest.version + 1,
          bodyMd,
          lawyerApproved: false,
          approvedOn: null,
          createdBy: userId,
        }),
      );
    });
    return this.get(kind);
  }

  /** You confirm your lawyer approved this exact version. Only the newest version can be approved. */
  async approve(kind: AgreementKind, versionId: string, approvedOn: IsoDate) {
    await this.ds.transaction(async (m) => {
      const latest = await this.current(kind, m);
      if (latest.id !== versionId)
        throw new ConflictException(
          'Only the newest version can be approved. Open it and check it first.',
        );
      if (latest.lawyerApproved) throw new ConflictException('This version is already approved');
      if (approvedOn > toIstDate(this.now()))
        throw new BadRequestException({
          message: 'The approval date cannot be in the future',
          fields: { approvedOn: 'The approval date cannot be in the future' },
        });
      latest.lawyerApproved = true;
      latest.approvedOn = approvedOn;
      await m.getRepository(TemplateVersion).save(latest);
    });
    return this.get(kind);
  }

  /** A PDF of a template (saved or as edited) filled with clearly fake sample data. */
  async preview(kind: AgreementKind, bodyMd?: string): Promise<Buffer> {
    const body = bodyMd ?? (await this.current(kind)).bodyMd;
    const problems = templateProblems(kind, body);
    if (problems.length)
      throw new BadRequestException({
        message: problems[0],
        fields: { bodyMd: problems.join('. ') },
      });
    const { html } = agreementHtml({
      kind,
      body,
      values: sampleValues(kind),
      brandName: 'ShubhJets',
      subtitle: 'Preview with sample data',
      watermark: 'PREVIEW · SAMPLE DATA',
    });
    return this.pdf.render(html, { footer: 'Preview with sample data' });
  }
}

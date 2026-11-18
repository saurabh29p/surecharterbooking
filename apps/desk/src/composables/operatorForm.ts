import { reactive } from 'vue';
import type { OperatorForm } from '../components/operator/OperatorFields.vue';
import type { OperatorDetail } from './operators';

export function newOperatorForm(op?: OperatorDetail | null): OperatorForm {
  return reactive({
    legalName: op?.legalName ?? '',
    brand: op?.brand ?? '',
    nsopNo: op?.nsopNo ?? '',
    nsopIssuedOn: op?.nsopIssuedOn ?? '',
    cin: op?.cin ?? '',
    gstin: op?.gstin ?? '',
    bases: [...(op?.bases ?? [])],
    website: op?.website ?? '',
    safetyDisclosureUrl: op?.safetyDisclosureUrl ?? '',
    sourceLink: op?.sourceLink ?? '',
    dgcaRank: op?.dgcaRank ? String(op.dgcaRank) : '',
    dgcaRankCheckedOn: op?.dgcaRankCheckedOn ?? '',
    dgcaRankSource: op?.dgcaRankSource ?? '',
    cancellationTerms: op?.cancellationTerms ?? '',
    notes: op?.notes ?? '',
  });
}

/** API body: empty text clears a field; the rank becomes a number. */
export function operatorBody(f: OperatorForm): Record<string, unknown> {
  const rank = f.dgcaRank.trim();
  return {
    legalName: f.legalName.trim(),
    brand: f.brand,
    nsopNo: f.nsopNo,
    nsopIssuedOn: f.nsopIssuedOn,
    cin: f.cin,
    gstin: f.gstin,
    bases: f.bases,
    website: f.website,
    safetyDisclosureUrl: f.safetyDisclosureUrl,
    sourceLink: f.sourceLink,
    dgcaRank: rank === '' ? null : Number.isInteger(Number(rank)) ? Number(rank) : rank,
    dgcaRankCheckedOn: f.dgcaRankCheckedOn,
    dgcaRankSource: f.dgcaRankSource,
    cancellationTerms: f.cancellationTerms,
    notes: f.notes,
  };
}

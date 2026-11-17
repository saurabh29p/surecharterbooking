import type { ValueTransformer } from 'typeorm';

/** bigint paise column ⇄ JS number, refusing values JS cannot hold exactly. */
export const paise: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => {
    if (value === null || value === undefined) return value;
    const n = Number(value);
    if (!Number.isSafeInteger(n)) throw new Error(`Money value out of range: ${value}`);
    return n;
  },
};

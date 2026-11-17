/** Entities whose every insert, update and delete is written to the audit log automatically. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- keyed by entity class
const registry = new Map<Function, { name: string; ignore: Set<string> }>();

/** Fields never worth logging as changes. */
const ALWAYS_IGNORED = ['createdAt', 'updatedAt'];

export function Audited(name: string, opts: { ignore?: string[] } = {}): ClassDecorator {
  return (target) => {
    registry.set(target, { name, ignore: new Set([...ALWAYS_IGNORED, ...(opts.ignore ?? [])]) });
  };
}

export function auditedInfo(target: unknown) {
  return typeof target === 'function' ? registry.get(target) : undefined;
}

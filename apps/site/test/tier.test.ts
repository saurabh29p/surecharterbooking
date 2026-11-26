import { describe, expect, it } from 'vitest';
import { decideTier, forcedTier, lower, type TierInput } from '../src/motion/tier';

const base: TierInput = { reducedMotion: false, saveData: false, webgl: true, mobile: false };

describe('device tier', () => {
  it('a capable desktop gets the full 3D', () => {
    expect(decideTier({ ...base, renderer: 'ANGLE (NVIDIA GeForce RTX 3060)', cores: 12, memory: 8 })).toBe('high');
    expect(decideTier({ ...base, renderer: 'Apple M2', cores: 8 })).toBe('high');
  });

  it('reduced motion, Save-Data and no WebGL always mean stills', () => {
    expect(decideTier({ ...base, reducedMotion: true })).toBe('low');
    expect(decideTier({ ...base, saveData: true })).toBe('low');
    expect(decideTier({ ...base, webgl: false })).toBe('low');
  });

  it('software renderers and old GPUs get stills', () => {
    expect(decideTier({ ...base, renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))' })).toBe('low');
    expect(decideTier({ ...base, renderer: 'llvmpipe (LLVM 15.0.7, 256 bits)' })).toBe('low');
    expect(decideTier({ ...base, renderer: 'Mali-T720', mobile: true })).toBe('low');
    expect(decideTier({ ...base, renderer: 'Adreno (TM) 308', mobile: true })).toBe('low');
  });

  it('very little memory, few cores or a failed frame check mean stills', () => {
    expect(decideTier({ ...base, memory: 1 })).toBe('low');
    expect(decideTier({ ...base, cores: 2 })).toBe('low');
    expect(decideTier({ ...base, frameMs: 45 })).toBe('low');
  });

  it('mid-range phones get the lighter scenes', () => {
    expect(decideTier({ ...base, renderer: 'Adreno (TM) 619', mobile: true, cores: 8, memory: 4 })).toBe('mid');
    expect(decideTier({ ...base, renderer: 'Mali-G57 MC2', mobile: true, cores: 8 })).toBe('mid');
    expect(decideTier({ ...base, renderer: 'Unknown GPU', mobile: true, memory: 4, cores: 8 })).toBe('mid');
    expect(decideTier({ ...base, cores: 4, memory: 8 })).toBe('mid');
    expect(decideTier({ ...base, frameMs: 26, cores: 8 })).toBe('mid');
  });

  it('a recent flagship phone gets the full 3D', () => {
    expect(decideTier({ ...base, renderer: 'Adreno (TM) 750', mobile: true, cores: 8, memory: 8 })).toBe('high');
    expect(decideTier({ ...base, renderer: 'Apple GPU', mobile: true, cores: 6 })).toBe('high');
  });

  it('?tier= overrides everything (testing only)', () => {
    expect(forcedTier('?tier=high')).toBe('high');
    expect(forcedTier('?a=1&tier=low')).toBe('low');
    expect(forcedTier('?tier=ultra')).toBeNull();
    expect(decideTier({ ...base, reducedMotion: true, forced: 'high' })).toBe('high');
  });

  it('steps down one tier at a time', () => {
    expect(lower('high')).toBe('mid');
    expect(lower('mid')).toBe('low');
    expect(lower('low')).toBe('low');
  });
});

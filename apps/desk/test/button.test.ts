import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SjButton from '../src/components/SjButton.vue';
import { useToast } from '../src/composables/toast';

describe('SjButton', () => {
  it('emits clicks normally', async () => {
    const w = mount(SjButton, { slots: { default: 'Save' } });
    await w.trigger('click');
    expect(w.emitted('click')).toHaveLength(1);
  });

  it('shows a spinner and new label while loading, and ignores clicks', async () => {
    const w = mount(SjButton, {
      props: { loading: true, loadingLabel: 'Saving…' },
      slots: { default: 'Save' },
    });
    expect(w.text()).toBe('Saving…');
    expect(w.find('.sj-spinner').exists()).toBe(true);
    expect(w.attributes('aria-busy')).toBe('true');
    await w.trigger('click');
    expect(w.emitted('click')).toBeUndefined();
  });

  it('explains why it is disabled, on hover and on tap', async () => {
    const { toasts } = useToast();
    toasts.splice(0);
    const reason = 'Verify operator documents first';
    const w = mount(SjButton, { props: { disabledReason: reason }, slots: { default: 'Choose' } });
    expect(w.attributes('title')).toBe(reason);
    expect(w.attributes('aria-disabled')).toBe('true');
    await w.trigger('click');
    expect(w.emitted('click')).toBeUndefined();
    expect(toasts.map((t) => t.message)).toContain(reason);
  });
});

describe('toasts', () => {
  it('clear stale errors on success and show at most two', () => {
    const t = useToast();
    t.toasts.splice(0);
    t.error('Please fix the highlighted fields');
    t.success('Saved');
    expect(t.toasts.map((x) => x.message)).toEqual(['Saved']);
    t.success('One');
    t.success('Two');
    expect(t.toasts.map((x) => x.message)).toEqual(['One', 'Two']);
  });
});

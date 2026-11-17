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

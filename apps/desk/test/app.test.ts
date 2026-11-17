import { mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { describe, expect, it } from 'vitest';
import App from '../src/App.vue';
import { makeRouter } from '../src/router';

describe('desk shell', () => {
  it('renders the brand and the Today screen with Indian money formats', async () => {
    const router = makeRouter(createMemoryHistory());
    await router.push('/');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    expect(wrapper.text()).toContain('ShubhJets');
    expect(wrapper.find('h1').text()).toBe('Today');
    expect(wrapper.text()).toContain('₹20,00,000');
    expect(wrapper.text()).toContain('₹24.0L');
  });
});

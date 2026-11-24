import { defineConfig } from 'wxt';

export default defineConfig({
  imports: false,
  // Zero-framework popup and content scripts; browsers supporting Vellum's
  // relative colors already support modulepreload.
  vite: () => ({
    build: { modulePreload: { polyfill: false } },
  }),
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    homepage_url: 'https://github.com/shqingda/vellum',
    minimum_chrome_version: '119',
    permissions: ['storage', 'activeTab'],
    commands: {
      'toggle-site': {
        suggested_key: { default: 'Alt+Shift+V', mac: 'Alt+Shift+V' },
        description: '__MSG_toggleSite__',
      },
    },
  },
});

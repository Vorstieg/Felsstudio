import '@testing-library/jest-dom/vitest';
import { addMessages, init } from 'svelte-i18n';
import en from './src/lib/i18n/locales/en.json';
import de from './src/lib/i18n/locales/de.json';

// Model the app's locale setup for errors emitted by editor state and actions.
addMessages('en', en);
addMessages('de', de);
init({ fallbackLocale: 'de', initialLocale: 'en' });

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { locale, _ } from 'svelte-i18n';
import { tick } from 'svelte';
import PitchComponentTestWrapper from '$lib/components/editor/topo-properties/routes/PitchComponentTestWrapper.svelte';
import CragHierarchyModal from '$lib/components/editor/crag/CragHierarchyModal.svelte';
import de from './locales/de.json';
import en from './locales/en.json';

afterEach(() => {
	cleanup();
	locale.set('en');
});

describe('editor localization', () => {
	it('translates line-style options while preserving the stored style identifiers', async () => {
		locale.set('de');
		render(PitchComponentTestWrapper, { pitch: { id: 'test-route', lineStyle: 'red' } });
		for (const [name, value] of [
			['Rot', 'red'],
			['Rot gestrichelt', 'redDashed'],
			['Rot gepunktet', 'redDotted'],
			['Variante', 'variant']
		]) {
			expect(screen.getByRole('option', { name, exact: true })).toHaveValue(value);
		}
		locale.set('en');
		await tick();
		expect(screen.getByRole('option', { name: 'Red', exact: true })).toHaveValue('red');
	});

	it('renders the hierarchy dialog in German and updates when the locale changes', async () => {
		locale.set('de');
		render(CragHierarchyModal, {
			parentPath: 'europe/austria',
			cragSlug: 'test-crag',
			knownFolders: new Set(['europe', 'europe/austria'])
		});
		expect(screen.getByRole('dialog')).toHaveAccessibleName('Einordnung in die Hierarchie');
		expect(screen.getByRole('button', { name: 'Fertig' })).toBeInTheDocument();
		expect(screen.getByRole('textbox', { name: 'Übergeordneter Ordner' })).toHaveValue(
			'europe/austria'
		);
		expect(screen.getByText('test-crag')).toBeInTheDocument();
		locale.set('en');
		await tick();
		expect(screen.getByRole('dialog')).toHaveAccessibleName('Hierarchy Placement');
		expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
	});

	it('formats German counts and interpolated filenames without English suffixes', () => {
		locale.set('de');
		const t = get(_);
		expect(t('editor.path_count', { values: { count: 1 } })).toBe('1 Weg');
		expect(t('editor.path_count', { values: { count: 3 } })).toBe('3 Wege');
		expect(t('editor.file_action_count', { values: { count: 2 } })).toBe('2 Dateiänderungen');
		expect(t('editor.delete_file', { values: { name: 'fels.json' } })).toBe(
			'fels.json wirklich löschen?'
		);
	});

	it('provides matching German and English editor keys', () => {
		expect(Object.keys(de.editor).sort()).toEqual(Object.keys(en.editor).sort());
		for (const value of Object.values(de.editor)) expect(value.trim()).not.toBe('');
	});
});

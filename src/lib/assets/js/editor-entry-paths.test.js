import { describe, expect, it } from 'vitest';
import { getCragEditorPath, getCragEntryPath, getTopoEditorPath } from './editor-entry-paths.js';

describe('crag entry paths', () => {
	it('uses the runtime entry path instead of persisted feature metadata', () => {
		const crag = {
			entryPath: 'austria/tirol/innsbruck',
			properties: { path: 'stale/location' }
		};

		expect(getCragEntryPath(crag)).toBe('austria/tirol/innsbruck');
		expect(getCragEditorPath(crag)).toBe('/crags/editor/austria/tirol/innsbruck');
		expect(getTopoEditorPath('/topos/2d/editor', crag)).toBe(
			'/topos/2d/editor/austria/tirol/innsbruck'
		);
	});

	it('keeps legacy metadata paths readable while old files are migrated on save', () => {
		expect(getCragEntryPath({ properties: { path: '/austria/tirol/' } })).toBe('austria/tirol');
	});
});

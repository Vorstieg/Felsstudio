// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createCragEditorController } from './crag-editor-controller.js';

describe('createCragEditorController', () => {
	it('keeps editor actions grouped by domain', () => {
		const onBack = vi.fn();
		const onAddSector = vi.fn();
		const onUpdateRoute = vi.fn();

		const controller = createCragEditorController({ onBack, onAddSector, onUpdateRoute });

		expect(controller.toolbar.onBack).toBe(onBack);
		expect(controller.sectors.onAddSector).toBe(onAddSector);
		expect(controller.routes.onUpdateRoute).toBe(onUpdateRoute);
		expect(controller.metadata).toBeDefined();
		expect(controller.history).toBeDefined();
	});
});

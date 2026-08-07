// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createToolInteraction } from './tool-interaction.js';

describe('createToolInteraction', () => {
	it('keeps the active tool for finish actions that continue drawing', () => {
		const setActiveTool = vi.fn();
		const interaction = createToolInteraction({
			getActiveTool: () => 'multipitch',
			setActiveTool,
			setOptionsOpen: vi.fn(),
			neutralTool: 'select'
		});
		const finish = { run: vi.fn(), keepActive: true };

		interaction.runAction(finish, { finish });

		expect(finish.run).toHaveBeenCalledOnce();
		expect(setActiveTool).not.toHaveBeenCalled();
	});

	it('switches to the neutral tool for ordinary finish actions', () => {
		const setActiveTool = vi.fn();
		const interaction = createToolInteraction({
			getActiveTool: () => 'route',
			setActiveTool,
			setOptionsOpen: vi.fn(),
			neutralTool: 'select'
		});
		const finish = { run: vi.fn() };

		interaction.runAction(finish, { finish });

		expect(setActiveTool).toHaveBeenCalledWith('select');
	});
});

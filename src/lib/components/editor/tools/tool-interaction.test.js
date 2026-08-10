// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createToolInteraction } from './tool-interaction.js';

describe('createToolInteraction', () => {
	it('keeps options closed on the first mobile tool press and opens them on the second', () => {
		let activeTool = 'select';
		const setOptionsOpen = vi.fn();
		const interaction = createToolInteraction({
			getActiveTool: () => activeTool,
			setActiveTool: (tool) => (activeTool = tool),
			setOptionsOpen,
			shouldOpenOptionsOnSelect: () => false,
			neutralTool: 'select'
		});
		const route = { id: 'route', hasOptions: true };

		interaction.selectTool(route);
		expect(activeTool).toBe('route');
		expect(setOptionsOpen).toHaveBeenLastCalledWith(false);

		interaction.selectTool(route);
		expect(setOptionsOpen).toHaveBeenLastCalledWith(true);
	});

	it('opens options on the first desktop tool press', () => {
		const setOptionsOpen = vi.fn();
		const interaction = createToolInteraction({
			getActiveTool: () => 'select',
			setActiveTool: vi.fn(),
			setOptionsOpen,
			shouldOpenOptionsOnSelect: () => true,
			neutralTool: 'select'
		});

		interaction.selectTool({ id: 'outline', hasOptions: true });

		expect(setOptionsOpen).toHaveBeenCalledWith(true);
	});

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

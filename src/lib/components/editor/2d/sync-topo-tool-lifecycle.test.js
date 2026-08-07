import { describe, expect, it, vi } from 'vitest';
import { syncTopoToolLifecycle } from './sync-topo-tool-lifecycle.js';

describe('syncTopoToolLifecycle', () => {
	it('deactivates the previous tool and clears selection for drawing tools', () => {
		const previousTool = { onDeactivate: vi.fn() };
		const currentTool = { onActivate: vi.fn() };
		const clearSelection = vi.fn();

		expect(
			syncTopoToolLifecycle({
				previousTool,
				currentTool,
				drawingTools: [currentTool],
				clearSelection
			})
		).toBe(currentTool);
		expect(previousTool.onDeactivate).toHaveBeenCalledOnce();
		expect(currentTool.onActivate).toHaveBeenCalledOnce();
		expect(clearSelection).toHaveBeenCalledOnce();
	});
});

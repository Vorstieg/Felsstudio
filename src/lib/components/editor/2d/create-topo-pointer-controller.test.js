import { describe, expect, it, vi } from 'vitest';
import { createTopoPointerController } from './create-topo-pointer-controller.js';

describe('createTopoPointerController', () => {
	it('starts a selection region on select-tool pointer down', () => {
		const editor = {
			ui: { activeTool: 'select', mobileSelectionMode: false },
			startInteraction: vi.fn()
		};
		const controller = createTopoPointerController({
			editor
		});

		controller.down({
			point: { x: 0.2, y: 0.3 },
			sourceEvent: { shiftKey: true },
			button: 0,
			isTouch: false,
			shiftKey: true
		});

		expect(editor.startInteraction).toHaveBeenCalledWith('selection-region', {
			start: { x: 0.2, y: 0.3 },
			end: { x: 0.2, y: 0.3 },
			mode: 'add'
		});
	});

	it('commits an open text composer before handling the click-away target', () => {
		const textTool = { editingPosition: [0.1, 0.2], commitEdit: vi.fn() };
		const onMouseDown = vi.fn();
		const stopPropagation = vi.fn();
		const controller = createTopoPointerController({
			editor: { ui: { activeTool: 'text' } },
			getCurrentTool: () => ({ onMouseDown }),
			textTool
		});

		controller.down({
			point: { x: 0.4, y: 0.5 },
			sourceEvent: { stopPropagation },
			button: 0,
			isTouch: false
		});

		expect(textTool.commitEdit).toHaveBeenCalledOnce();
		expect(stopPropagation).toHaveBeenCalledOnce();
		expect(onMouseDown).not.toHaveBeenCalled();
	});
});

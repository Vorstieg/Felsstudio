// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { initMapPointDragHandlers } from './map-point-drag-handlers.ts';

function toggle(initial) {
	let enabled = initial;
	return {
		disable: vi.fn(() => (enabled = false)),
		enable: vi.fn(() => (enabled = true)),
		isEnabled: () => enabled
	};
}

function fakeMap({ touchEnabled = true } = {}) {
	const handlers = new Map();
	const map = {
		dragPan: toggle(true),
		touchZoomRotate: toggle(touchEnabled),
		canvas: { style: {} },
		getCanvas() {
			return this.canvas;
		},
		on(...args) {
			const handler = args.at(-1);
			handlers.set(args.slice(0, -1).join(':'), handler);
		},
		off(...args) {
			handlers.delete(args.slice(0, -1).join(':'));
		}
	};
	return { map, fire: (key, event = {}) => handlers.get(key)?.(event) };
}

describe('initMapPointDragHandlers', () => {
	it('leaves map panning alone when the active mode cannot drag', () => {
		const { map, fire } = fakeMap();
		initMapPointDragHandlers({
			map,
			layers: ['handle'],
			canDrag: () => false,
			getDragState: () => ({ id: 1 })
		});

		fire('mousedown:handle', { preventDefault: vi.fn() });
		expect(map.dragPan.disable).not.toHaveBeenCalled();
		expect(map.dragPan.isEnabled()).toBe(true);
	});

	it('restores prior gestures and cancels a touch drag without committing', () => {
		const { map, fire } = fakeMap({ touchEnabled: false });
		const onDragEnd = vi.fn();
		const onDragCancel = vi.fn();
		initMapPointDragHandlers({
			map,
			layers: ['handle'],
			getDragState: () => ({ id: 1 }),
			onDragEnd,
			onDragCancel
		});

		fire('touchstart:handle', { originalEvent: { stopPropagation: vi.fn() } });
		expect(map.dragPan.isEnabled()).toBe(false);
		fire('touchcancel', {});

		expect(onDragCancel).toHaveBeenCalledTimes(1);
		expect(onDragEnd).not.toHaveBeenCalled();
		expect(map.dragPan.isEnabled()).toBe(true);
		expect(map.touchZoomRotate.isEnabled()).toBe(false);
	});
});

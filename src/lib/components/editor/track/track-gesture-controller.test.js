import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrackGestureController } from './track-gesture-controller.ts';

function fixture() {
	const canvas = document.createElement('canvas');
	document.body.append(canvas);
	let captured = false;
	canvas.setPointerCapture = () => {
		captured = true;
	};
	canvas.hasPointerCapture = () => captured;
	canvas.releasePointerCapture = () => {
		captured = false;
	};
	const capability = () => {
		let enabled = true;
		return {
			isEnabled: () => enabled,
			enable: () => {
				enabled = true;
			},
			disable: () => {
				enabled = false;
			}
		};
	};
	const map = {
		getCanvas: () => canvas,
		project: ([x, y]) => ({ x, y }),
		unproject: ([x, y]) => ({ lng: x, lat: y }),
		dragPan: capability(),
		touchZoomRotate: capability()
	};
	const points = [
		[0, 0],
		[100, 0],
		[200, 0]
	];
	const options = {
		map,
		getState: () => ({
			enabled: true,
			canEditPoints: true,
			points,
			selectedIndexes: [],
			boxSelecting: false,
			splitCoordinate: null
		}),
		snapshot: () => ({ points }),
		onTapPoint: vi.fn(),
		onTapMidpoint: vi.fn(),
		onPreviewPoints: vi.fn(),
		onCommitPoints: vi.fn(),
		onBoxStart: vi.fn(),
		onBoxEnd: vi.fn(),
		onBoxConfirm: vi.fn(),
		onBoxCancel: vi.fn(),
		onSplitPreview: vi.fn(),
		onDragStart: vi.fn(),
		onDragEnd: vi.fn()
	};
	const controller = createTrackGestureController(options);
	const pointer = (type, x, y = 0) => {
		const event = new MouseEvent(type, {
			clientX: x,
			clientY: y,
			bubbles: true,
			cancelable: true,
			button: 0
		});
		Object.defineProperties(event, { pointerType: { value: 'touch' }, pointerId: { value: 1 } });
		canvas.dispatchEvent(event);
	};
	return { controller, options, map, pointer, captured: () => captured };
}
afterEach(() => document.body.replaceChildren());

describe('track gesture lifecycle', () => {
	it('cancelling a drag restores map gestures and capture without committing geometry', () => {
		const { controller, options, map, pointer, captured } = fixture();
		pointer('pointerdown', 100);
		pointer('pointermove', 110, 20);
		expect(captured()).toBe(true);
		expect(map.dragPan.isEnabled()).toBe(false);
		controller.cancel();
		expect(captured()).toBe(false);
		expect(map.dragPan.isEnabled()).toBe(true);
		expect(map.touchZoomRotate.isEnabled()).toBe(true);
		expect(options.onCommitPoints).not.toHaveBeenCalled();
		expect(options.onPreviewPoints).toHaveBeenLastCalledWith(null);
		controller.destroy();
	});
	it('suppresses the trailing click once and treats taps separately from drags', () => {
		const { controller, options, pointer } = fixture();
		pointer('pointerdown', 100);
		pointer('pointermove', 102, 1);
		pointer('pointerup', 102, 1);
		expect(options.onTapPoint).toHaveBeenCalledWith(1);
		expect(options.onCommitPoints).not.toHaveBeenCalled();
		expect(controller.consumeClick({ x: 102, y: 1 })).toBe(true);
		expect(controller.consumeClick({ x: 102, y: 1 })).toBe(false);
		controller.destroy();
	});
	it('destroying during a drag restores initially disabled capabilities and removes listeners', () => {
		const { controller, options, map, pointer } = fixture();
		map.dragPan.disable();
		map.touchZoomRotate.disable();
		pointer('pointerdown', 100);
		pointer('pointermove', 110, 20);
		controller.destroy();
		expect(map.dragPan.isEnabled()).toBe(false);
		expect(map.touchZoomRotate.isEnabled()).toBe(false);
		options.onTapPoint.mockClear();
		options.onPreviewPoints.mockClear();
		pointer('pointerdown', 100);
		pointer('pointermove', 120, 30);
		pointer('pointerup', 120, 30);
		expect(options.onTapPoint).not.toHaveBeenCalled();
		expect(options.onPreviewPoints).not.toHaveBeenCalled();
		expect(options.onCommitPoints).not.toHaveBeenCalled();
	});
});

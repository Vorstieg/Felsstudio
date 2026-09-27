// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { createCanvasInput } from './create-canvas-input.svelte.ts';

describe('createCanvasInput', () => {
	let canvasInput;
	afterEach(() => canvasInput?.destroy());

	it('normalizes a direct Touch used by object controls', () => {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		const content = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		svg.append(content);
		svg.getBoundingClientRect = () => ({ width: 1000, height: 500 });
		svg.createSVGPoint = () => ({
			x: 0,
			y: 0,
			matrixTransform() {
				return { x: this.x, y: this.y };
			}
		});
		svg.getScreenCTM = () => ({ inverse: () => ({}) });
		canvasInput = createCanvasInput({
			getAspectRatio: () => 2,
			getGesturePolicy: () => ({}),
			onInput: {}
		});
		canvasInput.setElements({ svg, content });

		const touch = { identifier: 1, clientX: 250, clientY: 125 };
		expect(canvasInput.normalizeEvent(touch)).toMatchObject({
			point: { x: 0.25, y: 0.25 },
			sourceEvent: touch
		});
	});
});

// @vitest-environment jsdom

import { select } from 'd3-selection';
import { describe, expect, it, vi } from 'vitest';
import { renderTextLabelsLayer } from './render-text-labels-layer.js';

function renderLayer(label, overrides = {}) {
	const svg = select(document.body).append('svg');
	const text = svg.append('g');
	renderTextLabelsLayer({
		layers: { text },
		topo: { textLabels: [label] },
		activeTool: 'select',
		baseWidth: 1000,
		baseHeight: 600,
		isSelected: () => false,
		canvasInput: { trackTouch: vi.fn() },
		...overrides
	});
	return svg.node();
}

describe('renderTextLabelsLayer', () => {
	it('renders defaults, escaped multiline tspans, halo, hit region, and test hook', () => {
		const svg = renderLayer({
			id: 'text-1',
			text: '<Main>\nSouth & Face',
			position2D: [0.5, 0.25]
		});
		const group = svg.querySelector('[data-testid="topo-object-text-text-1"]');
		const text = group.querySelector('text');
		const lines = [...text.querySelectorAll('tspan')];
		expect(group.getAttribute('transform')).toContain('translate(500, 150)');
		expect(lines.map((line) => line.textContent)).toEqual(['<Main>', 'South & Face']);
		expect(lines[1]).toHaveAttribute('dy', '1.2em');
		expect(text).toHaveAttribute('font-size', '24');
		expect(text).toHaveAttribute('font-weight', '600');
		expect(text).toHaveAttribute('text-anchor', 'middle');
		expect(text).toHaveAttribute('paint-order', 'stroke fill');
		expect(group.querySelector('.text-hit-region')).toBeTruthy();
	});

	it('applies custom styling and deterministic selection bounds', () => {
		const svg = renderLayer(
			{
				id: 'custom',
				text: 'Right',
				position2D: [0.2, 0.3],
				fontSize2D: 42,
				color: '#dc2626',
				fontWeight: 700,
				textAlign2D: 'right'
			},
			{ isSelected: () => true }
		);
		const text = svg.querySelector('.text-label');
		expect(text).toHaveAttribute('font-size', '42');
		expect(text).toHaveAttribute('fill', '#dc2626');
		expect(text).toHaveAttribute('text-anchor', 'end');
		expect(svg.querySelector('.text-selection')).toHaveAttribute('stroke', '#2563eb');
	});
});

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { renderTopoSvg } from '@vorstieg/topo-renderer';

describe('renderTopoSvg text labels', () => {
	it('renders annotations above symbols with multiline layout and styling defaults', () => {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		svg.append(group);
		renderTopoSvg({
			gElement: group,
			topo: {
				fixPoints: [],
				outlines: [],
				textLabels: [{ id: 'label', text: 'One\nTwo', position2D: [0.1, 0.2] }]
			},
			routes: [],
			baseWidth: 1000,
			baseHeight: 600
		});

		const layers = [...group.children].map((node) => node.getAttribute('class'));
		expect(layers.indexOf('text-layer')).toBeGreaterThan(layers.indexOf('symbols-layer'));
		const text = group.querySelector('.text-label');
		expect([...text.querySelectorAll('tspan')].map((line) => line.textContent)).toEqual([
			'One',
			'Two'
		]);
		expect(text).toHaveAttribute('font-size', '24');
		expect(text).toHaveAttribute('fill', '#111827');
		expect(text).toHaveAttribute('paint-order', 'stroke fill');
	});

	it('maps custom alignment and styling', () => {
		const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		renderTopoSvg({
			gElement: group,
			topo: {
				fixPoints: [],
				outlines: [],
				textLabels: [
					{
						id: 'custom',
						text: 'Custom',
						position2D: [0.2, 0.3],
						fontSize2D: 36,
						color: '#dc2626',
						fontWeight: 700,
						textAlign2D: 'right'
					}
				]
			},
			routes: [],
			baseWidth: 1000,
			baseHeight: 600
		});
		const text = group.querySelector('.text-label');
		expect(text).toHaveAttribute('font-size', '36');
		expect(text).toHaveAttribute('font-weight', '700');
		expect(text).toHaveAttribute('fill', '#dc2626');
		expect(text).toHaveAttribute('text-anchor', 'end');
	});
});

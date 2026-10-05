// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { renderTopoSvg } from '@vorstieg/topo-renderer';

describe('renderTopoSvg', () => {
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

	it('stacks closed outlines over earlier strokes and keeps custom fills', () => {
		const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		const back = {
			id: 'back',
			points2D: [
				[0.1, 0.1],
				[0.8, 0.1],
				[0.8, 0.8],
				[0.1, 0.1]
			]
		};
		const front = {
			id: 'front',
			points2D: [
				[0.2, 0.2],
				[0.9, 0.2],
				[0.9, 0.9],
				[0.2, 0.2]
			],
			fillColor: '#ff0000',
			fillOpacity: 0.3
		};
		const open = {
			id: 'open',
			points2D: [
				[0.1, 0.9],
				[0.9, 0.9]
			]
		};
		const draw = (outlines) =>
			renderTopoSvg({
				gElement: group,
				topo: { outlines },
				baseWidth: 1000,
				baseHeight: 600
			});

		draw([back, front, open]);
		const outlinesLayer = group.querySelector('.outlines-layer');
		const groups = [...outlinesLayer.children];
		expect(groups.map((node) => node.__data__.id)).toEqual(['back', 'front', 'open']);
		expect([...groups[0].children].map((node) => node.getAttribute('class'))).toEqual([
			'outline-background',
			'rock-outline'
		]);
		expect([...groups[1].children].map((node) => node.getAttribute('class'))).toEqual([
			'outline-background',
			'outline-fill',
			'rock-outline'
		]);
		expect(groups[1].querySelector('.outline-background')).toHaveAttribute('fill', '#fff');
		expect(groups[1].querySelector('.outline-fill')).toHaveAttribute('fill-opacity', '0.3');
		expect([...groups[2].children].map((node) => node.getAttribute('class'))).toEqual([
			'rock-outline'
		]);

		draw([front, back]);
		expect([...outlinesLayer.children].map((node) => node.__data__.id)).toEqual(['front', 'back']);
		expect(outlinesLayer.querySelectorAll('.outline-background')).toHaveLength(2);
	});
});

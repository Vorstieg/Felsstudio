// @vitest-environment jsdom

import { select } from 'd3-selection';
import { describe, expect, it } from 'vitest';
import { renderOutlinesLayer } from './render-outlines-layer.ts';

describe('renderOutlinesLayer', () => {
	it('stacks overlapping white slabs like the topo drawer and clears flat legacy paths', () => {
		const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		const layer = select(group);
		layer.append('path').attr('class', 'outline-fill').attr('fill', '#fff');
		const slab = (id, points2D) => ({
			id,
			lineStyle: 'rock',
			points2D: [...points2D, points2D[0]],
			fillColor: '#ffffff',
			fillOpacity: 1,
			closed: true
		});
		const outlines = [
			slab('outline-57', [
				[0.55188, 0.78701],
				[0.60287, 0.78701],
				[0.59214, 0.90567],
				[0.54114, 0.90567]
			]),
			slab('outline-58', [
				[0.57247, 0.7045],
				[0.65131, 0.7045],
				[0.63471, 0.83101],
				[0.55587, 0.83101]
			]),
			slab('outline-59', [
				[0.59051, 0.67826],
				[0.62693, 0.67826],
				[0.61926, 0.7597],
				[0.58284, 0.7597]
			])
		];
		const render = (currentOutlines) =>
			renderOutlinesLayer({
				layers: { outlines: layer },
				topo: { outlines: currentOutlines },
				renderModel: { outlines: { handles: [], midpoints: [], semanticHandles: [] } },
				activeTool: 'select',
				baseWidth: 1000,
				baseHeight: 667,
				canvasInput: {},
				editTools: null,
				hideControlPoints: false,
				isSelected: (type, id) => type === 'outline' && id === 'outline-58',
				onObjectMouseDown: () => {},
				onObjectClick: () => {}
			});

		render(outlines);
		const groups = [...group.children];
		expect(groups.map((element) => element.__data__.id)).toEqual([
			'outline-57',
			'outline-58',
			'outline-59'
		]);
		for (const element of groups) {
			expect([...element.children].map((part) => part.getAttribute('class'))).toEqual([
				'outline-background',
				'outline-fill',
				'cursor-move rock-outline',
				'outline-hit-area hit-area cursor-pointer'
			]);
		}
		expect(groups[1].querySelector('.rock-outline')).toHaveAttribute('stroke', '#3b82f6');
		expect(group.querySelectorAll(':scope > path')).toHaveLength(0);

		render([outlines[2], outlines[1], outlines[0]]);
		expect([...group.children].map((element) => element.__data__.id)).toEqual([
			'outline-59',
			'outline-58',
			'outline-57'
		]);
	});
});

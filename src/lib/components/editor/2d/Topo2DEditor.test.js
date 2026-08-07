import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import fixture from '../../../../../tests/fixtures/2d/mixed-topo.json';
import Topo2DEditorTestWrapper from './Topo2DEditorTestWrapper.svelte';

describe('Topo2DEditor', () => {
	beforeEach(() => {
		vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
			width: 1000,
			height: 667,
			top: 0,
			left: 0,
			right: 1000,
			bottom: 667
		});
	});

	it('mounts the fixture and renders the canvas plus semantic object hooks', async () => {
		render(Topo2DEditorTestWrapper, { topo: structuredClone(fixture) });

		expect(screen.getByTestId('topo-2d-editor')).toBeInTheDocument();
		expect(screen.getByTestId('topo-2d-canvas')).toHaveAttribute('aria-label', 'Topo Editor');
		await vi.waitFor(() => {
			expect(screen.getByTestId('topo-object-route-route-1-main')).toBeInTheDocument();
		});
		expect(screen.getAllByTestId('topo-object-outline-outline-polyline')).toHaveLength(2);
		expect(screen.getByTestId('topo-object-symbol-symbol-1')).toBeInTheDocument();
		expect(screen.getByTestId('topo-object-text-text-1')).toBeInTheDocument();
	});
});

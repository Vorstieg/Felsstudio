import { describe, expect, it, vi } from 'vitest';
import { createTopoRenderEditServices } from './create-topo-render-edit-services.js';

describe('createTopoRenderEditServices', () => {
	it('exposes capability adapters without exposing tool objects', () => {
		const handleRouteDown = vi.fn();
		const services = createTopoRenderEditServices({
			route: { id: 'routeEdit', handleRouteDown }
		});

		services.route.handleRouteDown('event', 'target', 'canvas');

		expect(services.route).not.toBeUndefined();
		expect(handleRouteDown).toHaveBeenCalledWith('event', 'target', 'canvas');
		expect(services.route.id).toBe('routeEdit');
	});
});

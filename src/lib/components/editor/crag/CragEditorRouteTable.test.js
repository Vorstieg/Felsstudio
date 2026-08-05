import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CragEditorRouteTable from './CragEditorRouteTable.svelte';

const routes = [1, 2, 3, 4, 5].map((id) => ({
	document: {
		path: 'crag/routes.json',
		data: {
			paths: {
				features: [
					{
						id: `path-${id}`,
						geometry: {
							type: 'LineString',
							coordinates: [
								[0, 0],
								[1, 1]
							]
						}
					}
				]
			}
		}
	},
	route: {
		id: `route-${id}`,
		name: `Route ${id}`,
		type: 'sport',
		pathRefs: [{ pathId: `path-${id}` }]
	}
}));

describe('CragEditorRouteTable', () => {
	it('renders routes, counts paths, and expands the list', async () => {
		const user = userEvent.setup();
		render(CragEditorRouteTable, { routes });

		expect(screen.getByRole('button', { name: 'Route 1' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Route 4' })).not.toBeInTheDocument();
		expect(screen.getAllByText('1')).toHaveLength(3);

		await user.click(screen.getByRole('button', { name: 'Show 2 more routes' }));
		expect(screen.getByRole('button', { name: 'Route 4' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Show fewer routes' })).toBeInTheDocument();
	});

	it('delegates route selection and deletion', async () => {
		const user = userEvent.setup();
		const onSelectRoute = vi.fn();
		const onDeleteRoute = vi.fn();
		render(CragEditorRouteTable, { routes: routes.slice(0, 1), onSelectRoute, onDeleteRoute });

		await user.click(screen.getByRole('button', { name: 'Route 1' }));
		await user.click(screen.getByTitle('Delete route'));

		expect(onSelectRoute).toHaveBeenCalledWith('crag/routes.json', 'route-1');
		expect(onDeleteRoute).toHaveBeenCalledWith('crag/routes.json', 'route-1');
	});
});

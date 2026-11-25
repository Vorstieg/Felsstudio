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
	it('renders routes, role pills for attached paths, and expands the list', async () => {
		const user = userEvent.setup();
		render(CragEditorRouteTable, { routes });

		expect(screen.getByRole('button', { name: 'Route 1' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Route 4' })).not.toBeInTheDocument();
		expect(screen.getAllByText('Climb')).toHaveLength(3);

		await user.click(screen.getByRole('button', { name: 'Show 2 more routes' }));
		expect(screen.getByRole('button', { name: 'Route 4' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Show fewer routes' })).toBeInTheDocument();
		expect(screen.getAllByText('Climb')).toHaveLength(5);
	});

	it('renders color-coded role pills for multiple roles and a dash when empty', () => {
		const multiRoleRoutes = [
			{
				document: {
					path: 'crag/routes.json',
					data: {
						paths: {
							features: [
								{
									id: 'p1',
									geometry: {
										type: 'LineString',
										coordinates: [
											[0, 0],
											[1, 1]
										]
									}
								},
								{
									id: 'p2',
									geometry: {
										type: 'LineString',
										coordinates: [
											[1, 1],
											[2, 2]
										]
									}
								},
								{
									id: 'p3',
									geometry: {
										type: 'LineString',
										coordinates: [
											[2, 2],
											[3, 3]
										]
									}
								}
							]
						}
					}
				},
				route: {
					id: 'r-multi',
					name: 'Multi Path Route',
					type: 'multi-pitch',
					pathRefs: [
						{ pathId: 'p1', role: 'approach' },
						{ pathId: 'p2', role: 'main' },
						{ pathId: 'p3', role: 'descent' }
					]
				}
			},
			{
				document: {
					path: 'crag/routes.json',
					data: { paths: { features: [] } }
				},
				route: {
					id: 'r-empty',
					name: 'Empty Route',
					type: 'sports-climbing',
					pathRefs: []
				}
			}
		];
		render(CragEditorRouteTable, { routes: multiRoleRoutes });
		expect(screen.getByText('Approach')).toBeInTheDocument();
		expect(screen.getByText('Climb')).toBeInTheDocument();
		expect(screen.getByText('Descent')).toBeInTheDocument();
		expect(screen.getByText('–')).toBeInTheDocument();
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

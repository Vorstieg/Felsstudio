import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import CragFlightPlanPanel from './CragFlightPlanPanel.svelte';
import { downloadFlightPlanKmz } from '$lib/assets/js/flight-plan-kml.ts';

vi.mock('$lib/assets/js/flight-plan-kml.ts', () => ({ downloadFlightPlanKmz: vi.fn() }));

vi.mock('$lib/assets/js/flight-plan-generator.ts', () => ({
	generateFlightPlan: vi.fn(() => {
		throw new Error('Terrain unavailable');
	})
}));
afterEach(cleanup);

it('restores a generated mission after remounting and clears its preview on a failed regeneration', async () => {
	const plan = {
		previewWaypointIndex: 3,
		waypoints: [{ index: 3, action: 'startInterval', altitude: 20 }],
		wallDetection: { coordinates: [] },
		metadata: {
			pattern: 'facade-grid',
			convergentPasses: 1,
			sectorMinimumElevation: 400,
			sectorMaximumElevation: 420,
			captureHeightMeters: 20,
			minimumFaceDistanceMeters: 2,
			minimumGroundClearanceMeters: 5
		}
	};
	const onPlanGenerated = vi.fn();
	const props = {
		entry: {
			geometry: {
				type: 'Polygon',
				coordinates: [
					[
						[16, 48],
						[16.001, 48],
						[16, 48.001],
						[16, 48]
					]
				]
			}
		},
		plan,
		onPlanGenerated,
		map: { queryTerrainElevation: () => 400 }
	};
	const first = render(CragFlightPlanPanel, { props });
	await expect(screen.findByRole('button', { name: /Download/ })).resolves.toBeTruthy();
	first.unmount();
	render(CragFlightPlanPanel, { props });
	expect(screen.getByRole('button', { name: /Download/ })).toBeTruthy();
	await fireEvent.click(screen.getByRole('button', { name: /Generate/ }));
	expect(onPlanGenerated).toHaveBeenCalledWith(null);
	expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
	expect(screen.getByText('Terrain unavailable')).toBeTruthy();
});

it('requires launch elevation for download, preserves it on remount, and reports export failures', async () => {
	vi.mocked(downloadFlightPlanKmz).mockReset();
	const plan = {
		waypoints: [],
		wallDetection: { coordinates: [] },
		metadata: {
			sectorMinimumElevation: 700, sectorMaximumElevation: 720,
			captureHeightMeters: 20, minimumFaceDistanceMeters: 2, minimumGroundClearanceMeters: 3
		}
	};
	const onPlanGenerated = vi.fn();
	const view = render(CragFlightPlanPanel, { props: { plan, onPlanGenerated } });
	await fireEvent.click(screen.getByRole('button', { name: /Download/ }));
	expect(downloadFlightPlanKmz).not.toHaveBeenCalled();
	expect(screen.getByText(/Enter the launch elevation in metres AMSL before exporting/)).toBeTruthy();
	await fireEvent.input(screen.getByLabelText('Launch elevation (m AMSL)'), { target: { value: '680' } });
	const updatedPlan = onPlanGenerated.mock.lastCall[0];
	expect(updatedPlan.metadata.startElevation).toBe(680);
	await fireEvent.click(screen.getByRole('button', { name: /Download/ }));
	expect(downloadFlightPlanKmz).toHaveBeenCalledWith(updatedPlan);
	view.unmount();
	render(CragFlightPlanPanel, { props: { plan: updatedPlan, onPlanGenerated } });
	expect(screen.getByLabelText('Launch elevation (m AMSL)').value).toBe('680');
	vi.mocked(downloadFlightPlanKmz).mockRejectedValueOnce(new Error('Export failed'));
	await fireEvent.click(screen.getByRole('button', { name: /Download/ }));
	await expect(screen.findByText('Export failed')).resolves.toBeTruthy();
});

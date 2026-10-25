import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import CragFlightPlanPanel from './CragFlightPlanPanel.svelte';
import { generateFlightPlanInWorker } from '$lib/assets/js/flight-plan-client.ts';
import { downloadFlightPlanKmz } from '$lib/assets/js/flight-plan-kml.ts';

vi.mock('$lib/assets/js/flight-plan-kml.ts', () => ({ downloadFlightPlanKmz: vi.fn() }));

vi.mock('$lib/assets/js/flight-plan-client.ts', () => ({
	generateFlightPlanInWorker: vi.fn().mockRejectedValue(new Error('Terrain unavailable'))
}));
afterEach(cleanup);

it('restores a generated mission after remounting and clears its preview on a failed regeneration', async () => {
	const plan = {
		previewWaypointIndex: 3,
		waypoints: [
			{ index: 3, rowBoundary: 'start', altitude: 20 },
			{ index: 4, rowBoundary: 'single', altitude: 20 }
		],
		wallDetection: { coordinates: [] },
		metadata: {
			pattern: 'facade-grid',
			coveragePasses: 1,
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
		onPlanGenerated
	};
	const first = render(CragFlightPlanPanel, { props });
	await expect(screen.findByRole('button', { name: /Download/ })).resolves.toBeTruthy();
	first.unmount();
	render(CragFlightPlanPanel, { props });
	expect(screen.getByRole('button', { name: /Download/ })).toBeTruthy();
	expect(screen.getByRole('option', { name: 'Row 2' }).value).toBe('4');
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
			sectorMinimumElevation: 700,
			sectorMaximumElevation: 720,
			captureHeightMeters: 20,
			minimumFaceDistanceMeters: 2,
			minimumGroundClearanceMeters: 3
		}
	};
	const onPlanGenerated = vi.fn();
	const view = render(CragFlightPlanPanel, { props: { plan, onPlanGenerated } });
	await fireEvent.click(screen.getByRole('button', { name: /Download/ }));
	expect(downloadFlightPlanKmz).not.toHaveBeenCalled();
	expect(
		screen.getByText(/Enter the launch elevation in metres AMSL before exporting/)
	).toBeTruthy();
	await fireEvent.input(screen.getByLabelText('Launch elevation (m AMSL)'), {
		target: { value: '680' }
	});
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

it('cancels pending calculations and ignores their late results', async () => {
	let resolve;
	let signal;
	vi.mocked(generateFlightPlanInWorker).mockImplementationOnce((_geometry, _options, request) => {
		signal = request.signal;
		request.onProgress('Calculating flight path…');
		return new Promise((done) => {
			resolve = done;
		});
	});
	const onPlanGenerated = vi.fn();
	const view = render(CragFlightPlanPanel, {
		props: {
			entry: {
				geometry: {
					type: 'Polygon',
					coordinates: [
						[
							[11, 47],
							[11.001, 47],
							[11, 47.001],
							[11, 47]
						]
					]
				}
			},
			onPlanGenerated
		}
	});
	await fireEvent.click(screen.getByRole('button', { name: /Generate/ }));
	expect(screen.getByRole('status').textContent).toBe('Calculating flight path…');
	expect(screen.getByRole('button', { name: /Generate/ }).disabled).toBe(true);
	await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
	expect(signal.aborted).toBe(true);
	resolve({ waypoints: [] });
	await Promise.resolve();
	expect(onPlanGenerated).not.toHaveBeenCalled();
	expect(screen.queryByRole('status')).toBeNull();
	view.unmount();
});

it('aborts background work when the panel is unmounted', async () => {
	let signal;
	vi.mocked(generateFlightPlanInWorker).mockImplementationOnce((_geometry, _options, request) => {
		signal = request.signal;
		return new Promise(() => {});
	});
	const view = render(CragFlightPlanPanel, {
		props: {
			entry: {
				geometry: {
					type: 'Polygon',
					coordinates: [
						[
							[11, 47],
							[11.001, 47],
							[11, 47.001],
							[11, 47]
						]
					]
				}
			}
		}
	});
	await fireEvent.click(screen.getByRole('button', { name: /Generate/ }));
	view.unmount();
	expect(signal.aborted).toBe(true);
});

it('keeps an incomplete plan inspectable and blocks its download', () => {
	const plan = {
		waypoints: [],
		wallDetection: { coordinates: [] },
		metadata: {
			coverageStatus: 'partial',
			coverageTargetCount: 12,
			coveredTargetCount: 10,
			crestTargetCount: 4,
			coveredCrestTargetCount: 2,
			detailPhotoCount: 3,
			startElevation: 680,
			standOffMeters: 9,
			clearanceMarginMeters: 1,
			sectorMinimumElevation: 700,
			sectorMaximumElevation: 720,
			captureHeightMeters: 20,
			minimumFaceDistanceMeters: 2,
			minimumGroundClearanceMeters: 3
		}
	};
	render(CragFlightPlanPanel, { props: { plan } });
	expect(screen.getByRole('button', { name: /Download/ }).disabled).toBe(true);
	expect(screen.getByRole('alert').textContent).toMatch(/not fully covered/);
	expect(screen.getByText('10/12')).toBeTruthy();
	expect(screen.getByText('2/4')).toBeTruthy();
});

it('passes each detail target without overriding optical photo spacing', async () => {
	render(CragFlightPlanPanel, {
		props: {
			entry: {
				geometry: {
					type: 'Polygon',
					coordinates: [
						[
							[11, 47],
							[11.001, 47],
							[11, 47.001],
							[11, 47]
						]
					]
				}
			}
		}
	});
	for (const [detail, targetGsdCm] of [
		['standard', 1],
		['high', 0.7],
		['topo', 0.5]
	]) {
		await fireEvent.change(screen.getByLabelText('Detail'), { target: { value: detail } });
		await fireEvent.click(screen.getByRole('button', { name: /Generate/ }));
		const options = vi.mocked(generateFlightPlanInWorker).mock.lastCall[1];
		expect(options.targetGsdCm).toBe(targetGsdCm);
		expect(options.minimumFaceDistanceMeters).toBe(2);
		expect(options.pointSpacingMeters).toBeUndefined();
		expect(options.stripSpacingMeters).toBeUndefined();
	}
});

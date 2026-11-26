// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ALPINE_TRACE_PROFILE,
	getRoutedSegment,
	resetRoutingProfileCache
} from './track-drawing.ts';

afterEach(() => {
	resetRoutingProfileCache();
	vi.unstubAllGlobals();
});

describe('BRouter alpine and via ferrata track routing', () => {
	it('uploads the alpine-trace profile once, caches it, and strips 3D elevation coordinates', async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				calls.push({ url, init });
				if (url.endsWith('/profile')) {
					return {
						ok: true,
						json: async () => ({ profileid: 'custom_alpine_1' })
					};
				}
				return {
					ok: true,
					json: async () => ({
						type: 'FeatureCollection',
						features: [
							{
								type: 'Feature',
								geometry: {
									type: 'LineString',
									coordinates: [
										[13.477, 47.529, 1520.5],
										[13.478, 47.527, 1680.0],
										[13.479, 47.525, 1850.25]
									]
								}
							}
						]
					})
				};
			})
		);

		const first = await getRoutedSegment([13.477, 47.529], [13.479, 47.525]);
		const second = await getRoutedSegment([13.479, 47.525], [13.48, 47.524]);

		expect(first).toEqual([
			[13.477, 47.529],
			[13.478, 47.527],
			[13.479, 47.525]
		]);
		expect(second).toHaveLength(3);
		expect(calls.filter((call) => call.url.endsWith('/profile'))).toHaveLength(1);
		expect(calls[0].init?.method).toBe('POST');
		expect(calls[0].init?.body).toBe(ALPINE_TRACE_PROFILE);
		expect(ALPINE_TRACE_PROFILE).toContain('highway=via_ferrata');
		expect(ALPINE_TRACE_PROFILE).toContain('sac_scale');
		expect(calls[1].url).toContain('profile=custom_alpine_1');
		expect(calls[1].url).toContain('format=geojson');
		expect(calls[1].url).toContain(encodeURIComponent('13.477,47.529|13.479,47.525'));
	});

	it('re-uploads the custom profile once when a cached profile ID expires', async () => {
		let profileCount = 0;
		let routeAttempts = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (url.endsWith('/profile')) {
					profileCount += 1;
					return { ok: true, json: async () => ({ profileid: `custom_${profileCount}` }) };
				}
				routeAttempts += 1;
				if (routeAttempts === 2) {
					return { ok: false, status: 500 };
				}
				return {
					ok: true,
					json: async () => ({
						features: [
							{
								geometry: {
									coordinates: [
										[16.05, 47.82, 500],
										[16.06, 47.83, 700]
									]
								}
							}
						]
					})
				};
			})
		);

		await getRoutedSegment([16.05, 47.82], [16.06, 47.83]);
		const retried = await getRoutedSegment([16.05, 47.82], [16.06, 47.83]);

		expect(profileCount).toBe(2);
		expect(routeAttempts).toBe(3);
		expect(retried).toEqual([
			[16.05, 47.82],
			[16.06, 47.83]
		]);
	});

	it('rejects unusable route responses and forwards AbortSignal to route requests', async () => {
		const controller = new AbortController();
		let seenSignal: AbortSignal | null | undefined;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				if (url.endsWith('/profile')) {
					return { ok: true, json: async () => ({ profileid: 'custom_1' }) };
				}
				seenSignal = init?.signal;
				return {
					ok: true,
					json: async () => ({ features: [{ geometry: { coordinates: [[16.05, 47.82]] } }] })
				};
			})
		);

		await expect(
			getRoutedSegment([16.05, 47.82], [16.05, 47.82], controller.signal)
		).rejects.toThrow('Routing unavailable');
		expect(seenSignal).toBe(controller.signal);
	});
});

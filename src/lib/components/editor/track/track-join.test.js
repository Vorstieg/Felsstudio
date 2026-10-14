import { describe, expect, it } from 'vitest';
import { previewTrackJoin } from './track-join.ts';

describe('track join geometry', () => {
	it.each([
		{
			second: [
				[2, 0],
				[3, 0]
			],
			expected: [
				[0, 0],
				[1, 0],
				[2, 0],
				[3, 0]
			]
		},
		{
			second: [
				[3, 0],
				[2, 0]
			],
			expected: [
				[0, 0],
				[1, 0],
				[2, 0],
				[3, 0]
			]
		},
		{
			second: [
				[-2, 0],
				[-1, 0]
			],
			expected: [
				[-2, 0],
				[-1, 0],
				[0, 0],
				[1, 0]
			]
		},
		{
			second: [
				[-1, 0],
				[-2, 0]
			],
			expected: [
				[-2, 0],
				[-1, 0],
				[0, 0],
				[1, 0]
			]
		}
	])(
		'connects the closest ends and preserves every distinct point: $second',
		({ second, expected }) => {
			const first = [
				[0, 0],
				[1, 0]
			];
			const preview = previewTrackJoin(first, second);
			expect(preview.points).toEqual(expected);
			expect(preview.gapMeters).toBeGreaterThan(100000);
			expect(preview.connection).toHaveLength(2);
			preview.points[0][1] = 10;
			expect(first).toEqual([
				[0, 0],
				[1, 0]
			]);
			expect(second.every((point) => point[1] === 0)).toBe(true);
		}
	);
	it('deduplicates a shared endpoint', () => {
		const preview = previewTrackJoin(
			[
				[0, 0],
				[1, 0]
			],
			[
				[1, 0],
				[2, 0]
			]
		);
		expect(preview.points).toEqual([
			[0, 0],
			[1, 0],
			[2, 0]
		]);
		expect(preview.gapMeters).toBe(0);
	});
	it('rejects an incomplete track', () => {
		expect(
			previewTrackJoin(
				[[0, 0]],
				[
					[1, 0],
					[2, 0]
				]
			)
		).toBeNull();
	});
});

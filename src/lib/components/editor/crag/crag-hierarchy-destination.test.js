import { describe, expect, it } from 'vitest';
import { destinationEntryExists } from './crag-hierarchy-destination.js';

describe('destinationEntryExists', () => {
	it('finds a persisted child in an unloaded destination folder', async () => {
		const read = async () => [{ name: 'north', path: 'austria/cliff/north', type: 'dir' }];
		expect(await destinationEntryExists('austria/cliff', 'north', read)).toBe(true);
		expect(await destinationEntryExists('austria/cliff', 'south', read)).toBe(false);
	});
	it('allows a missing parent and rejects an unreadable one', async () => {
		const missing = async () => {
			throw new Error('Failed to list austria: 404 Not Found');
		};
		const failed = async () => {
			throw new Error('Failed to list austria: 500 Server Error');
		};
		expect(await destinationEntryExists('austria', 'north', missing)).toBe(false);
		await expect(destinationEntryExists('austria', 'north', failed)).rejects.toThrow('500');
	});
});

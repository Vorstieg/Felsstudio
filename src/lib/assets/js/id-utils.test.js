import { describe, expect, it } from 'vitest';
import { generateOutlineId, initializeIdCounters } from './id-utils.ts';

describe('initializeIdCounters', () => {
	it('avoids outline IDs already present in outlines', () => {
		initializeIdCounters({
			routes: [],
			outlines: [{ id: 'outline-5' }]
		});
		expect(generateOutlineId()).toBe('outline-6');
		initializeIdCounters({ routes: [], outlines: [{ id: 'outline-8' }] });
		expect(generateOutlineId()).toBe('outline-9');
	});
});

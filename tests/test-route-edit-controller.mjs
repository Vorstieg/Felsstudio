// @vitest-environment node
import { expect, test } from 'vitest';
import { createRouteEditController } from '../src/lib/components/editor/crag/route-editing.ts';

test('selection changes finish the current draft through the shared tool policy', () => {
	let selection = { type: 'route', key: 'a' },
		draft = { pathId: 'a' },
		transitions = 0;
	const controller = createRouteEditController({
		getSelection: () => selection,
		requestLeave: (next) => {
			transitions++;
			draft = null;
			next();
		},
		setSelection: (next) => {
			selection = next;
		},
		setDraft: (next) => {
			draft = next;
		}
	});
	controller.selectObject({ type: 'route', key: 'a' });
	expect(transitions).toBe(0);
	controller.selectObject({ type: 'route', key: 'b' });
	expect(transitions).toBe(1);
	expect(draft).toBeNull();
	controller.startDraft({ pathId: 'b' });
	expect(transitions).toBe(2);
	expect(draft).toEqual({ pathId: 'b' });
});

// @vitest-environment node

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createRouteEditController } from '../src/lib/components/editor/crag/route-editing.js';

function createController(initialSelection = null, initialDraft = null) {
	let selection = initialSelection;
	let draft = initialDraft;
	let commitCount = 0;
	const controller = createRouteEditController({
		getSelection: () => selection,
		getDraft: () => draft,
		commitDraft: () => {
			commitCount += 1;
			draft = null;
		},
		setSelection: (value) => (selection = value),
		setDraft: (value) => (draft = value)
	});
	return { controller, selection: () => selection, draft: () => draft, commits: () => commitCount };
}

test('commits the current route before selecting another route', () => {
	const state = createController({ type: 'route', key: 'route-a' }, { pathId: 'path-a' });

	state.controller.selectObject({ type: 'route', key: 'route-b' });

	assert.equal(state.commits(), 1);
	assert.deepEqual(state.selection(), { type: 'route', key: 'route-b' });
	assert.equal(state.draft(), null);
});

test('commits the current draft before starting Draw path or Edit path', () => {
	const state = createController({ type: 'route', key: 'route-a' }, { pathId: 'path-a' });

	state.controller.startDraft({ pathId: 'path-b' });

	assert.equal(state.commits(), 1);
	assert.deepEqual(state.draft(), { pathId: 'path-b' });
});

test('does not commit when selecting the same object', () => {
	const state = createController({ type: 'route', key: 'route-a' }, { pathId: 'path-a' });

	state.controller.selectObject({ type: 'route', key: 'route-a' });

	assert.equal(state.commits(), 0);
	assert.deepEqual(state.draft(), { pathId: 'path-a' });
});

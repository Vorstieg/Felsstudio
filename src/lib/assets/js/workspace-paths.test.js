import { describe, expect, it } from 'vitest';
import {
	workspaceDocumentPaths,
	workspaceDocumentPathsAt,
	workspaceEntryPath,
	workspaceNodeDocumentPaths,
	workspaceNodePath
} from './workspace-paths.ts';

describe('workspace paths', () => {
	it('keeps directory keys relative and root document paths absolute', () => {
		const node = { path: '', id: 'wall', entry: null };
		expect(workspaceEntryPath('', 'wall')).toBe('wall');
		expect(workspaceNodePath(node)).toBe('wall');
		expect(workspaceNodeDocumentPaths(node)).toEqual(workspaceDocumentPaths('', 'wall'));
		expect(workspaceDocumentPaths('', 'wall').topo).toBe('/wall/wall-topo.json');
	});

	it('identifies old filenames after a directory move', () => {
		expect(workspaceDocumentPathsAt('new', 'old').entry).toBe('new/old.json');
		expect(workspaceDocumentPaths('new', 'child').entry).toBe('new/child/child.json');
	});
});

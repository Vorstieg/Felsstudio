import { splitEntryPath } from './editor-entry-paths.ts';
import { Topo } from './topo-paths.ts';

/** Draft entryPath is a file stem; the editor route points to the crag directory. */
export function resolveTopoSavePath(
	source: { topoFileName?: string | null; entryPath?: string | null },
	cragEntryPath?: string | null
): string | null {
	if (source.topoFileName) return source.topoFileName;
	if (source.entryPath) return `${source.entryPath.replace(/\/+$/, '')}-topo.json`;
	const { path, id } = splitEntryPath(cragEntryPath);
	return id ? new Topo(path, id).getTopoPath() : null;
}

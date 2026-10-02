type EntryPathSource = {
	entryPath: string;
};

export function splitEntryPath(entryPath: string | null | undefined): { path: string; id: string } {
	const normalized = (entryPath || '').replace(/^\/+|\/+$/g, '');
	const parts = normalized.split('/').filter(Boolean);
	return { path: parts.slice(0, -1).join('/'), id: parts.at(-1) || '' };
}

export function getCragEntryPath(crag: EntryPathSource): string {
	return crag.entryPath.replace(/^\/+|\/+$/g, '');
}

export function getCragEditorPath(crag: EntryPathSource): string {
	return `/crags/editor/${getCragEntryPath(crag)}`;
}

export function getTopoEditorPath(workspace: string, entry: EntryPathSource): string {
	return `${workspace}/${getCragEntryPath(entry)}`;
}

import { listDir } from '$lib/api/felslager.ts';
import type { ApiListEntry } from '$lib/types/api.ts';

type DirectoryReader = (parentPath: string) => Promise<ApiListEntry[]>;

/** A missing parent cannot already contain the proposed entry. */
export async function destinationEntryExists(
	parentPath: string,
	id: string,
	directoryReader: DirectoryReader = listDir
): Promise<boolean> {
	try {
		return (await directoryReader(parentPath)).some((child) => child.name === id);
	} catch (error) {
		if (error instanceof Error && /: 404(?:\s|$)/.test(error.message)) return false;
		throw error;
	}
}

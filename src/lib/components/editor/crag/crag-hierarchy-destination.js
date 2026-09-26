import { listDir } from '$lib/api/felslager.ts';

/** A missing parent cannot already contain the proposed entry. */
export async function destinationEntryExists(parentPath, id, directoryReader = listDir) {
	try {
		return (await directoryReader(parentPath)).some((child) => child.name === id);
	} catch (error) {
		if (error instanceof Error && /: 404(?:\s|$)/.test(error.message)) return false;
		throw error;
	}
}

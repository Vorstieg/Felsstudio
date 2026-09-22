import { workspaceDocumentPathsAt, workspaceNodeDocumentPaths, workspaceNodePath } from './workspace-paths.ts';
import { deleteFile, renameFile, writeFile, writeJson } from '$lib/api/felslager.ts';

const within = (path, directory) => path === directory || path.startsWith(`${directory}/`);
const remap = (path, from, to) => (within(path, from) ? `${to}${path.slice(from.length)}` : path);
const descendants = (node) => [node, ...node.childEntries.flatMap(descendants)];
const cleanProperties = (properties) => {
	const { sectors: _sectors, path: _path, ...clean } = properties || {};
	return clean;
};

/** Persist the workspace one completed operation at a time so a failed save can resume. */
export async function saveCragWorkspace(
	root,
	{
		rename = renameFile,
		write = writeJson,
		writeBinary = writeFile,
		remove = deleteFile,
		getPendingImages = (node) => node.pendingImages || [],
		finishUpload = (node, image) => {
			node.pendingImages = (node.pendingImages || []).filter((pending) => pending !== image);
			URL.revokeObjectURL(image.previewUrl);
		}
	} = {}
) {
	async function moveNode(node) {
		const from = node.sourcePath;
		const to = workspaceNodePath(node);
		if (!from || from === to) return;
		await rename(from, to);
		for (const child of descendants(node)) {
			if (!child.sourcePath || !within(child.sourcePath, from)) continue;
			const oldPath = child.sourcePath;
			child.sourcePath = remap(oldPath, from, to);
			child.removedPaths = child.removedPaths || [];
			const oldId = oldPath.split('/').at(-1);
			const previous = workspaceDocumentPathsAt(child.sourcePath, oldId);
			const desired = workspaceNodeDocumentPaths(child);
			const oldFiles = [previous.entry, previous.topo, previous.access];
			const newFiles = [desired.entry, desired.topo, desired.access];
			for (let index = 0; index < oldFiles.length; index++) {
				if ((index === 1 && !child.topo) || (index === 2 && !child.access)) continue;
				if (oldFiles[index] !== newFiles[index] && !child.removedPaths.includes(oldFiles[index]))
					child.removedPaths.push(oldFiles[index]);
			}
			if (oldFiles[0] !== newFiles[0] && !child.dirtyPaths.includes(newFiles[0]))
				child.dirtyPaths.push(newFiles[0]);
			if (child.topo && oldFiles[1] !== newFiles[1] && !child.dirtyPaths.includes(newFiles[1]))
				child.dirtyPaths.push(newFiles[1]);
			if (child.access && oldFiles[2] !== newFiles[2] && !child.dirtyPaths.includes(newFiles[2]))
				child.dirtyPaths.push(newFiles[2]);
			child.images = (child.images || []).map((image) => ({
				...image,
				sourcePath: image.sourcePath ? remap(image.sourcePath, from, to) : image.sourcePath
			}));
			child.auxiliaryFiles = (child.auxiliaryFiles || []).map((file) => remap(file, from, to));
			child.modelPath = child.modelPath ? remap(child.modelPath, from, to) : undefined;
			child.modelSourcePath = child.modelSourcePath
				? remap(child.modelSourcePath, from, to)
				: undefined;
			child.removedPaths = child.removedPaths.map((path) => remap(path, from, to));
			child.removedDirectories = (child.removedDirectories || []).map((path) => remap(path, from, to));
			child.dirtyPaths = child.dirtyPaths.map((path) => remap(path, from, to));
		}
	}
	async function saveNode(node) {
		await moveNode(node);
		if (node.entry) {
			const path = workspaceNodePath(node);
			const { entry: entryPath, topo: topoPath, access: accessPath } = workspaceNodeDocumentPaths(node);
			if (node.modelSourcePath && node.modelPath && node.modelSourcePath !== node.modelPath) {
				await rename(node.modelSourcePath, node.modelPath);
				node.modelSourcePath = node.modelPath;
			}
			for (const image of node.images || []) {
				if (!image.sourcePath || image.sourcePath === image.path) continue;
				await rename(image.sourcePath, image.path);
				image.sourcePath = image.path;
			}
			for (const image of [...getPendingImages(node)]) {
				const descriptor = node.images.find((candidate) => candidate.clientId === image.clientId);
				if (!descriptor) continue;
				await writeBinary(descriptor.path, image.file, image.file.type);
				descriptor.sourcePath = descriptor.path;
				finishUpload(node, image);
			}
			const writes = [
				[
					entryPath,
					{
						...(node.entryExtras || {}),
						type: 'Feature',
						properties: {
							...cleanProperties(node.entry.properties),
							updated: new Date().toISOString().slice(0, 10)
						},
						geometry: node.entry.geometry
					},
					!node.sourcePath || node.dirtyPaths.includes(entryPath) || node.removedPaths.length > 0
				],
				[topoPath, node.topo, !!node.topo && node.dirtyPaths.includes(topoPath)],
				[accessPath, node.access, !!node.access && node.dirtyPaths.includes(accessPath)]
			];
			for (const [file, data, needed] of writes) {
				if (!needed) continue;
				await write(file, data);
				node.dirtyPaths = node.dirtyPaths.filter((candidate) => candidate !== file);
				if (file === entryPath) node.sourcePath = path;
			}
			for (const file of [...new Set(node.removedPaths || [])]) {
				if ([entryPath, topoPath, accessPath].includes(file)) continue;
				await remove(file);
				node.removedPaths = node.removedPaths.filter((candidate) => candidate !== file);
			}
		}
		for (const child of node.childEntries) await saveNode(child);
		for (const directory of [...new Set(node.removedDirectories || [])].sort(
			(a, b) => b.length - a.length
		)) {
			await remove(directory);
			node.removedDirectories = node.removedDirectories.filter(
				(candidate) => candidate !== directory
			);
		}
	}
	await saveNode(root);
}

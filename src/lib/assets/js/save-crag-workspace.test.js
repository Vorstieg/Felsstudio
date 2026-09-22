// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { saveCragWorkspace } from './save-crag-workspace.js';

const entry = (id) => ({ type: 'Feature', properties: { id, kind: 'crag' }, geometry: null });
const node = (id, path = '', sourcePath = null, children = []) => ({
	entry: entry(id),
	id,
	path,
	sourcePath,
	childEntries: children,
	topo: null,
	access: null,
	dirtyPaths: [`${path}/${id}/${id}.json`],
	removedPaths: [],
	images: [],
	auxiliaryFiles: []
});
function filesystem(paths) {
	const files = new Set(paths);
	const calls = [];
	return {
		files,
		calls,
		api: {
			rename: vi.fn(async (from, to) => {
				calls.push(['move', from, to]);
				const contents = [...files].filter((file) => file === from || file.startsWith(`${from}/`));
				if (!contents.length) throw Error(`missing ${from}`);
				for (const file of contents) {
					files.delete(file);
					files.add(`${to}${file.slice(from.length)}`);
				}
			}),
			write: vi.fn(async (file) => {
				calls.push(['write', file]);
				files.add(file);
			}),
			writeBinary: vi.fn(async (file) => {
				calls.push(['upload', file]);
				files.add(file);
			}),
			remove: vi.fn(async (file) => {
				calls.push(['remove', file]);
				if (!files.delete(file)) throw Error(`missing ${file}`);
			})
		}
	};
}

describe('saveCragWorkspace', () => {
	it('preserves existing asset references on unrelated metadata edits', async () => {
		const root = node('wall', '', 'wall');
		root.entry.properties.assets = { images: ['wall/image.jpg'], models: ['wall/wall.glb'] };
		root.entry.properties.name = 'Renamed wall';
		const writes = [];
		await saveCragWorkspace(root, {
			write: async (path, data) => writes.push([path, data])
		});
		expect(writes[0][1].properties.assets).toEqual(root.entry.properties.assets);
	});

	it('moves a renamed entry and leaves one canonical filename plus unrelated files', async () => {
		const root = node('new', '', 'old');
		root.images = [
			{ name: 'photo.jpg', path: 'new/new-image-photo.jpg', sourcePath: 'old/old-image-photo.jpg' }
		];
		const fs = filesystem(['old/old.json', 'old/old-image-photo.jpg', 'old/notes.pdf']);
		await saveCragWorkspace(root, fs.api);
		expect([...fs.files].map((path) => path.replace(/^\//, '')).sort()).toEqual([
			'new/new-image-photo.jpg',
			'new/new.json',
			'new/notes.pdf'
		]);
		expect(fs.calls.filter(([kind]) => kind === 'move')).toEqual([
			['move', 'old', 'new'],
			['move', 'new/old-image-photo.jpg', 'new/new-image-photo.jpg']
		]);
	});

	it('moves parent then renamed child at its new location', async () => {
		const child = node('east', 'new', 'old/west');
		const root = node('new', '', 'old', [child]);
		const fs = filesystem(['old/old.json', 'old/west/west.json', 'old/west/readme.txt']);
		await saveCragWorkspace(root, fs.api);
		expect([...fs.files].map((path) => path.replace(/^\//, '')).sort()).toEqual([
			'new/east/east.json',
			'new/east/readme.txt',
			'new/new.json'
		]);
		expect(fs.calls.filter(([kind]) => kind === 'move')).toEqual([
			['move', 'old', 'new'],
			['move', 'new/west', 'new/east']
		]);
	});
	it('removes a deleted child at its relocated path when its parent is renamed', async () => {
		const root = node('new', '', 'old');
		root.removedDirectories = ['old/north'];
		const fs = filesystem(['old/old.json', 'old/north/north.json']);
		fs.api.remove = vi.fn(async (path) => {
			fs.calls.push(['remove', path]);
			const contents = [...fs.files].filter((file) => file === path || file.startsWith(`${path}/`));
			if (!contents.length) throw Error(`missing ${path}`);
			for (const file of contents) fs.files.delete(file);
		});

		await saveCragWorkspace(root, fs.api);
		expect(fs.api.remove).toHaveBeenCalledWith('new/north');
		expect([...fs.files]).toEqual(['/new/new.json']);
		expect(root.removedDirectories).toEqual([]);
	});

	it('renames the model file after moving an entry folder', async () => {
		const root = node('new', '', 'old');
		root.modelPath = 'new/new.glb';
		root.modelSourcePath = 'old/old.glb';
		const fs = filesystem(['old/old.json', 'old/old.glb']);
		await saveCragWorkspace(root, fs.api);
		expect([...fs.files].map((path) => path.replace(/^\//, '')).sort()).toEqual([
			'new/new.glb',
			'new/new.json'
		]);
		expect(fs.calls.filter(([kind]) => kind === 'move')).toEqual([
			['move', 'old', 'new'],
			['move', 'new/old.glb', 'new/new.glb']
		]);
	});

	it.each(['move', 'write'])('resumes after a failed %s', async (operation) => {
		const root = node('new', '', 'old');
		const fs = filesystem(['old/old.json']);
		const method = operation === 'move' ? 'rename' : 'write';
		const original = fs.api[method];
		let fail = true;
		fs.api[method] = async (...args) => {
			if (fail) {
				fail = false;
				throw Error('temporary');
			}
			return original(...args);
		};
		await expect(saveCragWorkspace(root, fs.api)).rejects.toThrow('temporary');
		await saveCragWorkspace(root, fs.api);
		expect([...fs.files].map((path) => path.replace(/^\//, ''))).toEqual(['new/new.json']);
		expect(fs.calls.filter(([kind]) => kind === 'move')).toHaveLength(1);
	});
});

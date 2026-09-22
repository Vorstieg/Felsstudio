import { slugifyName } from '$lib/components/editor/crag/crag-editor-paths.js';

export class Topo {
	constructor(path, cragId) {
		this.path = path;
		this.cragId = cragId;
	}

	_getPath() {
		return `${this.path}/${this.cragId}/${this.cragId}`;
	}

	getTopoPath() {
		return `${this._getPath()}-topo.json`;
	}

	getGlbPath() {
		return `${this._getPath()}.glb`;
	}

	getCragPath() {
		return `${this.path}/${this.cragId}/${this.cragId}.json`;
	}

	getBaseName() {
		return this.cragId;
	}

	getFileName() {
		return this.getBaseName() + '.json';
	}
	getAccessPath() {
		return `${this._getPath()}-access.json`;
	}
	getImagePath(name, token = '') {
		const lastDot = name.lastIndexOf('.');
		let ext = '';
		let baseName = name;
		if (lastDot > 0) {
			ext = name.substring(lastDot).toLowerCase();
			baseName = name.substring(0, lastDot);
		}
		const slug = slugifyName(baseName) || 'img';
		const suffix = token === '' || token === 0 ? '' : `-${token}`;
		return `${this._getPath()}-image${suffix}-${slug}${ext}`;
	}
}

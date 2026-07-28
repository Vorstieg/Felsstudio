import { slugifyName } from '$lib/components/editor/crag/crag-editor-paths.js';

export class Topo {
	constructor(path, cragId, sectorId) {
		this.path = path;
		this.cragId = cragId;
		this.sectorId = sectorId;
	}

	_getPath() {
		if (this.sectorId) {
			return `${this.path}/${this.cragId}/${this.sectorId}/${this.sectorId}`;
		} else {
			return `${this.path}/${this.cragId}/${this.cragId}`;
		}
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

	getSectorPath() {
		if (!this.sectorId) return this.getCragPath();
		return `${this.path}/${this.cragId}/${this.sectorId}/${this.getFileName()}`;
	}

	getBaseName() {
		return this.sectorId ? this.sectorId : this.cragId;
	}

	getFileName() {
		return this.getBaseName() + '.json';
	}
	getCragAssetPath(kind, index = 0) {
		const suffix = index > 0 ? `-${index}` : '';
		return `${this._getPath()}-${kind}${suffix}.json`;
	}
	getImagePath(name, index = 0) {
		const lastDot = name.lastIndexOf('.');
		let ext = '';
		let baseName = name;
		if (lastDot > 0) {
			ext = name.substring(lastDot).toLowerCase();
			baseName = name.substring(0, lastDot);
		}
		const slug = slugifyName(baseName) || 'img';
		return `${this._getPath()}-image${index > 0 ? '-' + index : ''}-${slug}${ext}`;
	}
}

import { describe, expect, it } from 'vitest';
import { parse3DUploadProject } from './parse-3d-upload-project.ts';

const hit = {
	pos: [1, 2, 3],
	cam_pos: [4, 5, 6],
	conf: 0.8,
	class: 'bolt',
	img: 'F12.jpg',
	hit_crop: 'crop.jpg'
};

describe('parse3DUploadProject', () => {
	it('normalizes valid hits and GPS entries', () => {
		const project = parse3DUploadProject({
			name: 'Wall',
			hits: [hit],
			gps: [{ frame_index: 12, latitude: 47.1, longitude: 13.2, abs_alt: 1200 }]
		});
		expect(project.hits[0]).toMatchObject({
			crop: 'crop.jpg',
			edge_dist: 0,
			normal_dot: 1,
			cam_dist: 1
		});
		expect(project.gps[0]).toMatchObject({ frame_index: 12, latitude: 47.1, longitude: 13.2 });
	});

	it('accepts a project without detection data', () => {
		expect(parse3DUploadProject({ name: 'Wall' })).toEqual({ name: 'Wall', hits: [], gps: [] });
	});

	it('rejects malformed data before it enters clustering state', () => {
		expect(() => parse3DUploadProject({ hits: [{ ...hit, cam_pos: [1, 'bad', 3] }] })).toThrow(
			'Hit 1 needs pos, cam_pos, conf, class, and img'
		);
		expect(() => parse3DUploadProject({ gps: [{ latitude: 47.1 }] })).toThrow(
			'GPS entry 1 needs numeric latitude and longitude'
		);
		expect(() => parse3DUploadProject({ hits: [{ ...hit, gps: ['bad', 13, 1000] }] })).toThrow(
			'Hit 1 gps must be a three-number position'
		);
	});
});

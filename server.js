import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3002;
const PUBLIC_DIR = path.join(__dirname, 'build');

const MIME_TYPES = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.glb': 'model/gltf-binary',
	'.gltf': 'model/gltf+json',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf'
};

const server = http.createServer((req, res) => {
	// Normalize path to prevent directory traversal
	let filePath = path.join(PUBLIC_DIR, req.url.split('?')[0]);
	if (filePath.endsWith(path.sep)) {
		filePath = path.join(filePath, 'index.html');
	}

	const ext = path.extname(filePath).toLowerCase();
	
	fs.stat(filePath, (err, stats) => {
		if (err || !stats.isFile()) {
			// File not found or is a directory, serve SvelteKit static fallback for SPA routing
			const fallbackPath = path.join(PUBLIC_DIR, '404.html');
			fs.readFile(fallbackPath, (fbErr, content) => {
				if (fbErr) {
					res.writeHead(404, { 'Content-Type': 'text/plain' });
					res.end('404 Not Found');
				} else {
					res.writeHead(200, { 'Content-Type': 'text/html' });
					res.end(content);
				}
			});
			return;
		}

		const contentType = MIME_TYPES[ext] || 'application/octet-stream';
		res.writeHead(200, { 'Content-Type': contentType });
		
		// Stream file for efficiency
		const stream = fs.createReadStream(filePath);
		stream.pipe(res);
	});
});

server.listen(PORT, '0.0.0.0', () => {
	console.log(`Felsstudio static server running on port ${PORT}`);
});

# @vorstieg/topo-renderer

Shared SVG rendering primitives, normalized 2D geometry, topo symbols, and symbol assets for Vorstieg topo JSON.

## Development

The entry point is written in TypeScript. Run `npm run build` in this directory to generate the JavaScript and declaration files in `dist/`. The package build also runs during `npm install` and before publishing.

## Installation

Configure the GitHub Packages registry for the `@vorstieg` scope:

```ini
@vorstieg:registry=https://npm.pkg.github.com
```

Then install the package:

```sh
npm install @vorstieg/topo-renderer
```

GitHub Actions can authenticate using `GITHUB_TOKEN` when the consuming repository has been granted package access.

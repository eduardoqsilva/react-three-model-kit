import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["cjs", "esm"], // Gera .js (CommonJS) e .mjs (ES6 Modules)
	dts: true, // Gera os arquivos de tipagem .d.ts
	splitting: false, // Mantém o código em um arquivo único por formato
	sourcemap: true, // Facilita o debug para quem instalar sua lib
	clean: true, // Limpa a pasta dist antes de cada build
	minify: true, // Deixa o arquivo final leve
	treeshake: true, // Remove código morto
	// EXTERNAL: Isso garante que o Three.js do projeto do usuário seja usado.
	// Usamos uma regex /^three\// para pegar também os imports de /examples/jsm/
	external: ["react", "three", /^three\//],
	// Garante que o ambiente seja tratado corretamente em diferentes bundlers
	shims: true,
});

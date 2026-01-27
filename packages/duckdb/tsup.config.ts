import { defineConfig } from 'tsup'

export default defineConfig({
    entry: ['./src/index.ts'],
    outDir: './dist',
    platform: "browser",
    treeshake: true,
    dts: true,
    clean: true,
    external: [
        "@duckdb/duckdb-wasm",
        "react",
        "bun",
    ],
})
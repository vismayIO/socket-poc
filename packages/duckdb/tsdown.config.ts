import { defineConfig } from 'tsdown'

export default defineConfig({
    entry: ['./src/index.ts'],
    outDir: './dist',
    platform: "browser",
    treeshake: true,
    dts: true,
    external: [
        "@duckdb/duckdb-wasm",
        "react",
        "bun"
    ],
})
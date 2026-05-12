import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), tanstackRouter({ target: "react", autoCodeSplitting: true }), viteReact()],
  build: {
    rollupOptions: {
      output: {
        // Force every third-party module into a single `vendor` chunk.
        //
        // viem + @noble/curves use top-level dynamic `import()` for
        // code-splitting (e.g. lazy-loading secp256k1). Rollup honors those
        // dynamic imports and emits separate chunks that reference each
        // other's exports at module-init time. If chunk load order puts one
        // before the other has finished initializing, the cross-chunk import
        // is still `undefined` and the consumer throws at top level.
        //
        // Dev mode doesn't hit this because Vite's dev server doesn't chunk.
        // It only surfaces after `vite build`.
        manualChunks(id) {
          if (id.includes("/node_modules/")) return "vendor";
        },
      },
    },
  },
});

export default config;

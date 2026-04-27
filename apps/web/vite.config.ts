import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackRouter({ target: "react", autoCodeSplitting: true }), viteReact()],
  build: {
    rollupOptions: {
      output: {
        // Force every third-party module into a single `vendor` chunk.
        //
        // Do NOT "optimize" this by splitting vendor into per-package chunks
        // without a full production smoke test. viem + @noble/curves use
        // top-level dynamic `import()` for code-splitting (e.g. lazy-loading
        // secp256k1). Rollup honors those dynamic imports and emits separate
        // chunks that reference each other's exports at module-init time.
        // If chunk load order puts one before the other has finished
        // initializing, the cross-chunk import is still `undefined` and the
        // consumer throws at top level — e.g. noble's hashToCurve factory
        // runs during module eval with `hash: undefined` and dies with
        // "param hash is invalid. Expected hash, got undefined".
        //
        // Dev mode doesn't hit this because Vite's dev server doesn't chunk.
        // It only surfaces after `vite build`, which is why it's easy to
        // miss in code review.
        //
        // Collapsing everything to one `vendor` module scope removes the
        // cross-chunk boundary, so there's no order-dependent init. Cost is
        // a chunky initial download; acceptable for this app.
        manualChunks(id) {
          if (id.includes("/node_modules/")) return "vendor";
        },
      },
    },
  },
});

export default config;

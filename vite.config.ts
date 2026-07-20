import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The eERC prover has a large dependency graph. Keep the app, Wagmi, and
  // React Query on one React runtime when Vite pre-bundles those dependencies.
  resolve: { dedupe: ["react", "react-dom", "@tanstack/react-query"] },
  // Some transitive eERC SDK dependencies reference Node's `global` name.
  // Map it to the browser global without changing the app architecture.
  define: { global: "globalThis" },
})

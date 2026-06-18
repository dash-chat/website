import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
      }
    }
  },
  plugins: [
    {
      name: 'blog-routing',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/blog') req.url = '/blog.html';
          next();
        });
      }
    },
    {
      name: 'ensure-nojekyll',
      apply: 'build',
      closeBundle() {
        const outPath = path.resolve(process.cwd(), 'dist', '.nojekyll');
        fs.writeFileSync(outPath, '');
      }
    }
  ]
})

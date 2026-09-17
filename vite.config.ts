import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        404: '404.html',
      }
    }
  },
  plugins: [
    {
      name: 'blog-routing',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? '/';

          // /blog → /blog.html
          if (url === '/blog') { req.url = '/blog.html'; return next(); }

          // /add-contact/CODE → redirect to /add-contact/?code=CODE
          const addContactCode = url.match(/^\/add-contact\/([^/?#]+)\/?$/);
          if (addContactCode) {
            res.writeHead(302, { Location: `/add-contact/?code=${encodeURIComponent(addContactCode[1])}` });
            res.end();
            return;
          }

          // Extensionless paths: try public/<path>.html, then public/<path>/index.html
          // (mirrors GitHub Pages behaviour, e.g. /privacy, /get, /add-contact/)
          const rawPath = url.split('?')[0];
          if (rawPath !== '/' && !rawPath.includes('.')) {
            const base = rawPath.replace(/^\//, '');
            const candidates = base.endsWith('/')
              ? [base + 'index.html']
              : [base + '.html', base + '/index.html'];
            const match = candidates.find(c => fs.existsSync(path.resolve(process.cwd(), 'public', c)));
            if (match) {
              req.url = '/' + match + (url.includes('?') ? url.slice(url.indexOf('?')) : '');
              return next();
            }
          }

          next();
        });
      },
      configurePreviewServer(server) {
        // Simulate GitHub Pages: serve 404.html for any request that doesn't
        // match a real file, so the 404.html redirect JS runs just like in prod.
        server.middlewares.use((req, res, next) => {
          const notFound = path.resolve(process.cwd(), 'dist', '404.html');
          if (!fs.existsSync(notFound)) return next();

          const rawPath = (req.url ?? '/').split('?')[0].replace(/^\//, '');
          const distDir = path.resolve(process.cwd(), 'dist');
          const candidates = [
            path.join(distDir, rawPath),
            path.join(distDir, rawPath + '.html'),
            path.join(distDir, rawPath, 'index.html'),
          ];
          const exists = rawPath === '' || candidates.some(p => fs.existsSync(p));
          if (!exists) {
            const html = fs.readFileSync(notFound, 'utf-8');
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
          }
          next();
        });
      },
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

# Contributing

HomeNodes is plain ES modules typed with JSDoc, with no build step and no dependencies, plus a
thin Python integration. The rules are in
[CONTRIBUTING.md](https://github.com/joerdav/homenodes/blob/main/CONTRIBUTING.md).

```bash
npm run dev          # the panel over a made-up house: http://127.0.0.1:8770/dev/
npm run ci           # checks, unit tests and type check
npm run browser      # hostile names in headless Chrome
npm run bench        # performance budgets
nix develop -c pytest
```

The documentation is this site: `docs/` and `mkdocs.yml`. Screenshots are taken from the dev
harness by `node scripts/screenshots.mjs`, so they never show a real home.

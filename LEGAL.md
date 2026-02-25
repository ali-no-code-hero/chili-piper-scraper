# Legal

## Project license

This project is licensed under the **ISC License**. See [LICENSE](LICENSE) for the full text.

## Third-party code

This software uses open-source packages from the npm ecosystem. A list of third-party dependencies and their licenses is maintained in **[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)**.

- Each dependency remains under its own license. Nothing in this project’s LICENSE alters the terms of those third-party licenses.
- Full license texts for a given package are typically in `node_modules/<package>/LICENSE` (or the path indicated in that package’s metadata).
- Some packages (e.g. Playwright, TypeScript) include additional NOTICE or ThirdPartyNotices files; those should be read in the corresponding `node_modules` directory.

To regenerate the third-party list after adding or removing dependencies, run:

```bash
npm run licenses
```

(or `node scripts/generate-licenses.js`).

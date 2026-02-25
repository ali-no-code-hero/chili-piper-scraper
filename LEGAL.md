# Legal

## Project license

This project is licensed under the **ISC License**. The full text of the license is below and is also available in [LICENSE](LICENSE).

### ISC License (full text)

```
ISC License

Copyright (c) 2025, chili-piper-scraper contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

---

## Third-party code and attributions

This software uses open-source packages from the npm ecosystem. A list of third-party dependencies and their licenses is maintained in **[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)**.

- Each dependency remains under its own license. Nothing in this project’s LICENSE alters the terms of those third-party licenses.
- Full license texts for a given package are typically in `node_modules/<package>/LICENSE` (or the path indicated in that package’s metadata).
- Some packages (e.g. Playwright, TypeScript) include additional **NOTICE** or **ThirdPartyNotices** files; those should be read in the corresponding `node_modules` directory (e.g. `node_modules/playwright/NOTICE`, `node_modules/playwright-core/NOTICE`, `node_modules/typescript/ThirdPartyNoticeText.txt`).

To regenerate the third-party list after adding or removing dependencies, run:

```bash
npm run licenses
```

(or `node scripts/generate-licenses.js`).

---

## Disclaimer

Use of this software is at your own risk. The authors and contributors provide no warranty. External services (e.g. Chili Piper, Calendly) are subject to their own terms of service and privacy policies.

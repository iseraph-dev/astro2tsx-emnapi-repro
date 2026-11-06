# astro check fails when pnpm pairs `@astrojs/astro2tsx` core 1.11.3 with runtime 2.0.0-beta.2

Local draft. Not filed.

```
pnpm install
node show-import-error.mjs   # TypeError: this.bridge.setLastError is not a function
CI=true pnpm exec astro check # exit 1, reports @astrojs/check as missing
```

`minimumReleaseAge: 0` is required for the failure. With pnpm's default release-age cooldown, `astro@7.4.7` stays on `rolldown@1.2.16` and `astro check` passes. The issue body is `ISSUE.md`.

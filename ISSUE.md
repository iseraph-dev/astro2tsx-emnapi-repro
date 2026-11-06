## `astro check` exits 1 when pnpm resolves `@astrojs/astro2tsx` with `@emnapi/core@1.11.3` and `@emnapi/runtime@2.0.0-beta.2`

`astro check` reports that `@astrojs/check` is not installed. The package is installed. Importing it throws because `@astrojs/astro2tsx@0.1.3` pins `@emnapi/core` to `1.11.3` and does not pin `@emnapi/runtime`. pnpm then satisfies the runtime peer of `@napi-rs/wasm-runtime@1.2.4` with `2.0.0-beta.2`, which is already in the install. Those two emnapi versions do not share a bridge.

pnpm is applying the published ranges. The pin that is missing belongs on `@astrojs/astro2tsx` (published from [withastro/compiler-rs](https://github.com/withastro/compiler-rs/tree/main/crates/astro2tsx)). This issue is filed here because the failure users see is `astro check`.

### Versions

- pnpm 12.18.0
- Node 26.12.1
- `astro@7.4.7`
- `@astrojs/check@0.9.12`
- `typescript@6.0.3`
- `@astrojs/astro2tsx@0.1.3` (latest; pulled by `@astrojs/language-server@2.17.3`)

### Minimal repro

`pnpm-workspace.yaml`:

```yaml
minimumReleaseAge: 0
```

`package.json`:

```json
{
  "name": "astro2tsx-emnapi-repro",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.18.0",
  "scripts": { "check": "astro check" },
  "devDependencies": {
    "@astrojs/check": "0.9.12",
    "astro": "7.4.7",
    "typescript": "6.0.3"
  }
}
```

Plus an empty `astro.config.mjs` (`export default {}` via `defineConfig`), a `tsconfig.json` extending `astro/tsconfigs/strict`, and `src/pages/index.astro`.

```sh
pnpm install
CI=true pnpm exec astro check
```

`minimumReleaseAge: 0` matters. pnpm's default release-age cooldown currently keeps `rolldown` at 1.2.16, and on that resolution `astro check` passes. `astro@7.4.7` depends on `rolldown@^1.2.16`. With the cooldown disabled, the install resolves `rolldown@1.3.0`. The same resolution will happen once 1.3.0 is old enough to pass the default cooldown.

### What `astro check` prints

```
To continue, Astro requires the following dependency to be installed: @astrojs/check. Packages cannot be installed automatically in CI environments.
[ERROR] [check] The `@astrojs/check` and `typescript` packages are required for this command to work. Please manually install them into your project and try again.
```

Exit code 1. Both packages are present (`typescript@6.0.3` is a direct devDependency and satisfies the peer `^5 || ^6`).

The message is `getPackage` treating any `import()` rejection as "not installed". The rejection is:

```
TypeError: this.bridge.setLastError is not a function
    at NodeEnv.clearLastError   @emnapi/runtime@2.0.0-beta.2
    at Object.init              @emnapi/core@1.11.3
    at instantiateNapiModuleSync
    at @astrojs/astro2tsx/index.js:13
```

Same mismatch then throws `this.bridge.deleteEnv is not a function` from an emnapi cleanup hook while the process exits.

### What is declared, and what pnpm resolves

`@astrojs/check@0.9.12` depends on `@astrojs/language-server@^2.17.3` and peers `typescript`. It does not mention emnapi. The peer context in the lockfile is still:

```yaml
'@astrojs/check':
  version: 0.9.12(@emnapi/runtime@2.0.0-beta.2)(prettier@3.9.10)(typescript@6.0.3)
```

`@astrojs/language-server@2.17.3` depends on `@astrojs/astro2tsx@^0.1.2` and does not mention emnapi. Resolved: `0.1.3`, same runtime peer pushed upward.

`@astrojs/astro2tsx@0.1.3` publishes:

```json
"dependencies": {
  "@emnapi/core": "1.11.3",
  "@napi-rs/wasm-runtime": "1.2.4"
},
"devDependencies": {
  "@emnapi/runtime": "1.11.3"
}
```

The runtime pin exists only as a devDependency, so it is not installed for consumers and it does not constrain them. Resolved dependencies are core `1.11.3` and wasm-runtime `1.2.4`. Resolved runtime is `2.0.0-beta.2`.

`@napi-rs/wasm-runtime@1.2.4` peers the two packages independently:

```yaml
peerDependencies:
  '@emnapi/core': ^1.7.1 || ^2.0.0-alpha.4
  '@emnapi/runtime': ^1.7.1 || ^2.0.0-alpha.4
```

Lockfile snapshot:

```yaml
'@astrojs/astro2tsx@0.1.3(@emnapi/runtime@2.0.0-beta.2)':
  dependencies:
    '@emnapi/core': 1.11.3
    '@napi-rs/wasm-runtime': 1.2.4(@emnapi/core@1.11.3)(@emnapi/runtime@2.0.0-beta.2)
```

`2.0.0-beta.2` enters through `astro@7.4.7` → `rolldown@1.3.0` → optional `@rolldown/binding-wasm32-wasi@1.3.0`, which depends on a matched pair:

```yaml
'@rolldown/binding-wasm32-wasi@1.3.0':
  dependencies:
    '@emnapi/core': 2.0.0-beta.2
    '@emnapi/runtime': 2.0.0-beta.2
    '@napi-rs/wasm-runtime': 1.2.6(@emnapi/core@2.0.0-beta.2)(@emnapi/runtime@2.0.0-beta.2)
  optional: true
```

That binding is `cpu: wasm32`, so on linux x64 it is not the binding Node loads. Its runtime version is still part of the pnpm peer set. `@napi-rs/wasm-runtime@1.2.4` accepts it. `@astrojs/astro2tsx` keeps core at the exact `1.11.3` dependency. Runtime 2 calls `bridge.setLastError`; the bridge object from core 1.11.3 does not have that function.

`npm view @emnapi/runtime version` is `1.11.3`. `2.0.0-beta.2` is not `latest`. It is selected because the wasm binding depends on that exact version and the peer range allows it.

### Expected

`astro check` loads `@astrojs/check` and typechecks the project. A package that ships a WASM binary built against `@emnapi/core@1.11.3` should also pin `@emnapi/runtime@1.11.3` as a dependency (the same way core is pinned), not only as a devDependency. devDependencies of a published package are not installed for consumers, so they cannot keep the pair together.

Suggested `dependencies` for `@astrojs/astro2tsx`:

```json
{
  "@emnapi/core": "1.11.3",
  "@emnapi/runtime": "1.11.3",
  "@napi-rs/wasm-runtime": "1.2.4"
}
```

pnpm can then keep that instance on runtime `1.11.3` while `rolldown`'s wasm binding keeps its own `2.0.0-beta.2` pair.

### Workaround that I verified

`pnpm-workspace.yaml`:

```yaml
minimumReleaseAge: 0

packageExtensions:
  "@astrojs/astro2tsx":
    dependencies:
      "@emnapi/runtime": "1.11.3"
```

After `pnpm install`, the loaded instance is core `1.11.3`, runtime `1.11.3`, and `@napi-rs/wasm-runtime@1.2.4` peered with `1.11.3` on both sides. `CI=true pnpm exec astro check` reports 0 errors. The rolldown wasm binding still resolves its own `2.0.0-beta.2` pair.

Leaving the release-age cooldown on, so `rolldown` stays at 1.2.16, also makes `astro check` pass today. That lasts until 1.3.0 is old enough to be installed. A global override of every `@emnapi/runtime` to `1.11.3` would fight `@rolldown/binding-wasm32-wasi@1.3.0`, which depends on `2.0.0-beta.2` exactly. I did not use that override.

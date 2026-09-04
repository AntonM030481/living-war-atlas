# Versioning and releases

Living War Atlas uses one product version across web and iOS.

## Identifiers

- **Version** comes from `package.json` (`0.2.1`).
- **Build** is `git rev-list --count HEAD`.
- **Commit** is the short Git SHA.

A concrete build is therefore identified as:

```text
0.2.1 (123) a1b2c3d
```

Production releases must be built from a clean `main` checkout with full Git history.

## Inspect the current source build

```bash
npm run version:info
```

## Web / Cloudflare

`npm run build` generates `public/version.json`, which Vite copies to the build output.
After deployment the exact running web build is available at:

```text
/version.json
```

Deploy with:

```bash
npm run deploy
```

The deploy command refuses tracked uncommitted changes and tags the Cloudflare Worker version as:

```text
v0.2.1-123
```

The Cloudflare version message also contains the full display identifier.

## iOS / App Store

Before opening Xcode for a build, use:

```bash
npm run ios:open
```

The sync step sets:

```text
MARKETING_VERSION = package.json version
CURRENT_PROJECT_VERSION = Git commit count
```

Thus App Store Connect's `Version` and `Build` map back to the same Git state used by the web build.

The iOS version sync modifies the local Xcode project build settings. Those generated build-number changes are not a new product version and should not be used as the source of truth; `package.json` and Git are authoritative.

## Bumping the product version

Use npm so both `package.json` and `package-lock.json` stay in sync:

```bash
npm version 0.2.2 --no-git-tag-version
```

Commit that version bump normally through a branch and PR.

After a release is actually published, tag the release commit on `main`:

```bash
git tag v0.2.2
git push origin v0.2.2
```

Do not tag every Cloudflare deployment.

# Discover local Projects

Nebula can find repository roots beneath folders you explicitly approve. Open **Settings → Local Projects**, add a development folder, then choose **Refresh**. Nebula never starts a full-home or full-disk scan.

Discovery is bounded to four directory levels, 200 results, 5,000 visited directories, or two seconds per refresh. It recognizes Git repositories and folders containing `package.json`, `Cargo.toml`, `Package.swift`, `pyproject.toml`, or `go.mod`. Dependency, build, cache, and hidden directories are skipped. Canonical filesystem paths are deduplicated, so the same repository cannot be registered twice through a symlink or trailing-slash variant.

Discovered repositories also appear in Search with an **Add & Open** label. That action registers the existing directory without creating or cloning files, then opens a canonical Thread. Already registered repositories show **Open**.

Remove an approved root at any time. This stops future discovery beneath that root; it does not delete Projects you already registered.

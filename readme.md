# Kladez Rust Actions

GitHub Actions for Rust projects.

## Actions

### `audit`

Run `cargo audit` with the given arguments.

#### Usage

Here is an example workflow that uses the `audit` action:

```yaml
name: Audit

on:
  pull_request:
    branches: [ main ]
  push:
    branches: [ main ]

jobs:
  audit:
    permissions:
      contents: read
      pull-requests: write

    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/cache@v2
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}

      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable

      - run: cargo install cargo-audit

      - uses: kladez/rust-actions/actions/audit@1
        with:
          args: --ignore RUSTSEC-2020-0001
          github_token: ${{ secrets.GITHUB_TOKEN }}
          github_pr_number: ${{ github.event.number }}
```

#### Inputs

- `args`: Additional arguments to pass to `cargo audit --json`.\
  Default: empty
- `github_token`: GitHub token to use for uploading artifacts.
- `github_pr_number`: Pull request number to use for uploading artifacts.

## License

This project is licensed under the MIT License.\
See the [license.txt](license.txt) file for details.

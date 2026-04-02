# Contributing to WonderChat

Thanks for wanting to contribute. Here's how to get started.

## Getting set up

1. Fork the repo and clone your fork
2. Follow the [Quick start](README.md#quick-start) instructions to get a local dev environment running
3. Create a branch off `main` for your work

## Making changes

- Keep PRs focused. One feature or fix per PR.
- Write clear commit messages. Say what changed and why.
- If you're adding a new API endpoint, include example `curl` commands in the PR description.
- If you're changing the database schema, include an Alembic migration.
- Don't reformat code that isn't related to your change.

## Code style

- Python: follow PEP 8. We use type hints throughout.
- JavaScript (widget): vanilla JS only, no framework dependencies.
- Keep functions short and named clearly. If a function needs a comment to explain what it does, rename it.

## What to work on

Check the [roadmap in the README](README.md#roadmap) for planned features. Issues labeled `good first issue` are a good starting point.

If you want to work on something big, open an issue first so we can discuss the approach before you write a bunch of code.

## Reporting bugs

Open a GitHub issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Python version, Docker version)

## Pull request process

1. Make sure the app starts without errors
2. Test your changes manually (automated tests are on the roadmap)
3. Open a PR against `main`
4. Describe what you changed and why
5. Wait for review

## Code of conduct

Be respectful. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

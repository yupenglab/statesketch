# Contributing to StateSketch

StateSketch is an early, solo-maintained project. Focused contributions are welcome, but please discuss changes that affect project scope or teaching semantics before investing significant effort.

## Local setup

Use Node.js 22 or later and npm:

```sh
npm ci
npm run dev
```

## Working agreement

- Use short-lived branches and focused pull requests.
- Add or update tests for behavior that changes.
- Run the canonical quality checks before opening a pull request.
- Treat accessibility regressions as correctness regressions.
- Preserve pedagogical accuracy and the limitations documented in the README.
- Keep domain logic independent of React and avoid premature generalization.

## Quality checks

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

## License

By contributing, you agree that your contributions are licensed under the MIT License.

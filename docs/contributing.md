# Contributing

This guide describes how changes get from an idea to `main`.

## Workflow

1. **One change per branch.** Each change gets its own branch, named by type:

| Prefix | For |
|---|---|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation only |
| `chore/` | Maintenance with no behavior change: dependencies, copy, tooling |

2. **Separate fixes.** If you find an unrelated bug while working on something, fix it on its own `fix/` branch with its own pull request.
3. **Small, frequent pull requests.** Open a PR as soon as one coherent piece of work is complete and passes the checks.
4. **Stacking.** When a change depends on another that hasn't merged yet, branch from it and set the PR's base to that branch. Merge stacked PRs in order, oldest first.

## Before opening a pull request

Every change must pass:

```sh
pnpm typecheck
pnpm test
pnpm --filter @tablemates/mobile exec expo lint
```

Then check against this list:

- [ ] **Privacy.** New reads of other people's data use `lib/visibility.ts`, return 404 for hidden resources, and have tests for a stranger, a friend outside the audience, and a private visit. See the [privacy model](privacy.md).
- [ ] **Contract.** Request and response shapes live in `packages/shared`.
- [ ] **Migrations.** Schema changes include a generated migration, and new tables are added to the test `truncate` list.
- [ ] **Notifications.** New alert types include push copy, Activity copy and a settings label.
- [ ] **UI.**
  - Uses design-system tokens and components.
  - Interactive elements have accessible labels and are at least 44 pt.
  - No pressable is nested inside another.
- [ ] **Design system.** New components or props are documented in `packages/ui/README.md` and shown in the style guide.
- [ ] **Docs.** User-facing behavior changes are reflected in [features](features.md), the [API reference](api.md) and, if relevant, the [privacy model](privacy.md).
- [ ] **Manual check.** Behavior that tests can't reach, such as the camera, push or native maps, was tried on a device or simulator, or the PR says it still needs to be.

## Pull request description

A good PR description says:

- **What's new:** the behavior, from the user's point of view.
- **Rules or privacy:** anything that decides who sees what.
- **Verification:** the tests added and what was checked by hand.
- **Not covered:** anything left to check on a device.

## Commit messages

- Write the summary line in the imperative ("Add food crawls", "Hide the recommend chip at zero").
- Keep commit messages, PR descriptions, code comments and documentation professional, with no emojis.
- Use the body to explain *why* the change was needed.

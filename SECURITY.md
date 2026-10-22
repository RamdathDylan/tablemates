# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report them privately through GitHub: on the repository's **Security** tab, choose **Report a vulnerability**. Include:

- what is affected,
- how to reproduce it, and
- the impact you expect.

Reports are acknowledged within a few days. Please give us reasonable time to fix the issue before disclosing it.

## Scope

In scope:
- The API in `apps/api`.
- The app in `apps/mobile`.
- The packages in `packages/`.

Of particular interest are issues that let one person see another person's private data, contrary to the [privacy model](docs/privacy.md).

Out of scope: the credentials in `docker-compose.yml` and the `.env.example` files. They're public development defaults by design, for services bound to `localhost`, and the API refuses to start in production with them.

## Handling secrets

- Real configuration lives in `apps/api/.env` and `apps/mobile/.env`, which git ignores. Only the templates are committed.
- GitHub secret scanning with push protection is enabled for this repository.
- If a secret is ever committed, rotate it with its provider immediately. Removing it from git history doesn't revoke it.

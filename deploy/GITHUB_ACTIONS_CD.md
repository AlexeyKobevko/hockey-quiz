# GitHub Actions: production deployment

This is a separate workflow in `.github/workflows/deploy.yml`; the existing CI workflow remains unchanged. After the `Verify Hockey Quiz` workflow succeeds for a push to `main`, the CD workflow deploys the verified commit (only if it is still the latest `main`). PRs run checks but never deploy. A concurrency lock prevents overlapping production deployments.

## One-time VPS prerequisites

- Ubuntu 24.04, compatible Node.js 24 at `/usr/bin/node`.
- `dev` SSH user with write access to `/opt/hockey-quiz/releases` and `/opt/hockey-quiz`.
- `hockey` system user (no login) and `hockey-quiz.service` installed under `/etc/systemd/system/`.
- `hockey-quiz.service` uses `User=hockey`, `WorkingDirectory=/opt/hockey-quiz/current`, `ExecStart=/usr/bin/node server/main.js`, `HOST=127.0.0.1`, `PORT=3707`, `TRUST_PROXY=1` and `Restart=on-failure`.
- `dev` has **only** this passwordless sudo command needed for CD: `/usr/bin/systemctl restart hockey-quiz.service`. Other administrative access should require a password.
- The public SSH key for GitHub Actions is present in `/home/dev/.ssh/authorized_keys`.
- A verified host key has been copied into the `VPS_KNOWN_HOSTS` repository secret.
- GitHub Actions repository secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`.

On the VPS, enable automatic startup once (not done by the workflow):

```sh
sudo systemctl daemon-reload
sudo systemd-analyze verify hockey-quiz.service
sudo systemctl enable hockey-quiz.service
```

Before the first deployment, confirm:

```sh
id hockey
ls -ld /opt/hockey-quiz /opt/hockey-quiz/releases
systemctl cat hockey-quiz.service
sudo -n -l /usr/bin/systemctl restart hockey-quiz.service
```

The `current` symlink need not exist for the first deploy. Ensure the `hockey` user can traverse `/opt/hockey-quiz` and read files produced by `dev`. The workflow itself does **not** install packages, edit Caddy or UFW, or change SSH/server configuration.

## What happens on a main push

1. Existing CI runs typecheck, lint, tests, build, release check, and Playwright.
2. Deploy job checks out the same commit and rebuilds `dist/` on the GitHub runner. **No build on the VPS.**
3. `dist/` is packed, uploaded with pinned SSH host verification, and extracted to a SHA-named directory.
4. `current` is atomically switched, and only `hockey-quiz.service` is restarted.
5. `http://127.0.0.1:3707/api/health` must return `ok: true`. On failure, the symlink is switched back and the previous release restarted.

For the **first deployment**, there is no previous version to restore. A failure leaves the unsuccessful release for diagnosis and marks the workflow failed.

One Node.js process stores all active game rooms **in RAM**. A successful redeploy **ends ongoing games**. Do not push to `main` during the event or an active game.

Caddy HTTPS and the public address are a **separate** server setup task, not implemented here. Production is not ready for mobile testing until HTTPS and real-operator connectivity have both been checked.

If service health fails after a rollout, inspect:

```sh
systemctl status hockey-quiz.service
sudo journalctl -u hockey-quiz.service -n 100 --no-pager
readlink /opt/hockey-quiz/current
curl -fsS http://127.0.0.1:3707/api/health
```

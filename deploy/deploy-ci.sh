#!/usr/bin/env bash
# Runs on the GitHub Actions runner, after CI and production build have passed.
set -Eeuo pipefail
umask 077

for name in VPS_HOST VPS_USER VPS_SSH_KEY VPS_KNOWN_HOSTS RELEASE_SHA; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required GitHub Actions value: $name" >&2
    exit 1
  fi
done

# These variables are used in SSH destinations and the remote command.
[[ "$VPS_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || { echo 'Invalid VPS_HOST' >&2; exit 1; }
[[ "$VPS_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo 'Invalid VPS_USER' >&2; exit 1; }
[[ "$RELEASE_SHA" =~ ^[a-fA-F0-9]{40}$ ]] || { echo 'Invalid RELEASE_SHA' >&2; exit 1; }

[[ -f dist/server/main.js && -f dist/client/index.html && -f dist/package.json ]] || {
  echo 'Incomplete production dist/. Refusing to deploy.' >&2
  exit 1
}

work_dir="$(mktemp -d)"
trap 'rm -rf -- "$work_dir"' EXIT
printf '%s\n' "$VPS_SSH_KEY" > "$work_dir/deploy_key"
printf '%s\n' "$VPS_KNOWN_HOSTS" > "$work_dir/known_hosts"
chmod 600 "$work_dir/deploy_key" "$work_dir/known_hosts"

ssh_opts=(
  -i "$work_dir/deploy_key"
  -o IdentitiesOnly=yes
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="$work_dir/known_hosts"
  -o ConnectTimeout=15
)
remote="${VPS_USER}@${VPS_HOST}"

# Fail before uploading or restarting anything when the target isn't prepared.
ssh "${ssh_opts[@]}" "$remote" \
  'test -w /opt/hockey-quiz/releases && systemctl cat hockey-quiz.service >/dev/null'

tar -C dist -czf "$work_dir/release.tgz" .
scp "${ssh_opts[@]}" "$work_dir/release.tgz" \
  "$remote:/opt/hockey-quiz/releases/.upload-${RELEASE_SHA}.tgz"

# The SHA has already been validated as 40 hexadecimal characters.
ssh "${ssh_opts[@]}" "$remote" "bash -s -- '$RELEASE_SHA'" \
  < deploy/activate-release.sh

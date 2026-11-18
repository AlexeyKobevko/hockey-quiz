#!/usr/bin/env bash
# Runs remotely as the unprivileged 'dev' SSH user.
set -Eeuo pipefail
umask 022

sha="${1:-}"
[[ "$sha" =~ ^[a-fA-F0-9]{40}$ ]] || { echo 'Invalid release SHA' >&2; exit 1; }

app='/opt/hockey-quiz'
releases="$app/releases"
archive="$releases/.upload-$sha.tgz"
stage="$releases/.stage-$sha"
release="$releases/$sha"
current="$app/current"
service='hockey-quiz.service'

[[ -d "$releases" && -w "$releases" ]] || { echo 'Release directory not writable' >&2; exit 1; }
[[ -f "$archive" ]] || { echo 'Uploaded archive missing' >&2; exit 1; }
systemctl cat "$service" >/dev/null || { echo 'systemd service missing' >&2; exit 1; }

cleanup() {
  rm -f -- "$archive" "$app/.current-next-$sha" "$app/.current-rollback-$sha"
  if [[ -d "$stage" && ! -L "$stage" ]]; then rm -rf -- "$stage"; fi
}
trap cleanup EXIT

if [[ ! -d "$release" ]]; then
  [[ ! -e "$stage" && ! -L "$stage" ]] || { echo 'Staging directory already exists' >&2; exit 1; }
  mkdir -m 755 -- "$stage"
  tar -xzf "$archive" --no-same-owner -C "$stage"
  [[ -f "$stage/server/main.js" && -f "$stage/client/index.html" && -f "$stage/package.json" ]] || {
    echo 'Incomplete release' >&2; exit 1;
  }
  mv -- "$stage" "$release"
fi

[[ -f "$release/server/main.js" && -f "$release/client/index.html" && -f "$release/package.json" ]] || {
  echo 'Release files missing' >&2; exit 1;
}

previous=''
if [[ -L "$current" ]]; then
  previous="$(readlink "$current")"
  [[ "$previous" =~ ^releases/[a-fA-F0-9]{40}$ ]] || {
    echo 'Current symlink points outside expected releases/ scheme' >&2; exit 1;
  }
elif [[ -e "$current" ]]; then
  echo 'Current exists but is not a symlink; refusing to overwrite' >&2
  exit 1
fi

set_current() {
  local target="$1" temp="$2"
  ln -s -- "$target" "$temp"
  mv -Tf -- "$temp" "$current"
}

healthy() {
  local i
  for ((i=1; i<=15; i++)); do
    if curl -fsS --max-time 2 'http://127.0.0.1:3707/api/health' 2>/dev/null |
      grep -q '"ok":true'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

set_current "releases/$sha" "$app/.current-next-$sha"

if sudo -n /usr/bin/systemctl restart "$service" && healthy; then
  echo "Deployment healthy: $sha"
  exit 0
fi

echo "Deployment failed health check: $sha" >&2
if [[ -n "$previous" ]]; then
  echo "Rolling back to: $previous" >&2
  set_current "$previous" "$app/.current-rollback-$sha"
  if sudo -n /usr/bin/systemctl restart "$service" && healthy; then
    echo 'Rollback succeeded' >&2
  else
    echo 'CRITICAL: rollback did not recover the service' >&2
  fi
else
  echo 'First deployment: no previous release to restore. Inspect service logs.' >&2
fi
exit 1

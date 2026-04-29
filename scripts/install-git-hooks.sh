#!/usr/bin/env bash
# Install repository git hooks. Run once per fresh clone.
set -eu

repo_root=$(git rev-parse --show-toplevel)
hooks_dir=$(git rev-parse --git-path hooks)

mkdir -p "$hooks_dir"

# pre-commit: block real PII patterns
cp "$repo_root/scripts/pre-commit-pii.sh" "$hooks_dir/pre-commit"
chmod +x "$hooks_dir/pre-commit"

echo "✓ Installed pre-commit hook → $hooks_dir/pre-commit"
echo "  (blocks Korean phone/RRN/bank account patterns; allowlist in scripts/pre-commit-pii.sh)"

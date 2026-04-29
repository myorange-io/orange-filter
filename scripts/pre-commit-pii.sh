#!/usr/bin/env bash
# Pre-commit hook: block real PII (phone/RRN/bank account) from entering history.
# Install: bun run install:hooks (or: ln -sf ../../scripts/pre-commit-pii.sh .git/hooks/pre-commit)
# Bypass (NOT recommended): git commit --no-verify

set -eu

STAGED=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$STAGED" ] && exit 0

# Detection patterns (real PII formats)
declare -a PATTERNS=(
  '01[016789]-[0-9]{4}-[0-9]{4}'                                   # Korean mobile
  '[0-9]{6}-[1-4][0-9]{6}'                                          # Korean RRN
  '(국민|신한|우리|하나|농협|기업|수협|새마을|우체국)[[:space:]]+[0-9]{3,6}-[0-9]{2,6}-[0-9]{3,7}'  # Bank account with prefix
)

# Allowlist: canonical fake values used in tests/docs.
# Add new entries here when you intentionally include a placeholder value.
declare -a ALLOW=(
  # Mobile placeholders
  '010-1234-5678' '010-2345-6789' '010-3456-7890' '010-0000-0000'
  # Repeating-digit synthetic patterns (common in tests)
  '010-1111-1111' '010-1111-2222' '010-2222-2222'
  '010-3333-3333' '010-3333-4444' '010-4444-4444'
  '010-5555-5555' '010-5555-6666' '010-6666-6666'
  '010-7777-7777' '010-8888-8888' '010-9999-9999'
  # RRN canonical test values
  '900101-1234567' '900101-1234568' '950510-1234567'
  # Bank account placeholders
  '우리 1002-100-100100' '우리 1002-200-200200'
  '하나 100-200300-40500' '신한 100-200-30040'
  '국민 100200-30-040506' '우리 100-200304-05-060'
  '하나 333-333333-33333'
  # Test fixture accounts
  '농협 100-12-345678'  # regression fixture
  '하나 296-18-09507'   # detector pattern docstring example
)

found=0
output=""

for file in $STAGED; do
  [ -f "$file" ] || continue
  diff_added=$(git diff --cached -U0 -- "$file" | grep -E '^\+[^+]' || true)
  [ -z "$diff_added" ] && continue

  for pattern in "${PATTERNS[@]}"; do
    matches=$(printf '%s' "$diff_added" | grep -oE "$pattern" || true)
    [ -z "$matches" ] && continue

    while IFS= read -r match; do
      [ -z "$match" ] && continue
      is_allowed=0
      for allow in "${ALLOW[@]}"; do
        case "$match" in *"$allow"*) is_allowed=1; break ;; esac
      done
      [ "$is_allowed" = "1" ] && continue
      output="${output}  ${file}: ${match}\n"
      found=1
    done <<< "$matches"
  done
done

if [ "$found" = "1" ]; then
  echo ""
  echo "❌ Pre-commit blocked: real PII pattern detected in staged changes."
  printf "$output"
  echo ""
  echo "Replace real PII with synthetic placeholders, or — if this is a known fake —"
  echo "add it to the ALLOW list in scripts/pre-commit-pii.sh."
  echo "Bypass (NOT recommended): git commit --no-verify"
  exit 1
fi

exit 0

#!/bin/bash
query=$(cat | jq -r '.query')
cd "$CLAUDE_PROJECT_DIR"

# fd common options
fd_opts=(
  --hidden --no-ignore
  --exclude node_modules
  --exclude .git
  --exclude build
  --exclude dist
  --exclude .next
  --exclude .nuxt
  --exclude .output
  --exclude .cache
  --exclude .venv
  --exclude __pycache__
  --exclude '*.pyc'
  --exclude .env
  --exclude '.env.*'
  --exclude .DS_Store
)

# Use --full-path to match against full path
# Output paths starting with query first, then other matches, deduplicated
{
  fd "${fd_opts[@]}" --full-path "^\./${query}" 2>/dev/null
  fd "${fd_opts[@]}" --full-path "${query}" 2>/dev/null
} | awk '!seen[$0]++' | head -20

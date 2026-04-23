#!/bin/bash
# Remove --cg from arguments
args=()
for arg in "$@"; do
  if [[ "$arg" != "--cg" ]]; then
    args+=("$arg")
  fi
done
exec /usr/local/bin/isolate_run_original "${args[@]}"

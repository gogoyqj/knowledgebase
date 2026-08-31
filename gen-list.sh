#!/bin/bash
# Generate list.json from all .html files except index.html
cd "$(dirname "$0")"

echo "[" > list.json
first=true
for f in *.html; do
  [ "$f" = "index.html" ] && continue
  name="${f%.html}"
  if [ "$first" = true ]; then
    first=false
  else
    echo "," >> list.json
  fi
  printf '  { "name": "%s", "src": "%s" }' "$name" "$f" >> list.json
done
echo "" >> list.json
echo "]" >> list.json

echo "Generated list.json with $(grep -c '"src"' list.json) entries"

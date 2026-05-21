#!/usr/bin/env bash
# Run after every change: build all packages and regenerate test outputs

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI="$SCRIPT_DIR/cli/dist/index.js"
OUT="$SCRIPT_DIR/test-output"

echo ""
echo "=== tibco-docgen test run ==="
echo ""

# 1. Build
echo "Building packages..."
(cd "$SCRIPT_DIR/packages/core" && npm run build --silent)
echo "  ✓ core"
(cd "$SCRIPT_DIR/packages/parser-flogo" && npm run build --silent)
echo "  ✓ parser-flogo"
(cd "$SCRIPT_DIR/packages/parser-bw6" && npm run build --silent)
echo "  ✓ parser-bw6"
(cd "$SCRIPT_DIR/packages/parser-ems" && npm run build --silent)
echo "  ✓ parser-ems"
(cd "$SCRIPT_DIR/cli" && npm run build --silent)
echo "  ✓ cli"
echo ""

# 2. Generate docs — format: "input_path|product_type|output_name"
apps=(
  # ── Flogo ──────────────────────────────────────────────────────────────────
  "C:/Users/mpandav/Downloads/Work/TIBCO/git/flogo-agent-studio/apps/agent-builder-service.flogo|flogo|agent-builder"
  "C:/Users/mpandav/Downloads/Work/TIBCO/git/flogo/flogo-custom-extensions/examples/gql-client/gql-client.flogo|flogo|gql-client"
  "C:/Users/mpandav/Downloads/Work/TIBCO/git/flogo/flogo-custom-extensions/examples/schema_converter/Schema_Converter_API.flogo|flogo|schema-converter"
  "C:/Users/mpandav/Downloads/Work/TIBCO/git/tibco-docgen/samples/telemetry-api.flogo|flogo|telemetry-api"

  # ── BW6 ────────────────────────────────────────────────────────────────────
  "C:/Users/mpandav/Downloads/Work/TIBCO/git/tibco-docgen/samples/order-management|bw6|order-management"
  "C:/Users/mpandav/Downloads/Work/TIBCO/git/tibco-docgen/samples/kafka-to-db|bw6|kafka-to-db"
  "C:/Users/mpandav/Downloads/Work/TIBCO/git/tibco-docgen/samples/bwceLib|bw6|bwceLib"

  # ── BW6 official samples (AppSpace / Container) ────────────────────────────
  "C:/Users/mpandav/Downloads/Work/TIBCO/git/tibco-docgen/samples/tibco-official/tibco.bw.sample.binding.soap.http.BookStore|bw6|bookstore-soap-appspace"
  "C:/Users/mpandav/Downloads/Work/TIBCO/git/tibco-docgen/samples/tibco-official/tibco.bwce.sample.binding.rest.BookStore|bw6|bookstore-rest-container"

  # ── BW6 EAR archives ───────────────────────────────────────────────────────
  "C:/Users/mpandav/Downloads/Work/TIBCO/BWCE/EAR/OrderSync.application_1.0.0.ear|bw6|ordersync-ear"
  "C:/Users/mpandav/Downloads/Work/TIBCO/BWCE/EAR/Rest_Sample_Multiple_Endpoints.application_1.0.0.ear|bw6|rest-multi-ear"

  # ── BW5 ────────────────────────────────────────────────────────────────────
  # (no samples yet)

  # ── EMS ────────────────────────────────────────────────────────────────────
  "C:/tibco/ems/10.3/samples/config|ems|ems-server"
)

for entry in "${apps[@]}"; do
  # Skip comment/blank lines
  [[ "$entry" =~ ^#.*$ || -z "$entry" ]] && continue

  IFS="|" read -r app_path product output_name <<< "$entry"
  dest="$OUT/$product/$output_name"
  echo "Generating: [$product] $output_name"
  node "$CLI" "$app_path" -o "$dest" --no-open
done

echo ""
echo "=== Output locations ==="
for entry in "${apps[@]}"; do
  [[ "$entry" =~ ^#.*$ || -z "$entry" ]] && continue
  IFS="|" read -r app_path product output_name <<< "$entry"
  dest="$OUT/$product/$output_name"
  echo "  [$product] file://$(cygpath -u "$dest" 2>/dev/null || echo "$dest")/index.html"
done
echo ""

# Test Apps

This directory contains test apps for the scanner.

## Structure

```
test-apps/
├── apps/           # ZIP files go here
└── reports/        # Generated reports
```

## Usage

```bash
# Scan an app
node src/scanner/cli.js scan "test-apps/apps/app.zip"

# Scan with custom output
node src/scanner/cli.js scan "test-apps/apps/app.zip" --output "test-apps/reports/app.json"
```

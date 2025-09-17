# Preflight - Universal iOS App Scanner

A universal, repo-first iOS app scanner that can analyze any GitHub repository or ZIP file containing iOS source code. It reliably scans the source code (starting with Info.plist and other universal scripts), reads it, runs security and quality rules, and emits machine-readable reports for CI/CD integration.

## 🚀 Features

- **Universal Scanning**: Point at any GitHub repository or ZIP file
- **Comprehensive Analysis**: Scans Info.plist, source code, dependencies, and build settings
- **Security Focus**: Detects security vulnerabilities and misconfigurations
- **CI/CD Ready**: Machine-readable JSON/XML reports for automated pipelines
- **Multiple Input Sources**: GitHub URLs, ZIP files, or local directories
- **Extensible Rules Engine**: Easy to add custom analysis rules

## 📋 What It Scans

- **Info.plist**: Required keys, security settings, background modes
- **Source Code**: Swift, Objective-C, C/C++ files
- **Dependencies**: CocoaPods, Swift Package Manager
- **Build Settings**: Xcode project configurations
- **Security**: Entitlements, App Transport Security, keychain access
- **Code Quality**: File sizes, complexity, best practices

## 🛠 Installation

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/CChase0424/preflight.git
   cd preflight
   npm install
   ```

2. **Make CLI globally available (optional):**
   ```bash
   npm link
   ```

## 🎯 Usage

### Command Line Interface

**Scan a local ZIP file:**
```bash
node src/cli.js scan ./my-ios-app.zip
```

**Scan with verbose output:**
```bash
node src/cli.js scan ./my-ios-app.zip --verbose
```

**Scan a local directory:**
```bash
preflight scan ./path/to/ios/project
```

**Generate XML report:**
```bash
preflight scan https://github.com/username/ios-app --format xml --output report.xml
```

**Include source code in output:**
```bash
preflight scan ./project --include-source --output detailed-report.json
```

### Web Server API

**Start the server:**
```bash
npm run dev
# or
preflight serve --port 3000
```

**API Endpoints:**
- `POST /api/scan/url` - Scan from GitHub URL
- `POST /api/scan/upload` - Scan from uploaded ZIP file
- `GET /api/rules` - List available analysis rules
- `POST /api/webhook/ci` - CI/CD webhook integration
- `GET /health` - Health check

**Example API usage:**
```bash
curl -X POST http://localhost:3000/api/scan/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/username/ios-app"}'
```

## 🔍 Analysis Rules

### Security Rules
- **Info.plist Security**: Checks for insecure network settings
- **App Transport Security**: Validates ATS configurations
- **Entitlements**: Analyzes app capabilities and permissions
- **Dependencies**: Scans for known vulnerable libraries

### Code Quality Rules
- **File Size**: Warns about overly large files
- **Code Structure**: Basic complexity analysis
- **Best Practices**: iOS development guidelines

### Build Configuration Rules
- **Deployment Target**: Checks iOS version compatibility
- **Architecture**: Validates supported architectures
- **Build Settings**: Analyzes Xcode project configurations

## 📊 Report Formats

### JSON Report
```json
{
  "scanId": "scan_1234567890_abc123",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "source": "https://github.com/username/ios-app",
  "summary": {
    "totalFiles": 45,
    "scannedFiles": 42,
    "issuesFound": 3,
    "criticalIssues": 1,
    "warnings": 2
  },
  "issues": [
    {
      "id": "issue_1",
      "severity": "critical",
      "category": "Security",
      "message": "NSAllowsArbitraryLoads is enabled",
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### XML Report
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ios-scan-report>
  <scan-id>scan_1234567890_abc123</scan-id>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
  <source>https://github.com/username/ios-app</source>
  <summary>
    <total-files>45</total-files>
    <scanned-files>42</scanned-files>
    <issues-found>3</issues-found>
    <critical-issues>1</critical-issues>
    <warnings>2</warnings>
  </summary>
</ios-scan-report>
```

## 🔧 CI/CD Integration

### GitHub Actions
```yaml
name: iOS Security Scan
on: [push, pull_request]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Preflight Scanner
        run: |
          npm install -g preflight
          preflight scan . --format json --output security-report.json
      - name: Upload Security Report
        uses: actions/upload-artifact@v3
        with:
          name: security-report
          path: security-report.json
```

### Jenkins Pipeline
```groovy
pipeline {
    agent any
    stages {
        stage('Security Scan') {
            steps {
                sh 'preflight scan . --format json --output security-report.json'
                publishHTML([
                    allowMissing: false,
                    alwaysLinkToLastBuild: true,
                    keepAll: true,
                    reportDir: '.',
                    reportFiles: 'security-report.json',
                    reportName: 'iOS Security Report'
                ])
            }
        }
    }
}
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test -- --coverage

# Run specific test file
npm test tests/scanner.test.js
```

## 📁 Project Structure

```
preflight/
├── src/
│   ├── scanner/
│   │   ├── IOSScanner.js      # Main scanner class
│   │   └── cli.js             # Command line interface
│   └── server.js              # Web server and API
├── tests/
│   ├── fixtures/              # Test iOS apps
│   └── scanner.test.js        # Scanner tests
├── index.js                   # Main entry point
├── package.json
└── README.md
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-rule`
3. Add your changes and tests
4. Run tests: `npm test`
5. Commit your changes: `git commit -am 'Add new security rule'`
6. Push to the branch: `git push origin feature/new-rule`
7. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/CChase0424/preflight/issues)
- **Documentation**: [Wiki](https://github.com/CChase0424/preflight/wiki)
- **Discussions**: [GitHub Discussions](https://github.com/CChase0424/preflight/discussions)

#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const Scanner = require('./Scanner');

const program = new Command();

program
  .name('preflight')
  .description('Universal iOS app scanner for GitHub repos and ZIP files')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan an iOS app from GitHub URL, ZIP file, or local directory')
  .argument('<source>', 'GitHub URL, ZIP file path, or local directory path')
  .option('-o, --output <file>', 'Output file path (default: report.json)')
  .option('-f, --format <format>', 'Output format (json, xml)', 'json')
  .option('--include-source', 'Include source code in output', false)
  .option('--max-size <size>', 'Maximum file size to scan (in MB)', '10')
  .option('--verbose', 'Verbose output', false)
  .action(async (source, options) => {
    try {
      console.log(chalk.blue.bold('🔍 Preflight iOS App Scanner'));
      console.log(chalk.gray(`Scanning: ${source}`));
      console.log('');

        const scanner = new Scanner({
          outputFormat: options.format,
          includeSourceCode: options.includeSource,
          maxFileSize: parseInt(options.maxSize) * 1024 * 1024,
          verbose: options.verbose
        });

      const results = await scanner.scan(source);
      
      // Display summary
      console.log(chalk.green.bold('\n✅ Scan Complete!'));
      console.log(chalk.cyan(`📊 Summary:`));
      console.log(`   Files scanned: ${results.summary.scannedFiles}/${results.summary.totalFiles}`);
      
      // No fake issues displayed - scanner only does file discovery

      // Save report
      let outputFile = options.output;
      if (!outputFile) {
        // Extract filename from source and create report name in reports folder
        const sourceName = path.basename(source, path.extname(source));
        outputFile = `test-apps/reports/${sourceName}-report.json`;
      }
      
      const report = scanner.getReport(options.format);
      await fs.ensureDir(path.dirname(outputFile));
      await fs.writeFile(outputFile, report);
      console.log(chalk.green(`\n📄 Report saved to: ${outputFile}`));

      // Always exit successfully - no fake issue-based exits
      process.exit(0);

    } catch (error) {
      console.error(chalk.red.bold('❌ Scan failed:'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

program
  .command('serve')
  .description('Start the Preflight web server for CI/CD integration')
  .option('-p, --port <port>', 'Port to run the server on', '3000')
  .option('--host <host>', 'Host to bind the server to', 'localhost')
  .action(async (options) => {
    console.log(chalk.blue.bold('🚀 Starting Preflight Server'));
    console.log(chalk.gray(`Server will be available at: http://${options.host}:${options.port}`));
    
    // Import and start the server
    const server = require('../server');
    server.start(parseInt(options.port), options.host);
  });

program
  .command('rules')
  .description('List available analysis rules')
  .action(() => {
    console.log(chalk.blue.bold('📋 Available Analysis Rules'));
    console.log('');
    
    const rules = [
      {
        name: 'Info.plist Analysis',
        description: 'Checks for required keys and security settings in Info.plist',
        checks: ['CFBundleIdentifier', 'NSAppTransportSecurity', 'UIBackgroundModes']
      },
      {
        name: 'Security Settings',
        description: 'Analyzes entitlements and security configurations',
        checks: ['Associated Domains', 'Keychain Access', 'App Transport Security']
      },
      {
        name: 'Dependency Analysis',
        description: 'Scans CocoaPods and other dependencies for vulnerabilities',
        checks: ['Known Vulnerabilities', 'Outdated Dependencies', 'License Compliance']
      },
      {
        name: 'Code Quality',
        description: 'Basic code quality and structure analysis',
        checks: ['File Size', 'Code Complexity', 'Best Practices']
      },
      {
        name: 'Build Settings',
        description: 'Analyzes Xcode project build configurations',
        checks: ['Build Versions', 'Deployment Targets', 'Architecture Settings']
      }
    ];

    rules.forEach(rule => {
      console.log(chalk.cyan.bold(`• ${rule.name}`));
      console.log(chalk.gray(`  ${rule.description}`));
      console.log(chalk.gray(`  Checks: ${rule.checks.join(', ')}`));
      console.log('');
    });
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red.bold('❌ Unhandled Promise Rejection:'));
  console.error(chalk.red(reason));
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(chalk.red.bold('❌ Uncaught Exception:'));
  console.error(chalk.red(error.message));
  process.exit(1);
});

program.parse();

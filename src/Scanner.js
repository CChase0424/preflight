const fs = require('fs-extra');
const path = require('path');
const plist = require('plist');
const xml2js = require('xml2js');
const { glob } = require('glob');
const yauzl = require('yauzl');
const axios = require('axios');
const ora = require('ora');

class Scanner {
  constructor(options = {}) {
    this.options = {
      outputFormat: 'json',
      includeSourceCode: false,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      ...options
    };
        this.results = {
          schemaVersion: '1.0.0',
          scanId: this.generateScanId(),
          timestamp: new Date().toISOString(),
          source: null,
          discovery: {
            files: []
          },
          analysis: {
            targets: []
          },
          summary: {
            totalFiles: 0,
            scannedFiles: 0
          },
          durationMs: 0
        };
    this.startTime = Date.now();
  }

  generateScanId() {
    return `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async scan(source) {
    const spinner = ora('Initializing iOS app scan...').start();
    
    try {
      this.results.source = source;
      
      // Determine source type and extract
      if (source.startsWith('http')) {
        await this.scanFromURL(source, spinner);
      } else if (source.endsWith('.zip')) {
        await this.scanFromZip(source, spinner);
      } else {
        await this.scanFromDirectory(source, spinner);
      }

      // Generate analysis (set file kinds)
      spinner.text = 'Analyzing app structure...';
      await this.generateAnalysis();

      // Analysis rules removed - no fake guidelines

      // Generate summary
      this.generateSummary();
      
      spinner.succeed('iOS app scan completed successfully!');
      return this.results;
      
    } catch (error) {
      spinner.fail(`Scan failed: ${error.message}`);
      throw error;
    }
  }

  async scanFromURL(url, spinner) {
    spinner.text = 'Downloading repository...';
    
    // Handle GitHub URLs
    if (url.includes('github.com')) {
      const zipUrl = this.convertGitHubUrlToZip(url);
      const response = await axios.get(zipUrl, { responseType: 'stream' });
      const tempZipPath = path.join(process.cwd(), 'temp', `${this.results.scanId}.zip`);
      
      await fs.ensureDir(path.dirname(tempZipPath));
      const writer = fs.createWriteStream(tempZipPath);
      response.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      
      await this.scanFromZip(tempZipPath, spinner);
      await fs.remove(tempZipPath);
    } else {
      throw new Error('Unsupported URL format. Currently only GitHub repositories are supported.');
    }
  }

  convertGitHubUrlToZip(url) {
    // Convert GitHub URL to ZIP download URL
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) throw new Error('Invalid GitHub URL format');
    
    const [, owner, repo] = match;
    const cleanRepo = repo.replace('.git', '');
    return `https://github.com/${owner}/${cleanRepo}/archive/refs/heads/main.zip`;
  }

  async scanFromZip(zipPath, spinner) {
    spinner.text = 'Extracting ZIP file...';
    
    const extractPath = path.join(process.cwd(), 'temp', this.results.scanId);
    await fs.ensureDir(extractPath);
    
    await new Promise((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) return reject(err);
        
        zipfile.readEntry();
        zipfile.on('entry', (entry) => {
          if (/\/$/.test(entry.fileName)) {
            // Directory entry
            zipfile.readEntry();
          } else {
            // File entry
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) return reject(err);
              
              const filePath = path.join(extractPath, entry.fileName);
              fs.ensureDirSync(path.dirname(filePath));
              const writeStream = fs.createWriteStream(filePath);
              
              readStream.pipe(writeStream);
              writeStream.on('close', () => zipfile.readEntry());
            });
          }
        });
        
        zipfile.on('end', resolve);
        zipfile.on('error', reject);
      });
    });
    
    // Find the main project directory (usually the first directory in the zip)
    const extractedDirs = await fs.readdir(extractPath);
    const projectDir = path.join(extractPath, extractedDirs[0]);
    
    await this.scanFromDirectory(projectDir, spinner);
    await fs.remove(extractPath);
  }

  async scanFromDirectory(dirPath, spinner) {
    spinner.text = 'Scanning directory structure...';
    
    if (!await fs.pathExists(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    // Find iOS-specific files
    const iosFiles = await this.findIOSFiles(dirPath);
    
    for (const file of iosFiles) {
      spinner.text = `Analyzing ${path.basename(file)}...`;
      await this.analyzeFile(file);
    }
  }

  async findIOSFiles(dirPath) {
    const patterns = [
      '**/Info.plist',
      '**/info.plist',  // Case insensitive
      '**/project.pbxproj',
      '**/*.entitlements'
    ];

    const files = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, { 
        cwd: dirPath, 
        absolute: true,
        ignore: [
          '**/Pods/**',
          '**/Carthage/**',
          '**/DerivedData/**',
          '**/build/**',
          '**/.build/**',
          '**/node_modules/**'
        ]
      });
      files.push(...matches);
    }

    // Remove duplicates and sort
    const uniqueFiles = [...new Set(files)].sort();
    
    // Log found files for debugging
    if (this.options.verbose) {
      console.log(`Found ${uniqueFiles.length} core iOS files:`);
      uniqueFiles.forEach(file => {
        const relativePath = path.relative(dirPath, file);
        console.log(`  - ${relativePath}`);
      });
    }

    return uniqueFiles;
  }

  async analyzeFile(filePath) {
    const relativePath = this.normalizePath(path.relative(process.cwd(), filePath));
    const fileInfo = {
      path: relativePath,
      type: this.getFileType(filePath),
      kind: this.getFileKind(filePath),
      size: (await fs.stat(filePath)).size,
      lastModified: (await fs.stat(filePath)).mtime.toISOString()
    };

    try {
      if (fileInfo.size > this.options.maxFileSize) {
        fileInfo.skipped = true;
        fileInfo.reason = 'File too large';
        this.results.discovery.files.push(fileInfo);
        return;
      }

      const content = await fs.readFile(filePath, 'utf8');
      fileInfo.content = this.options.includeSourceCode ? content : undefined;
      
      // Parse based on file type
      switch (fileInfo.type) {
        case 'plist':
          fileInfo.parsed = await this.parsePlist(content);
          fileInfo.resolved = this.resolvePlistSettings(fileInfo.parsed);
          break;
        case 'pbxproj':
          fileInfo.parsed = await this.parsePbxproj(content);
          break;
      }

      this.results.discovery.files.push(fileInfo);
      
    } catch (error) {
      fileInfo.error = error.message;
      this.results.discovery.files.push(fileInfo);
    }
  }

  getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();
    
    // Check for Info.plist (case insensitive)
    if (basename === 'info.plist') return 'plist';
    if (basename === 'project.pbxproj') return 'pbxproj';
    if (ext === '.entitlements') return 'entitlements';
    
    return 'unknown';
  }

  getFileKind(filePath) {
    const basename = path.basename(filePath).toLowerCase();
    
    if (basename === 'project.pbxproj') return 'project';
    if (basename === 'info.plist') {
      // We'll determine app vs test after parsing
      return 'plist';
    }
    
    return 'unknown';
  }

  normalizePath(filePath) {
    return filePath.replace(/\\/g, '/');
  }

  resolvePlistSettings(parsed) {
    const resolved = {
      bundleId: null,
      executable: null,
      unresolved: false
    };

    // Check for unresolved macros
    if (parsed.CFBundleIdentifier) {
      if (parsed.CFBundleIdentifier.startsWith('$(') || parsed.CFBundleIdentifier.startsWith('${')) {
        resolved.unresolved = true;
      } else {
        resolved.bundleId = parsed.CFBundleIdentifier;
      }
    }

    if (parsed.CFBundleExecutable) {
      if (parsed.CFBundleExecutable.startsWith('$(') || parsed.CFBundleExecutable.startsWith('${')) {
        resolved.unresolved = true;
      } else {
        resolved.executable = parsed.CFBundleExecutable;
      }
    }

    return resolved;
  }

  async parsePlist(content) {
    try {
      return plist.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse plist: ${error.message}`);
    }
  }

  async parsePbxproj(content) {
    // Basic Xcode project file parsing
    const lines = content.split('\n');
    const sections = {
      objects: {},
      rootObject: null,
      archiveVersion: null,
      objectVersion: null
    };

    let currentSection = null;
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('// !$*')) {
        currentSection = trimmed.replace('// !$*', '').trim();
      } else if (trimmed.startsWith('rootObject = ')) {
        sections.rootObject = trimmed.replace('rootObject = ', '').replace(';', '');
      } else if (trimmed.startsWith('archiveVersion = ')) {
        sections.archiveVersion = trimmed.replace('archiveVersion = ', '').replace(';', '');
      } else if (trimmed.startsWith('objectVersion = ')) {
        sections.objectVersion = trimmed.replace('objectVersion = ', '').replace(';', '');
      }
    }

    return sections;
  }

  async parseSourceCode(content, type) {
    // Basic source code analysis
    const lines = content.split('\n');
    return {
      lines: lines.length,
      characters: content.length,
      imports: lines.filter(line => line.trim().startsWith('import ')).length,
      classes: (content.match(/class\s+\w+/g) || []).length,
      functions: (content.match(/func\s+\w+/g) || []).length,
      comments: lines.filter(line => line.trim().startsWith('//')).length
    };
  }

  async parsePodfile(content) {
    const lines = content.split('\n');
    const pods = [];
    
    for (const line of lines) {
      const match = line.match(/pod\s+['"]([^'"]+)['"]/);
      if (match) {
        pods.push(match[1]);
      }
    }
    
    return { pods };
  }

  // All fake analysis rules removed - scanner now only does file discovery and parsing

  async generateAnalysis() {
    // Set correct kind for plist files based on CFBundlePackageType
    this.results.discovery.files.forEach(file => {
      if (file.type === 'plist' && file.parsed) {
        if (file.parsed.CFBundlePackageType === 'APPL') {
          file.kind = 'app';
        } else if (file.parsed.CFBundlePackageType === 'BNDL') {
          file.kind = 'test';
        } else {
          file.kind = 'plist';
        }
      }
    });

    // Find the primary app plist
    const appPlist = this.results.discovery.files.find(f => f.kind === 'app');
    if (appPlist) {
      this.results.chosenPlist = appPlist.path;
    }

    const plistFiles = this.results.discovery.files.filter(f => f.type === 'plist' && f.parsed);
    const pbxprojFiles = this.results.discovery.files.filter(f => f.type === 'pbxproj' && f.parsed);

    for (const plist of plistFiles) {
      // Skip test targets for now, focus on main app
      if (plist.kind === 'test') {
        continue;
      }

      const target = {
        name: this.extractTargetName(plist.path),
        plist: plist.path,
        pbxproj: this.findMatchingPbxproj(plist.path, pbxprojFiles),
        resolved: this.resolveBuildSettings(plist.parsed),
        config: this.extractKeyConfig(plist.parsed)
      };

      this.results.analysis.targets.push(target);
    }
  }

  extractTargetName(plistPath) {
    const pathParts = plistPath.split(/[\/\\]/);
    // Find the directory containing the Info.plist
    const plistIndex = pathParts.findIndex(part => part === 'Info.plist');
    if (plistIndex > 0) {
      return pathParts[plistIndex - 1];
    }
    return 'App';
  }

  findMatchingPbxproj(plistPath, pbxprojFiles) {
    // Find the closest pbxproj file
    const plistDir = path.dirname(plistPath);
    for (const pbxproj of pbxprojFiles) {
      if (pbxproj.path.includes(plistDir.split(/[\/\\]/)[0])) {
        return pbxproj.path;
      }
    }
    return pbxprojFiles[0]?.path || null;
  }

  resolveBuildSettings(parsed) {
    const resolved = {};
    
    // Try to resolve bundle ID
    resolved.bundleId = parsed.CFBundleIdentifier || '$(PRODUCT_BUNDLE_IDENTIFIER)';
    if (resolved.bundleId.startsWith('$(')) {
      resolved.unresolved = true;
      resolved.bundleIdNote = 'Bundle ID contains unresolved macro';
    }

    // Try to resolve display name
    resolved.displayName = parsed.CFBundleDisplayName || parsed.CFBundleName || '$(PRODUCT_NAME)';
    if (resolved.displayName.startsWith('$(')) {
      resolved.unresolved = true;
      resolved.displayNameNote = 'Display name contains unresolved macro';
    }

    // Try to resolve minimum OS (from deployment target in pbxproj)
    resolved.minimumOS = 'Unknown';
    
    return resolved;
  }

  extractKeyConfig(parsed) {
    const config = {
      privacyKeysPresent: [],
      backgroundModes: [],
      ats: {},
      urlSchemesCount: 0
    };

    // Extract privacy keys
    const privacyKeys = [
      'NSLocationAlwaysUsageDescription',
      'NSLocationWhenInUseUsageDescription',
      'NSCameraUsageDescription',
      'NSMicrophoneUsageDescription',
      'NSPhotoLibraryUsageDescription',
      'NSContactsUsageDescription',
      'NSCalendarsUsageDescription',
      'NSRemindersUsageDescription'
    ];

    for (const key of privacyKeys) {
      if (parsed[key]) {
        config.privacyKeysPresent.push(key);
      }
    }

    // Extract background modes
    if (parsed.UIBackgroundModes) {
      config.backgroundModes = Array.isArray(parsed.UIBackgroundModes) 
        ? parsed.UIBackgroundModes 
        : [parsed.UIBackgroundModes];
    }

    // Extract App Transport Security settings
    if (parsed.NSAppTransportSecurity) {
      config.ats = parsed.NSAppTransportSecurity;
    }

    // Count URL schemes (if present)
    if (parsed.CFBundleURLTypes) {
      config.urlSchemesCount = Array.isArray(parsed.CFBundleURLTypes) 
        ? parsed.CFBundleURLTypes.length 
        : 1;
    }

    return config;
  }

  generateSummary() {
    this.results.summary.totalFiles = this.results.discovery.files.length;
    this.results.summary.scannedFiles = this.results.discovery.files.filter(f => !f.skipped && !f.error).length;
    this.results.durationMs = Date.now() - this.startTime;
  }

  getReport(format = 'json') {
    switch (format.toLowerCase()) {
      case 'json':
        return this.getMinimalReport();
      case 'xml':
        return this.generateXMLReport();
      default:
        throw new Error(`Unsupported output format: ${format}`);
    }
  }

  getMinimalReport() {
    const minimal = {
      schema: "preflight-1",
      scanId: this.results.scanId,
      source: this.results.source,
      timestamp: this.results.timestamp,
      files: this.results.discovery.files
        .filter(file => ['pbxproj', 'plist', 'entitlements'].includes(file.type))
        .map(file => ({
          path: this.normalizePath(file.path),
          type: file.type
        })),
      summary: this.getMinimalSummary()
    };

    return JSON.stringify(minimal, null, 2);
  }

  getMinimalSummary() {
    const files = this.results.discovery.files.filter(f => ['pbxproj', 'plist', 'entitlements'].includes(f.type));
    return {
      pbxproj: files.filter(f => f.type === 'pbxproj').length,
      plist: files.filter(f => f.type === 'plist').length,
      entitlements: files.filter(f => f.type === 'entitlements').length
    };
  }

  generateXMLReport() {
    // Basic XML report generation
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<ios-scan-report>\n';
    xml += `  <scan-id>${this.results.scanId}</scan-id>\n`;
    xml += `  <timestamp>${this.results.timestamp}</timestamp>\n`;
    xml += `  <source>${this.results.source}</source>\n`;
    xml += '  <summary>\n';
    xml += `    <total-files>${this.results.summary.totalFiles}</total-files>\n`;
    xml += `    <scanned-files>${this.results.summary.scannedFiles}</scanned-files>\n`;
    xml += `    <issues-found>${this.results.summary.issuesFound}</issues-found>\n`;
    xml += `    <critical-issues>${this.results.summary.criticalIssues}</critical-issues>\n`;
    xml += `    <warnings>${this.results.summary.warnings}</warnings>\n`;
    xml += '  </summary>\n';
    xml += '</ios-scan-report>';
    return xml;
  }
}

module.exports = Scanner;

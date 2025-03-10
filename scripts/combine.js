// scripts/combine.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Channel configurations
const channels = ['wowmind', 'aitmir', 'blogem'];
const combinedDir = path.join(rootDir, 'dist', 'combined');

// Ensure combined directory exists
if (!fs.existsSync(combinedDir)) {
  fs.mkdirSync(combinedDir, { recursive: true });
  console.log('Created combined directory');
}

// Process each channel
for (const channel of channels) {
  const sourceDir = path.join(rootDir, 'dist', channel);
  
  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory for ${channel} does not exist`);
    continue;
  }
  
  // Copy channel build to combined directory
  copyDirectory(sourceDir, combinedDir);
  console.log(`Copied ${channel} build to combined directory`);
  
  // Rename index.html to channel-specific name
  const indexPath = path.join(combinedDir, 'index.html');
  const targetPath = path.join(combinedDir, `${channel}.html`);
  
  if (fs.existsSync(indexPath)) {
    fs.renameSync(indexPath, targetPath);
    console.log(`Renamed index.html to ${channel}.html`);
  } else {
    console.error(`index.html not found for ${channel}`);
  }
}

console.log('Combined build completed successfully');

// Function to copy a directory recursively
function copyDirectory(source, destination) {
  const files = fs.readdirSync(source);
  
  for (const file of files) {
    const sourcePath = path.join(source, file);
    const destPath = path.join(destination, file);
    
    const stats = fs.statSync(sourcePath);
    
    if (stats.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyDirectory(sourcePath, destPath);
    } else {
      // Don't overwrite existing HTML files to avoid losing renamed files
      if (file === 'index.html' && fs.existsSync(destPath)) {
        continue;
      }
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}
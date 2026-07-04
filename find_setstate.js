import fs from 'fs';
import path from 'path';

const libDir = '../customer_app/lib';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

console.log("=== SCANNING FOR SETSTATE OR NOTIFYLISTENERS IN STREAM CALLBACKS ===");

walkDir(libDir, filePath => {
  if (!filePath.endsWith('.dart')) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.includes('setState') || content.includes('notifyListeners')) {
    // Read the file and look for setState or notifyListeners called in a callback
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if ((line.includes('setState') || line.includes('notifyListeners')) && 
          (line.includes('=>') || line.includes('listen(') || line.includes('builder:'))) {
        console.log(`${filePath.replace(/\\/g, '/')}:${index + 1} -> ${line.trim()}`);
      }
    });
  }
});

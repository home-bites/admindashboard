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

const pattern = /NotificationService/;

walkDir(libDir, filePath => {
  if (!filePath.endsWith('.dart')) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (pattern.test(line)) {
      console.log(`${filePath.replace(/\\/g, '/')}:${index + 1} -> ${line.trim()}`);
    }
  });
});

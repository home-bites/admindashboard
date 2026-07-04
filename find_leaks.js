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

const patterns = {
  listen: /\.listen\(/,
  streamBuilder: /StreamBuilder/,
  futureBuilder: /FutureBuilder/,
  firestoreWrite: /\.(update|set|add)\(/,
  notifyListeners: /notifyListeners\(\)/
};

console.log("=== SCANNING FOR POTENTIAL RESOURCE LEAKS ===");

const results = [];

walkDir(libDir, filePath => {
  if (!filePath.endsWith('.dart')) return;

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    let matches = [];
    if (patterns.listen.test(line)) matches.push("Stream.listen");
    if (patterns.streamBuilder.test(line)) matches.push("StreamBuilder");
    if (patterns.futureBuilder.test(line)) matches.push("FutureBuilder");
    if (patterns.firestoreWrite.test(line)) matches.push("Firestore Write");

    if (matches.length > 0) {
      results.push({
        file: filePath.replace(/\\/g, '/'),
        line: lineNum,
        content: line.trim(),
        matches: matches.join(", ")
      });
    }
  });
});

results.forEach(res => {
  console.log(`[${res.matches}] File: ${res.file}:${res.line} -> ${res.content}`);
});

console.log(`=== SCAN COMPLETED: FOUND ${results.length} OCCURRENCES ===`);

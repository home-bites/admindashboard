import fs from "fs";
import path from "path";

const srcDir = "./src";

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDir(fullPath);
    } else if (file.endsWith(".jsx") || file.endsWith(".js")) {
      const content = fs.readFileSync(fullPath, "utf-8");
      if (content.includes("onSnapshot")) {
        console.log(`Found onSnapshot in file: ${fullPath}`);
        // Find matching lines
        const lines = content.split("\n");
        lines.forEach((line, index) => {
          if (line.includes("onSnapshot")) {
            console.log(`  Line ${index + 1}: ${line.trim()}`);
          }
        });
      }
    }
  }
}

searchDir(srcDir);

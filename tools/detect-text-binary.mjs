#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

/**
 * Get all tracked files from git
 */
function getTrackedFiles() {
  try {
    const output = execSync("git ls-files -z", { encoding: "utf-8" });
    return output.split("\0").filter(file => file.length > 0);
  } catch (error) {
    console.error("Error getting tracked files:", error.message);
    process.exit(1);
  }
}

/**
 * Get file type using the 'file' command
 */
function getFileType(filePath) {
  try {
    const output = execSync(`file "${filePath}"`, { encoding: "utf-8" });
    return output.trim();
  } catch (error) {
    console.warn(`Could not get file type for ${filePath}:`, error.message);
    return "unknown";
  }
}

/**
 * Check if a file type indicates binary data
 */
function isBinaryType(fileType) {
  const lowerType = fileType.toLowerCase();
  return lowerType.includes("data") || 
         lowerType.includes("8svx") || 
         lowerType.includes("iff") ||
         lowerType.includes("executable") ||
         lowerType.includes("binary");
}

/**
 * Check if a file type indicates text data
 */
function isTextType(fileType) {
  const lowerType = fileType.toLowerCase();
  return lowerType.includes("ascii text") || 
         lowerType.includes("utf-8") ||
         lowerType.includes("unicode text") ||
         lowerType.includes("text") ||
         lowerType.includes("json data") ||
         lowerType.includes("xml") ||
         lowerType.includes("yaml");
}

/**
 * Check if a file should be binary based on its extension
 */
function shouldBeBinary(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".8svx" || filePath.includes("/goldens/") && ext === ".8svx";
}

/**
 * Check if a file should be text based on its extension
 */
function shouldBeText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const textExtensions = [".json", ".md", ".ts", ".mjs", ".yml", ".yaml", ".js", ".html", ".css", ".txt"];
  return textExtensions.includes(ext);
}

/**
 * Check line endings in a text file
 */
function checkLineEndings(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const hasCrlf = content.includes("\r\n");
    const hasLf = content.includes("\n");
    
    if (hasCrlf && !hasLf) {
      return "CRLF";
    } else if (hasLf && !hasCrlf) {
      return "LF";
    } else if (hasCrlf && hasLf) {
      return "mixed";
    } else {
      return "none";
    }
  } catch (error) {
    return "unknown";
  }
}

/**
 * Main function
 */
function main() {
  console.log("Checking file encodings and line endings...");
  
  const trackedFiles = getTrackedFiles();
  const violations = [];
  const lineEndingViolations = [];
  
  for (const filePath of trackedFiles) {
    if (!fs.existsSync(filePath)) {
      continue; // Skip files that don't exist on disk
    }
    
    const fileType = getFileType(filePath);
    const isBinary = isBinaryType(fileType);
    const isText = isTextType(fileType);
    
    // Check if file should be binary
    if (shouldBeBinary(filePath)) {
      if (!isBinary) {
        violations.push({
          file: filePath,
          expected: "binary",
          detected: fileType,
          issue: "Should be binary but detected as text"
        });
      }
    }
    
    // Check if file should be text
    if (shouldBeText(filePath)) {
      if (!isText) {
        violations.push({
          file: filePath,
          expected: "text",
          detected: fileType,
          issue: "Should be text but detected as binary"
        });
      } else {
        // Check line endings for text files
        const lineEnding = checkLineEndings(filePath);
        if (lineEnding === "CRLF") {
          lineEndingViolations.push({
            file: filePath,
            lineEnding: lineEnding,
            issue: "Uses CRLF line endings (should use LF)"
          });
        } else if (lineEnding === "mixed") {
          lineEndingViolations.push({
            file: filePath,
            lineEnding: lineEnding,
            issue: "Uses mixed line endings"
          });
        }
      }
    }
  }
  
  // Report violations
  if (violations.length > 0) {
    console.error("❌ File encoding violations found:");
    for (const violation of violations) {
      console.error(`  ${violation.file}: ${violation.issue}`);
      console.error(`    Expected: ${violation.expected}`);
      console.error(`    Detected: ${violation.detected}`);
    }
  }
  
  if (lineEndingViolations.length > 0) {
    console.error("❌ Line ending violations found:");
    for (const violation of lineEndingViolations) {
      console.error(`  ${violation.file}: ${violation.issue}`);
    }
  }
  
  const totalViolations = violations.length + lineEndingViolations.length;
  
  if (totalViolations === 0) {
    console.log("✅ All file encodings and line endings are correct");
  } else {
    console.error(`\nFound ${totalViolations} violations:`);
    console.error(`  - ${violations.length} encoding violations`);
    console.error(`  - ${lineEndingViolations.length} line ending violations`);
    console.error("");
    console.error("To fix these issues:");
    console.error("1. For encoding violations: check file content and ensure proper format");
    console.error("2. For line ending violations: convert CRLF to LF using your editor or git config");
    console.error("   - Set git config core.autocrlf false");
    console.error("   - Use dos2unix or similar tool to convert files");
    process.exit(1);
  }
}

main();

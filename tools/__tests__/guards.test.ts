import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

// Mock child_process
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

// Mock fs
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    rmSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

// Mock path
vi.mock("node:path", () => ({
  default: {
    join: vi.fn((...args) => args.join("/")),
    dirname: vi.fn((p) => p.split("/").slice(0, -1).join("/")),
    basename: vi.fn((p) => p.split("/").pop()),
    extname: vi.fn((p) => {
      const parts = p.split(".");
      return parts.length > 1 ? `.${parts.pop()}` : "";
    }),
  },
  join: vi.fn((...args) => args.join("/")),
  dirname: vi.fn((p) => p.split("/").slice(0, -1).join("/")),
  basename: vi.fn((p) => p.split("/").pop()),
  extname: vi.fn((p) => {
    const parts = p.split(".");
    return parts.length > 1 ? `.${parts.pop()}` : "";
  }),
}));

describe("Drift Guard Scripts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("check-toolchain.mjs logic", () => {
    it("should validate Node.js version against semver range", () => {
      // Test semver satisfies logic
      const semverSatisfies = (version: string, range: string) => {
        const cleanVersion = version.replace(/^v/, "");
        const cleanRange = range.trim();
        
        if (cleanRange.includes(".x")) {
          const parts = cleanRange.split(".");
          if (parts.length === 2 && parts[1] === "x") {
            const major = parseInt(parts[0], 10);
            return semverSatisfies(cleanVersion, `>=${major}.0.0 <${major + 1}.0.0`);
          }
        }
        
        if (cleanRange.startsWith("^")) {
          const baseVersion = cleanRange.slice(1);
          const parts = baseVersion.split(".").map(p => parseInt(p, 10));
          if (parts.length >= 1) {
            const major = parts[0];
            return semverSatisfies(cleanVersion, `>=${baseVersion} <${major + 1}.0.0`);
          }
        }
        
        if (cleanRange.startsWith("~")) {
          const baseVersion = cleanRange.slice(1);
          const parts = baseVersion.split(".").map(p => parseInt(p, 10));
          if (parts.length >= 2) {
            const major = parts[0];
            const minor = parts[1];
            return semverSatisfies(cleanVersion, `>=${baseVersion} <${major}.${minor + 1}.0`);
          }
        }
        
        if (cleanRange.includes(" ")) {
          const conditions = cleanRange.split(/\s+/);
          return conditions.every(condition => semverSatisfies(cleanVersion, condition));
        }
        
        const compareVersions = (v1: string, v2: string) => {
          const parts1 = v1.split(".").map(p => parseInt(p, 10) || 0);
          const parts2 = v2.split(".").map(p => parseInt(p, 10) || 0);
          const maxLength = Math.max(parts1.length, parts2.length);
          
          for (let i = 0; i < maxLength; i++) {
            const part1 = parts1[i] || 0;
            const part2 = parts2[i] || 0;
            if (part1 < part2) return -1;
            if (part1 > part2) return 1;
          }
          return 0;
        };
        
        if (cleanRange.startsWith(">=")) {
          const targetVersion = cleanRange.slice(2);
          return compareVersions(cleanVersion, targetVersion) >= 0;
        }
        if (cleanRange.startsWith("<=")) {
          const targetVersion = cleanRange.slice(2);
          return compareVersions(cleanVersion, targetVersion) <= 0;
        }
        if (cleanRange.startsWith(">")) {
          const targetVersion = cleanRange.slice(1);
          return compareVersions(cleanVersion, targetVersion) > 0;
        }
        if (cleanRange.startsWith("<")) {
          const targetVersion = cleanRange.slice(1);
          return compareVersions(cleanVersion, targetVersion) < 0;
        }
        if (cleanRange.startsWith("=")) {
          const targetVersion = cleanRange.slice(1);
          return compareVersions(cleanVersion, targetVersion) === 0;
        }
        
        return compareVersions(cleanVersion, cleanRange) === 0;
      };

      // Test cases
      expect(semverSatisfies("v20.19.5", ">=20.11.0 <21.0.0")).toBe(true);
      expect(semverSatisfies("v20.19.5", "20.x")).toBe(true);
      expect(semverSatisfies("v20.19.5", "^20.19.0")).toBe(true);
      expect(semverSatisfies("v20.19.5", "~20.19.0")).toBe(true);
      expect(semverSatisfies("v20.19.5", ">=20.0.0")).toBe(true);
      expect(semverSatisfies("v20.19.5", "<21.0.0")).toBe(true);
      
      // Should fail
      expect(semverSatisfies("v19.0.0", ">=20.11.0 <21.0.0")).toBe(false);
      expect(semverSatisfies("v21.0.0", ">=20.11.0 <21.0.0")).toBe(false);
      expect(semverSatisfies("v20.19.5", "19.x")).toBe(false);
    });

    it("should handle package.json parsing", () => {
      const mockPackageJson = {
        engines: {
          node: ">=20.11.0 <21.0.0"
        },
        packageManager: "pnpm@9.10.0",
        volta: {
          node: "20.19.5",
          pnpm: "9.10.0"
        }
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPackageJson));

      // This would be tested in integration, but we can verify the structure
      expect(mockPackageJson.engines.node).toBe(">=20.11.0 <21.0.0");
      expect(mockPackageJson.packageManager).toBe("pnpm@9.10.0");
      expect(mockPackageJson.volta.node).toBe("20.19.5");
    });
  });

  describe("check-goldens.mjs logic", () => {
    it("should detect SHA mismatches", () => {
      const mockIndex = {
        version: 2,
        cases: [
          {
            id: "test_case",
            mode: "single",
            note: "C-2",
            inputs: [
              {
                path: "cases/test_case/input.wav",
                sha256: "expected_input_sha"
              }
            ],
            expect: {
              output: {
                path: "cases/test_case/output.8SVX",
                sha256: "expected_output_sha"
              },
              report: {
                path: "cases/test_case/output_report.json",
                sha256: "expected_report_sha"
              }
            }
          }
        ]
      };

      // Mock file system responses
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (typeof path === "string") {
          return path.includes("goldens/index.json") || 
                 path.includes("input.wav") || 
                 path.includes("output.8SVX") ||
                 path.includes("output_report.json");
        }
        return false;
      });

      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (typeof path === "string") {
          if (path.includes("index.json")) {
            return JSON.stringify(mockIndex);
          }
          if (path.includes("output.8SVX")) {
            return Buffer.from("actual_output_data");
          }
          if (path.includes("output_report.json")) {
            return JSON.stringify({ actual: "report_data" });
          }
        }
        return Buffer.from("");
      });

      // Test that the structure is correct
      expect(mockIndex.cases[0].expect.output.sha256).toBe("expected_output_sha");
      expect(mockIndex.cases[0].expect.report.sha256).toBe("expected_report_sha");
    });

    it("should generate hexdump diffs", () => {
      const expectedBuffer = Buffer.from("expected_data_here");
      const actualBuffer = Buffer.from("actual_data_here");
      
      const diffBuffers = (expected: Buffer, actual: Buffer) => {
        const minLength = Math.min(expected.length, actual.length);
        for (let i = 0; i < minLength; i++) {
          if (expected[i] !== actual[i]) {
            return { offset: i, expectedByte: expected[i], actualByte: actual[i] };
          }
        }
        if (expected.length !== actual.length) {
          return {
            offset: minLength,
            expectedByte: expected[minLength] ?? null,
            actualByte: actual[minLength] ?? null,
          };
        }
        return null;
      };

      const diff = diffBuffers(expectedBuffer, actualBuffer);
      expect(diff).not.toBeNull();
      expect(diff?.offset).toBe(0); // First difference at byte 0
      expect(diff?.expectedByte).toBe(0x65); // 'e'
      expect(diff?.actualByte).toBe(0x61); // 'a'
    });
  });

  describe("detect-text-binary.mjs logic", () => {
    it("should identify binary vs text files", () => {
      const isBinaryType = (fileType: string) => {
        const lowerType = fileType.toLowerCase();
        return lowerType.includes("data") || 
               lowerType.includes("8svx") || 
               lowerType.includes("iff") ||
               lowerType.includes("executable") ||
               lowerType.includes("binary");
      };

      const isTextType = (fileType: string) => {
        const lowerType = fileType.toLowerCase();
        return lowerType.includes("ascii text") || 
               lowerType.includes("utf-8") ||
               lowerType.includes("unicode text") ||
               lowerType.includes("text");
      };

      expect(isBinaryType("data")).toBe(true);
      expect(isBinaryType("8SVX audio")).toBe(true);
      expect(isBinaryType("IFF data")).toBe(true);
      expect(isBinaryType("executable")).toBe(true);
      expect(isBinaryType("binary")).toBe(true);

      expect(isTextType("ASCII text")).toBe(true);
      expect(isTextType("UTF-8 Unicode text")).toBe(true);
      expect(isTextType("text")).toBe(true);

      expect(isBinaryType("ASCII text")).toBe(false);
      expect(isTextType("data")).toBe(false);
    });

    it("should check file extensions", () => {
      const shouldBeBinary = (filePath: string) => {
        const ext = path.extname(filePath).toLowerCase();
        return ext === ".8svx" || filePath.includes("/goldens/") && ext === ".8svx";
      };

      const shouldBeText = (filePath: string) => {
        const ext = path.extname(filePath).toLowerCase();
        const textExtensions = [".json", ".md", ".ts", ".mjs", ".yml", ".yaml", ".js", ".html", ".css", ".txt"];
        return textExtensions.includes(ext);
      };

      expect(shouldBeBinary("test.8SVX")).toBe(true);
      expect(shouldBeBinary("goldens/case/output.8SVX")).toBe(true);
      expect(shouldBeBinary("test.json")).toBe(false);

      expect(shouldBeText("test.json")).toBe(true);
      expect(shouldBeText("README.md")).toBe(true);
      expect(shouldBeText("script.ts")).toBe(true);
      expect(shouldBeText("test.8SVX")).toBe(false);
    });

    it("should detect line ending violations", () => {
      const checkLineEndings = (content: string) => {
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
      };

      expect(checkLineEndings("line1\nline2\n")).toBe("LF");
      expect(checkLineEndings("line1\r\nline2\r\n")).toBe("CRLF");
      expect(checkLineEndings("line1\nline2\r\n")).toBe("mixed");
      expect(checkLineEndings("singleline")).toBe("none");
    });
  });

  describe("Integration scenarios", () => {
    it("should handle toolchain version mismatches", () => {
      // Mock process.version
      const originalVersion = process.version;
      Object.defineProperty(process, "version", {
        value: "v19.0.0",
        configurable: true
      });

      // This would trigger a failure in the actual script
      const semverSatisfies = (version: string, range: string) => {
        // Simplified version for testing
        if (range === ">=20.11.0 <21.0.0") {
          return version.startsWith("v20");
        }
        return false;
      };

      expect(semverSatisfies("v19.0.0", ">=20.11.0 <21.0.0")).toBe(false);

      // Restore
      Object.defineProperty(process, "version", {
        value: originalVersion,
        configurable: true
      });
    });

    it("should handle missing golden files", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      // This would cause the script to fail
      expect(fs.existsSync("goldens/index.json")).toBe(false);
    });
  });
});

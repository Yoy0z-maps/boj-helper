import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { Language, TestCase, TestResult } from "./types";

export class TestRunner {
  private get timeoutMs(): number {
    return (
      vscode.workspace
        .getConfiguration("boj-helper")
        .get<number>("timeoutMs") ?? 5000
    );
  }

  private get pythonPath(): string {
    return (
      vscode.workspace
        .getConfiguration("boj-helper")
        .get<string>("pythonPath") ?? "python3"
    );
  }

  async runAll(
    filePath: string,
    language: Language,
    testCases: TestCase[]
  ): Promise<TestResult[]> {
    const compiledPath = await this.compile(filePath, language);
    if (compiledPath === null) {
      // 컴파일 실패 — 모든 케이스에 오류 반환
      return testCases.map((tc) => ({
        testCaseId: tc.id,
        passed: false,
        actualOutput: "",
        expectedOutput: tc.expectedOutput.trimEnd(),
        executionTimeMs: 0,
        errorMessage: "컴파일 실패",
      }));
    }

    return Promise.all(
      testCases.map((tc) =>
        this.runSingle(filePath, language, tc, compiledPath)
      )
    );
  }

  // ──────────────────────────────────────────────
  // Compile phase (Python은 스킵, C++/Java는 빌드)
  // ──────────────────────────────────────────────

  /**
   * Python → filePath 그대로 반환 (컴파일 불필요)
   * C++   → 임시 실행 파일 경로 반환
   * Java  → 임시 클래스 디렉토리 경로 반환
   * 실패  → null 반환
   */
  private async compile(
    filePath: string,
    language: Language
  ): Promise<string | null> {
    switch (language) {
      case "python":
        return filePath;
      case "cpp":
        return this.compileCpp(filePath);
      case "java":
        return this.compileJava(filePath);
    }
  }

  private compileCpp(filePath: string): Promise<string | null> {
    return new Promise((resolve) => {
      const outPath = path.join(os.tmpdir(), `boj_cpp_${Date.now()}`);
      const proc = cp.spawn("g++", ["-O2", "-std=c++17", "-o", outPath, filePath]);
      let stderr = "";
      proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      proc.on("close", (code) => {
        if (code !== 0) {
          vscode.window.showErrorMessage(
            `BOJ Helper: C++ 컴파일 오류\n${stderr.slice(0, 300)}`
          );
          resolve(null);
        } else {
          resolve(outPath);
        }
      });
      proc.on("error", (err) => {
        vscode.window.showErrorMessage(`BOJ Helper: g++ 실행 실패 — ${err.message}`);
        resolve(null);
      });
    });
  }

  private compileJava(filePath: string): Promise<string | null> {
    return new Promise((resolve) => {
      const classDir = path.join(os.tmpdir(), `boj_java_${Date.now()}`);
      fs.mkdirSync(classDir, { recursive: true });
      const proc = cp.spawn("javac", ["-d", classDir, filePath]);
      let stderr = "";
      proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      proc.on("close", (code) => {
        if (code !== 0) {
          vscode.window.showErrorMessage(
            `BOJ Helper: Java 컴파일 오류\n${stderr.slice(0, 300)}`
          );
          resolve(null);
        } else {
          resolve(classDir);
        }
      });
      proc.on("error", (err) => {
        vscode.window.showErrorMessage(`BOJ Helper: javac 실행 실패 — ${err.message}`);
        resolve(null);
      });
    });
  }

  // ──────────────────────────────────────────────
  // Run phase
  // ──────────────────────────────────────────────

  private runSingle(
    filePath: string,
    language: Language,
    tc: TestCase,
    compiledPath: string
  ): Promise<TestResult> {
    return new Promise((resolve) => {
      const start = performance.now();

      const child = this.spawnProcess(language, filePath, compiledPath);
      let stdout = "";
      let stderr = "";

      child.stdin!.write(tc.input);
      child.stdin!.end();
      child.stdout!.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr!.on("data", (d: Buffer) => (stderr += d.toString()));

      child.on("close", (code) => {
        const executionTimeMs = Math.round(performance.now() - start);
        const actualOutput = stdout.trimEnd();
        const expectedOutput = tc.expectedOutput.trimEnd();
        resolve({
          testCaseId: tc.id,
          passed: actualOutput === expectedOutput,
          actualOutput,
          expectedOutput,
          executionTimeMs,
          errorMessage: code !== 0 ? stderr.trim() || undefined : undefined,
        });
      });

      child.on("error", (err) => {
        resolve({
          testCaseId: tc.id,
          passed: false,
          actualOutput: "",
          expectedOutput: tc.expectedOutput.trimEnd(),
          executionTimeMs: this.timeoutMs,
          errorMessage: `실행 오류: ${err.message}`,
        });
      });
    });
  }

  private spawnProcess(
    language: Language,
    filePath: string,
    compiledPath: string
  ): cp.ChildProcess {
    const opts = { timeout: this.timeoutMs };
    switch (language) {
      case "python":
        return cp.spawn(this.pythonPath, [filePath], opts);
      case "cpp":
        return cp.spawn(compiledPath, [], opts);
      case "java":
        return cp.spawn("java", ["-cp", compiledPath, "Main"], opts);
    }
  }
}

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  ExtensionMessage,
  Language,
  Problem,
  TestResult,
  WebviewMessage,
} from "./types";
import { ProblemProvider } from "./problemProvider";
import { TestRunner } from "./testRunner";

export class BojWebviewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private problem: Problem | undefined;
  private filePath: string | undefined;
  private language: Language = this.getDefaultLanguage();
  private runCounter = 0;
  private isWebviewReady = false;

  private readonly problemProvider = new ProblemProvider();
  private readonly testRunner = new TestRunner();

  constructor(private readonly extensionUri: vscode.Uri) {}

  // ──────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────

  async openProblem(input: string): Promise<void> {
    const problem = await this.problemProvider.fetchProblem(input);
    if (!problem) {
      return;
    }
    this.language = this.getDefaultLanguage();
    this.problem = problem;
    this.filePath = await this.createSolutionFile(problem, this.language);

    this.ensurePanel(problem.number);

    // 이미 준비된 패널이면 바로 전송, 아니면 "ready" 수신 시 전송됨
    if (this.isWebviewReady) {
      this.postMessage({ type: "setProblem", problem });
      this.postMessage({ type: "setLanguage", language: this.language });
    }

    await this.openEditor();
  }

  async runTests(): Promise<void> {
    if (!this.problem || !this.filePath) {
      vscode.window.showErrorMessage("BOJ Helper: 먼저 문제를 열어주세요.");
      return;
    }

    // 파일 저장 확인
    await this.saveActiveDocument();

    this.postMessage({ type: "setLoading", loading: true });

    const results = await this.testRunner.runAll(
      this.filePath,
      this.language,
      this.problem.testCases,
    );

    this.runCounter++;
    this.postMessage({
      type: "setResults",
      run: {
        id: `run-${this.runCounter}`,
        timestamp: Date.now(),
        language: this.language,
        results,
      },
    });
    this.postMessage({ type: "setLoading", loading: false });
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  private ensurePanel(problemNumber: string): void {
    if (this.panel) {
      this.panel.title = `BOJ #${problemNumber}`;
      this.panel.reveal(vscode.ViewColumn.Two, true);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "bojHelper",
      `BOJ #${problemNumber}`,
      { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "resources"),
        ],
      },
    );

    this.panel.webview.html = this.buildHtml();

    this.panel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
      switch (msg.type) {
        case "ready":
          this.isWebviewReady = true;
          if (this.problem) {
            this.postMessage({ type: "setProblem", problem: this.problem });
            this.postMessage({ type: "setLanguage", language: this.language });
          }
          break;

        case "runTests":
          await this.runTests();
          break;

        case "addTestCase":
          if (this.problem) {
            this.problem.testCases.push({
              id: ProblemProvider.newTestCaseId(),
              input: msg.input,
              expectedOutput: msg.expectedOutput,
              isFromProblem: false,
            });
            this.postMessage({ type: "setProblem", problem: this.problem });
          }
          break;

        case "deleteTestCase":
          if (this.problem) {
            this.problem.testCases = this.problem.testCases.filter(
              (tc) => tc.id !== msg.id,
            );
            this.postMessage({ type: "setProblem", problem: this.problem });
          }
          break;

        case "openFile":
          await this.openEditor();
          break;

        case "setLanguage":
          await this.handleLanguageChange(msg.language);
          break;
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.isWebviewReady = false;
    });
  }

  private async handleLanguageChange(language: Language): Promise<void> {
    if (!this.problem) {
      return;
    }
    this.language = language;
    this.filePath = await this.createSolutionFile(this.problem, language);
    await this.openEditor();
  }

  private postMessage(msg: ExtensionMessage): void {
    this.panel?.webview.postMessage(msg);
  }

  /** 현재 활성 에디터 문서를 저장 (unsaved 변경사항 반영) */
  private async saveActiveDocument(): Promise<void> {
    const activeDoc = vscode.window.activeTextEditor?.document;
    if (activeDoc && !activeDoc.isUntitled && activeDoc.isDirty) {
      await activeDoc.save();
    }
    // filePath와 다른 문서가 열려 있을 경우 해당 파일도 저장
    if (this.filePath) {
      for (const doc of vscode.workspace.textDocuments) {
        if (doc.fileName === this.filePath && doc.isDirty) {
          await doc.save();
        }
      }
    }
  }

  private async openEditor(): Promise<void> {
    if (!this.filePath) {
      return;
    }
    const doc = await vscode.workspace.openTextDocument(this.filePath);

    const disableIntelliSense = vscode.workspace
      .getConfiguration("boj-helper")
      .get<boolean>("disableIntelliSense");
    if (disableIntelliSense) {
      await vscode.workspace
        .getConfiguration("editor", doc.uri)
        .update(
          "quickSuggestions",
          { other: false, comments: false, strings: false },
          vscode.ConfigurationTarget.Workspace,
        );
    }

    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: true,
    });
  }

  private getDefaultLanguage(): Language {
    return (
      vscode.workspace
        .getConfiguration("boj-helper")
        .get<Language>("defaultLanguage") ?? "python"
    );
  }

  /** problem_번호.{ext} 생성 — 이미 있으면 건드리지 않음 */
  private async createSolutionFile(
    problem: Problem,
    language: Language,
  ): Promise<string> {
    const dir = this.resolveWorkspaceDir();
    const ext = this.fileExtension(language);
    const filePath = path.join(dir, `problem_${problem.number}.${ext}`);

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(
        filePath,
        this.buildTemplate(problem, language),
        "utf-8",
      );
    }
    return filePath;
  }

  private resolveWorkspaceDir(): string {
    const configured = vscode.workspace
      .getConfiguration("boj-helper")
      .get<string>("workspaceDir");
    if (configured) {
      return configured;
    }
    return (
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
      (process.env.HOME as string)
    );
  }

  private fileExtension(language: Language): string {
    return { python: "py", cpp: "cpp", java: "java" }[language];
  }

  private buildTemplate(problem: Problem, language: Language): string {
    switch (language) {
      case "python":
        return [
          `# BOJ ${problem.number} - ${problem.title} (https://www.acmicpc.net/problem/${problem.number})`,
          "",
          "import sys",
          "input = sys.stdin.readline",
          "",
          "",
          "def solve():",
          "    pass",
          "",
          "",
          'if __name__ == "__main__":',
          "    solve()",
          "",
        ].join("\n");

      case "cpp":
        return [
          `// BOJ ${problem.number} - ${problem.title} (https://www.acmicpc.net/problem/${problem.number})`,
          "",
          "#include <bits/stdc++.h>",
          "using namespace std;",
          "",
          "int main() {",
          "    ios_base::sync_with_stdio(false);",
          "    cin.tie(NULL);",
          "",
          "    return 0;",
          "}",
          "",
        ].join("\n");

      case "java":
        return [
          `// BOJ ${problem.number} - ${problem.title} (https://www.acmicpc.net/problem/${problem.number})`,
          "",
          "import java.util.*;",
          "import java.io.*;",
          "",
          "public class Main {",
          "    public static void main(String[] args) throws IOException {",
          "        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));",
          "        ",
          "    }",
          "}",
          "",
        ].join("\n");
    }
  }

  // ──────────────────────────────────────────────
  // HTML — 외부 CSS/JS 참조 + CSP + MathJax CDN
  // ──────────────────────────────────────────────

  private buildHtml(): string {
    const webview = this.panel!.webview;

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "resources",
        "webview",
        "style.css",
      ),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "resources",
        "webview",
        "script.js",
      ),
    );
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`, // unsafe-inline: MathJax 동적 스타일
      `script-src ${webview.cspSource} https://cdn.jsdelivr.net`,
      `img-src ${webview.cspSource} https: data:`,
      `font-src https://cdn.jsdelivr.net`,
    ].join("; ");

    return /* html */ `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>BOJ Helper</title>
</head>
<body>

  <!-- Empty state -->
  <div id="empty-state">
    <div class="empty-icon">📋</div>
    <div class="empty-title">BOJ Helper</div>
    <div class="empty-sub">Ctrl+Shift+B 로 문제를 열어보세요</div>
  </div>

  <!-- Main content -->
  <div id="main" style="display:none">
    <h1 id="problem-title"></h1>
    <div class="meta">
      <a id="problem-link" href="#" target="_blank">
        <span id="problem-number">BOJ</span>
      </a>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <button class="btn btn-primary" id="run-btn">
        ▶ Run Tests
        <span class="spinner" id="spinner"></span>
      </button>
      <button class="btn btn-secondary" id="open-file-btn">📄 파일 열기</button>
      <select class="lang-select" id="lang-select" title="언어 선택">
        <option value="python">Python</option>
        <option value="cpp">C++</option>
        <option value="java">Java</option>
      </select>
    </div>

    <!-- Problem description -->
    <section>
      <h2>문제 설명</h2>
      <div class="problem-info">
        <span>⏱ 시간 제한 <strong id="time-limit"></strong></span>
        <span>💾  메모리 제한 <strong id="memory-limit"></strong></span>
      </div>
      <div class="description" id="description"></div>
    </section>

    <!-- Test cases -->
    <section>
      <h2>테스트 케이스</h2>
      <div id="test-cases"></div>
    </section>

    <!-- Add test case -->
    <section>
      <h2>테스트 케이스 추가</h2>
      <div class="add-form">
        <div class="add-form-row">
          <div>
            <label class="field-label">입력</label>
            <textarea id="new-input" placeholder="예) 5&#10;push 1&#10;push 2&#10;top&#10;pop&#10;size"></textarea>
          </div>
          <div>
            <label class="field-label">기대 출력</label>
            <textarea id="new-output" placeholder="예) 2&#10;2&#10;1"></textarea>
          </div>
        </div>
        <div>
          <button class="btn btn-secondary" id="add-tc-btn">+ 추가</button>
        </div>
      </div>
    </section>

    <!-- History -->
    <section id="history-section" style="display:none">
      <h2>
        <span class="history-summary" id="history-summary">
          실행 히스토리
          <span class="history-toggle" id="history-toggle">▶</span>
        </span>
      </h2>
      <div id="history-list" class="history-list" style="display:none"></div>
    </section>
  </div>

  <!-- script.js must load before MathJax (sets window.MathJax config) -->
  <script src="${scriptUri}"></script>
  <script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>

</body>
</html>`;
  }
}

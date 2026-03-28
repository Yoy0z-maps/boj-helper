import * as vscode from "vscode";
import { BojWebviewProvider } from "./webviewProvider";

let provider: BojWebviewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  provider = new BojWebviewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.commands.registerCommand("boj-helper.openProblem", async () => {
      const input = await vscode.window.showInputBox({
        title: "BOJ 문제 열기",
        prompt: "문제 번호 또는 URL을 입력하세요",
        placeHolder: "예: 1000  또는  https://www.acmicpc.net/problem/1000",
      });
      if (input !== undefined) {
        await provider!.openProblem(input);
      }
    }),

    vscode.commands.registerCommand("boj-helper.runTests", async () => {
      await provider!.runTests();
    }),

    vscode.commands.registerCommand("boj-helper.setWorkspaceDir", async () => {
      const selected = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "이 폴더에 저장",
        title: "BOJ Helper: 문제 파일 저장 경로 선택",
      });

      if (!selected || selected.length === 0) {
        return;
      }

      const dirPath = selected[0].fsPath;
      await vscode.workspace
        .getConfiguration("boj-helper")
        .update("workspaceDir", dirPath, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage(
        `BOJ Helper: 저장 경로 설정 완료 → ${dirPath}`
      );
    })
  );
}

export function deactivate() {}

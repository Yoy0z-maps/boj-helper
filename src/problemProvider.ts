import axios from "axios";
import * as cheerio from "cheerio";
import * as vscode from "vscode";
import { Problem, TestCase } from "./types";

const BOJ_BASE = "https://www.acmicpc.net/problem";

const HTTP_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
  Referer: "https://www.acmicpc.net/",
};

/**
 * BOJ 문제 번호 또는 URL → Problem 객체로 변환하는 핵심 클래스
 */
export class ProblemProvider {
  /**
   * 문제 번호 혹은 URL을 받아 파싱된 Problem 객체 반환
   * 실패 시 vscode.window.showErrorMessage를 표시하고 undefined 반환
   */
  async fetchProblem(input: string): Promise<Problem | undefined> {
    const problemNumber = this.extractProblemNumber(input);
    if (!problemNumber) {
      vscode.window.showErrorMessage(
        `BOJ Helper: 올바른 문제 번호 또는 URL을 입력하세요. (입력값: ${input})`
      );
      return undefined;
    }

    const url = `${BOJ_BASE}/${problemNumber}`;
    let html: string;

    try {
      const response = await axios.get<string>(url, {
        headers: HTTP_HEADERS,
        timeout: 10_000,
      });
      html = response.data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        vscode.window.showErrorMessage(
          `BOJ Helper: 문제 ${problemNumber}번을 찾을 수 없습니다.`
        );
      } else {
        vscode.window.showErrorMessage(
          `BOJ Helper: 네트워크 오류가 발생했습니다. (${(err as Error).message})`
        );
      }
      return undefined;
    }

    return this.parseProblemHtml(html, problemNumber);
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  /** "1234" 또는 "https://…/problem/1234" → "1234" */
  private extractProblemNumber(input: string): string | null {
    const trimmed = input.trim();

    // 순수 숫자
    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }

    // URL 패턴
    const urlMatch = trimmed.match(/acmicpc\.net\/problem\/(\d+)/);
    if (urlMatch) {
      return urlMatch[1];
    }

    return null;
  }

  /** Cheerio로 HTML 파싱 → Problem */
  private parseProblemHtml(html: string, number: string): Problem {
    const $ = cheerio.load(html);

    const title = $("#problem_title").text().trim();
    const description = $("#problem_description").html() ?? "";

    // BOJ 문제 정보 테이블: 첫 번째 행 = 시간/메모리 제한
    const infoTds = $("#problem-info tbody td");
    const timeLimit = infoTds.eq(0).text().trim();
    const memoryLimit = infoTds.eq(1).text().trim();

    const testCases: TestCase[] = [];
    let idx = 1;

    // 예제 입력/출력 쌍을 순서대로 추출
    while (true) {
      const inputEl = $(`#sample-input-${idx}`);
      const outputEl = $(`#sample-output-${idx}`);
      if (!inputEl.length || !outputEl.length) {
        break;
      }
      testCases.push({
        id: `boj-${number}-${idx}`,
        input: inputEl.text(),
        expectedOutput: outputEl.text(),
        isFromProblem: true,
      });
      idx++;
    }

    return { number, title, description, timeLimit, memoryLimit, testCases };
  }

  /** 테스트케이스 ID 생성 헬퍼 (유저 추가용) */
  static newTestCaseId(): string {
    return `user-${crypto.randomUUID()}`;
  }
}

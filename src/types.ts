export type Language = "python" | "cpp" | "java";

export interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  isFromProblem: boolean;
}

export interface Problem {
  number: string;
  title: string;
  description: string; // HTML
  timeLimit: string;
  memoryLimit: string;
  testCases: TestCase[];
}

export interface TestResult {
  testCaseId: string;
  passed: boolean;
  actualOutput: string;
  expectedOutput: string;
  executionTimeMs: number;
  errorMessage?: string;
}

export interface TestRun {
  id: string;
  timestamp: number;
  language: Language;
  results: TestResult[];
}

// Webview → Extension
export type WebviewMessage =
  | { type: "ready" }
  | { type: "runTests" }
  | { type: "addTestCase"; input: string; expectedOutput: string }
  | { type: "deleteTestCase"; id: string }
  | { type: "openFile" }
  | { type: "setLanguage"; language: Language };

// Extension → Webview
export type ExtensionMessage =
  | { type: "setProblem"; problem: Problem }
  | { type: "setResults"; run: TestRun }
  | { type: "setLoading"; loading: boolean }
  | { type: "setLanguage"; language: Language };

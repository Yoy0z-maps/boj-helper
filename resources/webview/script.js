// ── MathJax 설정 (CDN 로드 전에 반드시 정의) ──
window.MathJax = {
  tex: {
    inlineMath: [["$", "$"], ["\\(", "\\)"]],
    displayMath: [["$$", "$$"], ["\\[", "\\]"]],
    processEscapes: true,
  },
  options: {
    skipHtmlTags: ["script", "noscript", "style", "textarea", "pre"],
  },
  startup: { typeset: false },
};

// ── VS Code API ──
const vscode = acquireVsCodeApi();

// ── 상태 ──
let problem = null;
let currentLanguage = "python";
let history = [];
let historyOpen = false;

// ── 정적 버튼 이벤트 등록 (DOM이 이미 준비된 상태에서 실행됨) ──
document.getElementById("run-btn").addEventListener("click", runTests);
document.getElementById("open-file-btn").addEventListener("click", openFile);
document.getElementById("add-tc-btn").addEventListener("click", addTestCase);
document.getElementById("history-summary").addEventListener("click", toggleHistory);

document.getElementById("lang-select").addEventListener("change", function () {
  currentLanguage = this.value;
  vscode.postMessage({ type: "setLanguage", language: currentLanguage });
});

// 삭제 버튼 — 동적으로 생성되므로 부모에 이벤트 위임
document.getElementById("test-cases").addEventListener("click", function (e) {
  const btn = e.target.closest(".delete-btn");
  if (btn) {
    deleteTestCase(btn.dataset.id);
  }
});

// ── Extension → Webview 메시지 수신 ──
window.addEventListener("message", (event) => {
  const msg = event.data;
  switch (msg.type) {
    case "setProblem":
      problem = msg.problem;
      renderProblem();
      break;
    case "setResults":
      history.unshift(msg.run);
      if (history.length > 20) history.pop();
      renderWithResults(msg.run.results);
      renderHistory();
      break;
    case "setLoading":
      setLoading(msg.loading);
      break;
    case "setLanguage":
      currentLanguage = msg.language;
      document.getElementById("lang-select").value = msg.language;
      break;
  }
});

// ── 렌더링 ──
function renderProblem() {
  document.getElementById("empty-state").style.display = "none";
  document.getElementById("main").style.display = "block";

  document.getElementById("problem-title").textContent =
    `#${problem.number} ${problem.title}`;
  document.getElementById("problem-number").textContent =
    `BOJ ${problem.number}`;
  document.getElementById("problem-link").href =
    `https://www.acmicpc.net/problem/${problem.number}`;
  document.getElementById("time-limit").textContent = problem.timeLimit;
  document.getElementById("memory-limit").textContent = problem.memoryLimit;
  document.getElementById("description").innerHTML = problem.description;

  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise([document.getElementById("description")]).catch(
      (e) => console.warn("MathJax typeset error:", e)
    );
  }

  renderTestCards(null);
  renderHistory();
}

function renderWithResults(results) {
  const resultMap = {};
  results.forEach((r) => (resultMap[r.testCaseId] = r));
  renderTestCards(resultMap);
}

function renderTestCards(resultMap) {
  if (!problem) return;
  const container = document.getElementById("test-cases");
  container.innerHTML = "";
  problem.testCases.forEach((tc, i) => {
    const r = resultMap ? resultMap[tc.id] : null;
    container.appendChild(buildTestCard(tc, i + 1, r));
  });
}

function buildTestCard(tc, idx, result) {
  const card = document.createElement("div");
  const stateClass = result ? (result.passed ? "pass" : "fail") : "";
  card.className = `test-card ${stateClass}`;

  const resultPill = result
    ? `<span class="result-pill ${result.passed ? "pass" : "fail"}">${
        result.passed ? "✓ Pass" : "✗ Fail"
      }</span><span class="exec-time">${result.executionTimeMs} ms</span>`
    : "";

  // 삭제 버튼: onclick 대신 data-id 사용 (이벤트 위임으로 처리)
  const deleteBtn = !tc.isFromProblem
    ? `<button class="delete-btn" data-id="${tc.id}" title="삭제">✕</button>`
    : "";

  const actualRow =
    result && !result.passed
      ? `<div style="margin-top:8px">
           <div class="io-label error-label">실제 출력</div>
           <pre class="fail-border">${esc(result.actualOutput)}</pre>
         </div>`
      : "";

  const errRow =
    result && result.errorMessage
      ? `<div style="margin-top:8px">
           <div class="io-label error-label">오류</div>
           <pre class="fail-border">${esc(result.errorMessage)}</pre>
         </div>`
      : "";

  card.innerHTML = `
    ${deleteBtn}
    <div class="test-card-header">
      <span class="badge ${tc.isFromProblem ? "" : "user"}">${
        tc.isFromProblem ? `예제 ${idx}` : "커스텀"
      }</span>
      ${resultPill}
    </div>
    <div class="io-grid">
      <div>
        <div class="io-label">입력</div>
        <pre>${esc(tc.input)}</pre>
      </div>
      <div>
        <div class="io-label">기대 출력</div>
        <pre>${esc(tc.expectedOutput)}</pre>
      </div>
    </div>
    ${actualRow}
    ${errRow}
  `;
  return card;
}

// ── 히스토리 ──
function renderHistory() {
  const section = document.getElementById("history-section");
  if (history.length === 0) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";

  document.getElementById("history-toggle").className =
    `history-toggle ${historyOpen ? "open" : ""}`;

  const list = document.getElementById("history-list");
  list.style.display = historyOpen ? "block" : "none";
  list.innerHTML = "";

  history.forEach((run) => {
    const passCount = run.results.filter((r) => r.passed).length;
    const total = run.results.length;
    const timeStr = new Date(run.timestamp).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const dots = run.results
      .map((r) => `<div class="dot ${r.passed ? "pass" : "fail"}"></div>`)
      .join("");

    const row = document.createElement("div");
    row.className = "history-run";
    row.innerHTML = `
      <span class="lang-tag">${run.language}</span>
      <span>${passCount}/${total} 통과</span>
      <span class="ts">${timeStr}</span>
      <div class="history-dots">${dots}</div>
    `;
    list.appendChild(row);
  });
}

function toggleHistory() {
  historyOpen = !historyOpen;
  renderHistory();
}

// ── 액션 ──
function runTests() {
  vscode.postMessage({ type: "runTests" });
}

function openFile() {
  vscode.postMessage({ type: "openFile" });
}

function addTestCase() {
  const input = document.getElementById("new-input").value;
  const expectedOutput = document.getElementById("new-output").value;
  if (!input.trim() && !expectedOutput.trim()) return;
  vscode.postMessage({ type: "addTestCase", input, expectedOutput });
  document.getElementById("new-input").value = "";
  document.getElementById("new-output").value = "";
}

function deleteTestCase(id) {
  vscode.postMessage({ type: "deleteTestCase", id });
}

// ── 유틸 ──
function setLoading(loading) {
  const btn = document.getElementById("run-btn");
  btn.classList.toggle("loading", loading);
  btn.disabled = loading;
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 스크립트 로드 완료 → 확장에 준비 신호 전송
vscode.postMessage({ type: "ready" });

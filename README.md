# BOJ Helper

백준(BOJ) 문제 풀이를 위한 VS Code 익스텐션입니다.
문제 파싱, 풀이 파일 자동 생성, 테스트 케이스 실행을 지원합니다.

---

## 시작하기

### 1. 파일 저장 경로 설정 (최초 1회)

`Cmd+Shift+P` → **BOJ: 파일 저장 경로 설정** 을 실행하면 폴더 선택 다이얼로그가 열립니다.
선택한 폴더에 이후 모든 문제 파일이 생성됩니다.

> 설정하지 않으면 현재 워크스페이스 루트에 생성됩니다.

### 2. 문제 열기

`Cmd+Shift+B` → 문제 번호 또는 URL 입력

```
1000
https://www.acmicpc.net/problem/1000
```

실행하면:
- 왼쪽 에디터에 `problem_번호.py` (또는 `.cpp`, `.java`) 파일이 열립니다.
- 오른쪽 패널에 문제 설명, 예제 케이스가 표시됩니다.

### 3. 테스트 실행

코드를 작성한 뒤 웹뷰의 **▶ Run Tests** 버튼 클릭 (또는 `Cmd+Shift+R`).
저장되지 않은 파일은 자동으로 저장한 뒤 실행합니다.

결과로 **Pass/Fail**, **실행 시간(ms)**, **실제 출력값**을 확인할 수 있습니다.

### 4. 테스트 케이스 추가

웹뷰 하단 **테스트 케이스 추가** 섹션에 입력값과 기대 출력을 작성하고 **+ 추가** 클릭.

```
입력 예시:
5
push 1
push 2
top
pop
size

기대 출력 예시:
2
2
1
```

### 5. 언어 변경

웹뷰 툴바 우측 드롭다운에서 **Python / C++ / Java** 선택.
선택한 언어에 맞는 템플릿 파일(`problem_번호.cpp` 등)이 새로 생성됩니다.

---

## 단축키

| 동작 | 단축키 |
|---|---|
| 문제 열기 | `Cmd+Shift+B` |
| 테스트 실행 | `Cmd+Shift+R` |
| 파일 저장 경로 설정 | `Cmd+Shift+P` → BOJ: 파일 저장 경로 설정 |

---

## 언어별 입력 사용법

### Python

`input = sys.stdin.readline` 으로 재정의한 뒤 **반드시 `input()`으로 호출**해야 합니다.

```python
import sys
input = sys.stdin.readline

n = int(input())                    # 정수 한 개
a, b = map(int, input().split())    # 공백으로 구분된 정수 두 개
arr = list(map(int, input().split())) # 정수 배열

# 주의: input[0] (X) → input은 함수이므로 인덱싱 불가
# 올바른 사용: int(input())
```

### C++

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    int n;
    cin >> n;                       // 정수 한 개

    int a, b;
    cin >> a >> b;                  // 정수 두 개

    string s;
    getline(cin, s);                // 한 줄 전체 (공백 포함)

    return 0;
}
```

### Java

```java
import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st;

        int n = Integer.parseInt(br.readLine());          // 정수 한 개

        st = new StringTokenizer(br.readLine());
        int a = Integer.parseInt(st.nextToken());         // 공백 구분 정수
        int b = Integer.parseInt(st.nextToken());

        System.out.println(a + b);
    }
}
```

---

## 설정

`Cmd+,` → 설정 검색창에 `boj-helper` 입력

| 설정 키 | 기본값 | 설명 |
|---|---|---|
| `boj-helper.pythonPath` | `python3` | Python 실행 경로 |
| `boj-helper.workspaceDir` | (워크스페이스 루트) | 문제 파일 저장 경로 |
| `boj-helper.timeoutMs` | `5000` | 테스트 케이스 실행 타임아웃 (ms) |

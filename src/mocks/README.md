# B mock API (`/api/mock/**`)

- 설계서 §5 경로를 `/api/mock/...` 로 그대로 복제한 가짜 백엔드. 응답 타입은 `src/contracts/types.ts` 와 동일.
- `.env.local` 에 `NEXT_PUBLIC_API_BASE=/api/mock` 을 두면 세션 화면이 mock 으로 동작한다. `/api` 로 바꾸면 C·D 실서버로 붙는다.
- 상태는 서버 메모리(`globalThis.__kurendMock`)에 있다. **dev 서버를 재시작하면 초기 fixture 로 돌아간다.**
- 초기 데이터: 체험 1(`usr_demo1`) — 운영체제 4장(D-7), 경제학원론 수요·공급(D-12), 완료 세션 `sess_done`(94점, 놓친 곳 1개), 준비 전 세션 `sess_demo`.
- 모르는 `sess_*` id 로 접근하면 경제학 1장 "수요의 이해" 세션이 그 id 로 자동 생성된다(딥링크·새로고침 안전).
- **되묻기 시연**: 쉽게 모드에서 "가격이 오르면 수요량도 늘어" 라고 설명하면 `junior.doubt` 가 나온다.
- SSE 간격: progress 700ms, 반응 문장 300ms, 속마음·튜터 글자 25~35ms, 답안 문장 300ms+글자수×30ms, 채점 600ms.
- 규칙 정본: `docs/b-split.md` §2·§3. 로직은 `logic.ts`(순수 함수), 상태 전이는 `store.ts`.

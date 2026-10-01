This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 백엔드(C) — DB · CRUD API · 인증 · 인제스트

```bash
pnpm install            # postinstall 에서 prisma generate (→ src/generated/prisma, git 제외)
cp .env.example .env    # DATABASE_URL="file:./prisma/dev.db" (프로젝트 루트 기준)
pnpm db:reset           # prisma/dev.db 삭제 → db push → 시드
pnpm dev
```

- **Prisma 7**: datasource url 은 `prisma.config.ts` 에서 읽고(`.env` 를 직접 로드), SQLite 는 driver adapter(`@prisma/adapter-libsql`)로 연결한다. 스키마는 설계서 §3 그대로(`prisma/schema.prisma`, FROZEN).
- **시드**(`prisma/seed.ts`, 멱등): 데모 계정 `usr_demo1`(체험 1) / `usr_demo2` / `usr_demo3`. 체험 1 에 READY 자료 2개(운영체제 D-7, 경제학원론 D-12) + 완료 세션 1개(94점·놓친 곳 1) + 진행 중 세션 1개. 원본은 `prisma/seed-data/`. D 가 `fixtures/seed-data/` 에 같은 형식을 두면 그쪽을 우선한다.
- **서버 공용 모듈**(`src/lib/server/`): `db.ts`(Prisma 싱글턴) · `auth.ts`(`requireUser(req)`, 쿠키 `tb_uid`) · `http.ts`(`withApi`, `ApiError`, `json`, `parseJson`) · `ingest.ts`(md/txt/pdf → 텍스트) · `session-dto.ts`(`toSessionDto`/`toResultDto`, `sessionInclude`) · `session-access.ts`(`loadOwnedSession`, `assertStatus`) · `material-dto.ts` · `ids.ts`(`newId("sess")`).
- **API**(§5-2~5-5, base `/api`): `auth/{demo-accounts,demo-login,me,logout}` · `home` · `materials`(POST multipart `files[]`+`courseName`+`examDate?`, GET) · `materials/{id}`(GET/DELETE) · `sources/{id}/content` · `sessions`(POST/GET) · `sessions/{id}`(GET/PATCH/DELETE) · `sessions/{id}/{finish-explanation,start-exam,result,complete}` · `sessions/{id}/gaps/{gapId}/reviewed` · `sessions/{id}/messages/{mid}/exclude`. 상태 전이 위반 `409 INVALID_STATE`, 남의 자원 `404 NOT_FOUND`, 미로그인 `401 UNAUTHORIZED`, 입력 오류 `400 VALIDATION`.
- **스모크 테스트**: `pnpm dev` 를 띄운 뒤 `pnpm tsx scripts/smoke-api.ts` — 모든 응답을 `src/contracts/types.ts` 의 zod 스키마로 검증한다.

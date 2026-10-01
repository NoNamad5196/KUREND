/** 운영체제 4장 fixture + 완료된 세션 sess_done (94점, MOSTLY, 놓친 곳 1개 REVIEWED) */
export const OS_SOURCE_TEXT = `# 운영체제 4장 — 프로세스 스케줄링

## 4.1 프로세스와 스레드
프로세스는 실행 중인 프로그램이다. 운영체제는 각 프로세스를 PCB(Process Control Block)로 관리하며, PCB에는 프로세스 상태, 프로그램 카운터, 레지스터, 메모리 정보가 들어 있다. 프로세스 상태는 생성, 준비, 실행, 대기, 종료의 다섯 가지로 전이한다. CPU가 다른 프로세스로 넘어갈 때 현재 상태를 PCB에 저장하고 다음 프로세스의 상태를 불러오는 것을 컨텍스트 스위칭이라고 한다. 스레드는 프로세스 안의 실행 흐름으로, 같은 프로세스의 스레드끼리는 코드와 데이터를 공유한다.

## 4.2 스케줄링 기준
스케줄러는 CPU 이용률과 처리량을 높이고, 총처리 시간·대기 시간·응답 시간을 줄이는 것을 목표로 한다. 대기 시간은 프로세스가 준비 큐에서 기다린 시간의 합이다.

## 4.3 CPU 스케줄링 알고리즘
FCFS(First-Come, First-Served)는 먼저 도착한 프로세스부터 처리하는 가장 단순한 방식이다. 긴 작업 뒤에 짧은 작업들이 줄줄이 기다리는 호위 효과(convoy effect)가 생길 수 있다.
SJF(Shortest Job First)는 실행 시간이 가장 짧은 프로세스를 먼저 처리해 평균 대기 시간을 최소화한다. 다만 실행 시간을 미리 알기 어렵다.
RR(Round Robin)은 모든 프로세스에 같은 크기의 타임 퀀텀을 돌아가며 할당한다. 타임 퀀텀이 끝나면 프로세스는 준비 큐의 맨 뒤로 간다. 타임 퀀텀이 너무 크면 FCFS와 같아지고, 너무 작으면 컨텍스트 스위칭 오버헤드가 커진다.

## 4.4 우선순위와 기아
우선순위 스케줄링은 우선순위가 높은 프로세스에게 CPU를 먼저 준다. 우선순위가 낮은 프로세스가 끝없이 기다리는 기아(starvation) 현상이 생길 수 있다. 기아를 막기 위해 오래 기다린 프로세스의 우선순위를 점점 높여 주는 것을 에이징(aging)이라고 한다.

## 4.5 다단계 큐
다단계 큐는 준비 큐를 여러 개로 나누고 큐마다 다른 스케줄링 알고리즘을 쓴다. 다단계 피드백 큐는 프로세스가 큐 사이를 이동할 수 있어, CPU를 오래 쓰는 프로세스는 아래 큐로 내려간다.

## 4.6 멀티프로세서 스케줄링
여러 CPU가 있을 때는 부하 균등화와 프로세서 친화성(affinity)을 함께 고려해야 한다.
`;

const at = (needle: string) => {
  const i = OS_SOURCE_TEXT.indexOf(needle);
  if (i < 0) throw new Error(`os fixture: '${needle}' not found`);
  return i;
};

export const OS_CHAPTER_RANGES = [
  { chapterId: "chp_os_1", order: 1, title: "프로세스와 스레드", points: ["프로세스 상태 전이", "PCB", "컨텍스트 스위칭"], start: at("## 4.1"), end: at("## 4.2") },
  { chapterId: "chp_os_2", order: 2, title: "스케줄링 기준", points: ["CPU 이용률", "대기 시간"], start: at("## 4.2"), end: at("## 4.3") },
  { chapterId: "chp_os_3", order: 3, title: "CPU 스케줄링 알고리즘", points: ["FCFS·SJF", "RR과 타임 퀀텀", "우선순위와 에이징"], start: at("## 4.3"), end: at("## 4.4") },
  { chapterId: "chp_os_4", order: 4, title: "우선순위와 기아", points: ["기아", "에이징"], start: at("## 4.4"), end: at("## 4.5") },
  { chapterId: "chp_os_5", order: 5, title: "다단계 큐", points: ["다단계 큐", "피드백 큐"], start: at("## 4.5"), end: at("## 4.6") },
  { chapterId: "chp_os_6", order: 6, title: "멀티프로세서 스케줄링", points: ["부하 균등화", "프로세서 친화성"], start: at("## 4.6"), end: OS_SOURCE_TEXT.length },
] as const;

export const OS_AGING_EXCERPT = "기아를 막기 위해 오래 기다린 프로세스의 우선순위를 점점 높여 주는 것을 에이징(aging)이라고 한다.";
at(OS_AGING_EXCERPT);

const T = (min: number) => new Date(Date.UTC(2026, 8, 30, 12, 40 + min, 0)).toISOString();
export const SESS_DONE_COMPLETED_AT = "2026-09-30T13:20:00.000Z";

const U1 = "FCFS는 먼저 온 순서대로 처리하는 방식이라 단순하지만, 긴 작업이 앞에 있으면 뒤에 짧은 작업들이 다 기다리는 호위 효과가 생겨. SJF는 짧은 작업부터 해서 평균 대기 시간이 제일 작아.";
const U2 = "RR은 모두에게 똑같은 타임 퀀텀을 주고 돌아가면서 실행해. 퀀텀이 끝나면 준비 큐 맨 뒤로 가고, 퀀텀이 너무 크면 FCFS랑 같아지고 너무 작으면 컨텍스트 스위칭이 많아져서 손해야.";
const U3 = "우선순위 스케줄링은 우선순위가 높은 애부터 CPU를 줘. 그러면 낮은 애는 계속 못 받을 수도 있는데 그걸 기아라고 해.";

export const SESS_DONE = {
  sessionId: "sess_done",
  userId: "usr_demo1",
  chapterId: "chp_os_3",
  status: "COMPLETED" as const,
  phase: "EXAM_READY" as const,
  juniorLevel: "EASY" as const,
  objectives: [
    { id: "o1", text: "FCFS와 SJF의 차이를 설명할 수 있다" },
    { id: "o2", text: "RR 스케줄링과 타임 퀀텀의 영향을 설명할 수 있다" },
    { id: "o3", text: "우선순위 스케줄링의 기아 문제와 해결책을 설명할 수 있다" },
  ],
  heard: ["FCFS", "호위 효과", "SJF", "RR", "타임 퀀텀", "컨텍스트 스위칭", "우선순위 스케줄링", "기아"],
  messages: [
    { messageId: "msg_done_1", role: "JUNIOR" as const, stage: "QUESTION" as const, content: "선배, FCFS랑 SJF부터 알려줄래? 둘이 뭐가 달라?", createdAt: T(0) },
    { messageId: "msg_done_2", role: "USER" as const, stage: "ANSWER" as const, content: U1, createdAt: T(2) },
    { messageId: "msg_done_3", role: "JUNIOR" as const, stage: "REACTION" as const, content: "먼저 온 순서대로면 긴 작업 뒤에서 다 기다리는구나. 짧은 것부터 하면 기다리는 시간이 줄어드는 거네.", createdAt: T(2) },
    { messageId: "msg_done_4", role: "JUNIOR" as const, stage: "QUESTION" as const, content: "그럼 RR은 뭐야? 타임 퀀텀이라는 말이 궁금해.", createdAt: T(2) },
    { messageId: "msg_done_5", role: "USER" as const, stage: "ANSWER" as const, content: U2, createdAt: T(5) },
    { messageId: "msg_done_6", role: "JUNIOR" as const, stage: "REACTION" as const, content: "돌아가면서 조금씩 쓰는 거구나. 퀀텀 크기가 중요하네.", createdAt: T(5) },
    { messageId: "msg_done_7", role: "JUNIOR" as const, stage: "QUESTION" as const, content: "우선순위 스케줄링은 어떤 문제가 있어?", createdAt: T(5) },
    { messageId: "msg_done_8", role: "USER" as const, stage: "ANSWER" as const, content: U3, createdAt: T(8) },
    { messageId: "msg_done_9", role: "JUNIOR" as const, stage: "REACTION" as const, content: "낮은 우선순위는 계속 밀릴 수 있구나. 그게 기아라는 거네.", createdAt: T(8) },
    { messageId: "msg_done_10", role: "JUNIOR" as const, stage: "QUESTION" as const, content: "응응, 더 말해 줘! 궁금한 거 생기면 물어볼게.", createdAt: T(8) },
  ],
  exam: {
    examId: "exam_done",
    status: "GRADED" as const,
    createdAt: T(0),
    questions: [
      { qid: "q1", order: 1, points: 34, question: "FCFS와 SJF 스케줄링의 차이를 대기 시간 관점에서 설명하시오.", objectiveRef: "o1", rubric: "도착 순서 처리; 호위 효과; SJF 평균 대기 시간 최소" },
      { qid: "q2", order: 2, points: 33, question: "RR 스케줄링에서 타임 퀀텀의 크기가 성능에 어떤 영향을 주는지 설명하시오.", objectiveRef: "o2", rubric: "균등 할당; 크면 FCFS화; 작으면 컨텍스트 스위칭 오버헤드" },
      { qid: "q3", order: 3, points: 33, question: "우선순위 스케줄링에서 생기는 기아 현상과 그 해결 방법을 설명하시오.", objectiveRef: "o3", rubric: "기아 정의; 에이징으로 해결" },
    ],
    answers: {
      q1: [
        { sentence: "FCFS는 먼저 도착한 순서대로 처리해서 단순하지만, 긴 작업이 앞에 있으면 호위 효과가 생깁니다.", ref: 1, level: "STRONG" as const, unlearned: false },
        { sentence: "SJF는 짧은 작업부터 처리하므로 평균 대기 시간이 가장 작습니다.", ref: 1, level: "STRONG" as const, unlearned: false },
      ],
      q2: [
        { sentence: "RR은 모든 프로세스에 같은 타임 퀀텀을 돌아가며 줍니다.", ref: 2, level: "STRONG" as const, unlearned: false },
        { sentence: "퀀텀이 너무 크면 FCFS와 같아지고, 너무 작으면 컨텍스트 스위칭이 많아져 오버헤드가 커집니다.", ref: 2, level: "STRONG" as const, unlearned: false },
      ],
      q3: [
        { sentence: "우선순위가 낮은 프로세스가 계속 CPU를 받지 못하는 것을 기아라고 합니다.", ref: 3, level: "STRONG" as const, unlearned: false },
        { sentence: "해결 방법은 선배한테 못 들어서 모르겠습니다.", ref: null, level: "NONE" as const, unlearned: true },
      ],
    },
    grades: {
      q1: { score: 34, maxScore: 34, verdict: "CORRECT" as const, comment: "도착 순서 처리, 호위 효과, SJF의 평균 대기 시간 최소화를 모두 정확히 썼습니다." },
      q2: { score: 33, maxScore: 33, verdict: "CORRECT" as const, comment: "균등한 퀀텀 할당과 퀀텀 크기에 따른 두 가지 영향을 모두 썼습니다." },
      q3: { score: 27, maxScore: 33, verdict: "PARTIAL" as const, comment: "기아의 정의는 정확합니다. 해결책인 에이징이 빠졌습니다." },
    },
  },
  gaps: [
    {
      gapId: "gap_done_1",
      qid: "q3",
      title: "에이징 설명이 빠짐",
      diagnosis:
        "새내기 답안에는 기아의 정의까지만 적혀 있고 해결 방법이 없습니다. 답안의 앞부분은 선배의 [설명 3]에서 그대로 가져온 것입니다. 에이징 부분은 설명에서 다루지 않음으로 확인됩니다. 새내기는 들은 것만 쓸 수 있으므로, 이 부분을 한 번 더 가르치면 다음 시험에서 맞힐 수 있습니다.",
      evidenceQuote: U3,
      concepts: ["에이징"],
      sourceExcerpt: OS_AGING_EXCERPT,
      status: "REVIEWED" as const,
      createdAt: T(12),
      tutorMessages: [
        {
          id: "tm_done_1",
          request: "이 부분을 자료 기준으로 쉽게 설명해줘",
          response:
            "에이징은 오래 기다린 프로세스의 우선순위를 시간이 갈수록 조금씩 올려 주는 방법이에요. 줄을 오래 선 손님에게 번호표를 앞당겨 주는 식당을 떠올리면 쉬워요. 이렇게 하면 우선순위가 낮은 프로세스도 결국 CPU를 받게 되어 기아가 사라집니다. 이것만 기억하면 됩니다: 기아의 해결책은 에이징이다.",
          createdAt: T(15),
        },
      ],
    },
  ],
  score: 94,
  finalVerdict: "MOSTLY" as const,
  createdAt: T(0),
  updatedAt: SESS_DONE_COMPLETED_AT,
  completedAt: SESS_DONE_COMPLETED_AT,
  userMessages: [U1, U2, U3],
};

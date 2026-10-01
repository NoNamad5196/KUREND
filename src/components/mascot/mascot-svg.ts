/**
 * KU 황소 마스코트 — 단일 SVG. 표정/소품은 전부 포함되어 있고 상태(ku-state-*) 클래스로 CSS 가 보여줄 것을 고른다.
 * React(Mascot.tsx)와 디자인 프로토타입(artifact)이 같은 문자열을 쓴다.
 */
export const MASCOT_VIEWBOX = "0 0 240 270";

export const MASCOT_SVG = `
<g class="ku-all">
  <!-- 그림자 -->
  <ellipse class="ku-shadow" cx="120" cy="256" rx="54" ry="7" fill="var(--ku-shadow, rgba(30,35,48,.12))"/>

  <!-- 꼬리 -->
  <g class="ku-tail">
    <path d="M166 212 C 190 206, 204 222, 198 240" fill="none" stroke="var(--ku-line)" stroke-width="5" stroke-linecap="round"/>
    <path d="M196 236 c 10 -4, 16 4, 10 12 c -6 6, -14 2, -10 -12 z" fill="var(--ku-tuft)" stroke="var(--ku-line)" stroke-width="3" stroke-linejoin="round"/>
  </g>

  <!-- 다리 -->
  <g class="ku-legs">
    <rect x="88" y="214" width="28" height="40" rx="13" fill="var(--ku-body)" stroke="var(--ku-line)" stroke-width="4"/>
    <rect x="124" y="214" width="28" height="40" rx="13" fill="var(--ku-body)" stroke="var(--ku-line)" stroke-width="4"/>
    <path d="M90 246 h24 M126 246 h24" stroke="var(--ku-line)" stroke-width="3" stroke-linecap="round" opacity=".6"/>
  </g>

  <!-- 몸통 -->
  <g class="ku-body">
    <rect x="74" y="150" width="92" height="84" rx="40" fill="var(--ku-body)" stroke="var(--ku-line)" stroke-width="4"/>
    <ellipse cx="120" cy="216" rx="26" ry="17" fill="var(--ku-cream)"/>
    <!-- 반다나 -->
    <g class="ku-bandana">
      <path d="M76 176 L164 176 L120 214 Z" fill="var(--ku-green)" stroke="var(--ku-green-dark)" stroke-width="3" stroke-linejoin="round"/>
      <path d="M78 176 q42 10 84 0" fill="none" stroke="var(--ku-green-dark)" stroke-width="3"/>
      <text x="120" y="199" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="15" fill="#fff" letter-spacing="1">KU</text>
    </g>
  </g>

  <!-- 팔 -->
  <g class="ku-arm ku-arm-l">
    <rect x="52" y="168" width="26" height="52" rx="13" fill="var(--ku-body)" stroke="var(--ku-line)" stroke-width="4"/>
  </g>
  <g class="ku-arm ku-arm-r">
    <rect x="162" y="168" width="26" height="52" rx="13" fill="var(--ku-body)" stroke="var(--ku-line)" stroke-width="4"/>
    <!-- 연필 (writing) -->
    <g class="ku-pencil">
      <rect x="168" y="150" width="12" height="60" rx="3" fill="#F2C94C" stroke="var(--ku-line)" stroke-width="3" transform="rotate(-30 174 180)"/>
      <path d="M163 161 l8 -16 l8 16 z" fill="#F6E6C8" stroke="var(--ku-line)" stroke-width="3" stroke-linejoin="round" transform="rotate(-30 174 180) translate(0,-5)"/>
      <path d="M169 149 l2 -4 l2 4 z" fill="#3B2A1A" transform="rotate(-30 174 180) translate(0,-5)"/>
    </g>
  </g>

  <!-- 머리 -->
  <g class="ku-head">
    <!-- 귀 -->
    <g class="ku-ear ku-ear-l">
      <ellipse cx="44" cy="104" rx="19" ry="12" fill="var(--ku-body)" stroke="var(--ku-line)" stroke-width="4" transform="rotate(-18 44 104)"/>
      <ellipse cx="46" cy="104" rx="10" ry="6" fill="var(--ku-cream)" transform="rotate(-18 44 104)"/>
    </g>
    <g class="ku-ear ku-ear-r">
      <ellipse cx="196" cy="104" rx="19" ry="12" fill="var(--ku-body)" stroke="var(--ku-line)" stroke-width="4" transform="rotate(18 196 104)"/>
      <ellipse cx="194" cy="104" rx="10" ry="6" fill="var(--ku-cream)" transform="rotate(18 196 104)"/>
    </g>
    <!-- 뿔 -->
    <g class="ku-horn ku-horn-l">
      <path d="M72 52 C 60 44, 54 32, 58 20 C 70 26, 80 36, 84 46 Z" fill="var(--ku-horn)" stroke="var(--ku-line)" stroke-width="4" stroke-linejoin="round"/>
      <path d="M64 34 l10 2 M60 26 l8 2" stroke="var(--ku-line)" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>
    </g>
    <g class="ku-horn ku-horn-r">
      <path d="M168 52 C 180 44, 186 32, 182 20 C 170 26, 160 36, 156 46 Z" fill="var(--ku-horn)" stroke="var(--ku-line)" stroke-width="4" stroke-linejoin="round"/>
      <path d="M176 34 l-10 2 M180 26 l-8 2" stroke="var(--ku-line)" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>
    </g>
    <!-- 얼굴 -->
    <ellipse cx="120" cy="104" rx="80" ry="72" fill="var(--ku-body)" stroke="var(--ku-line)" stroke-width="4"/>
    <!-- 앞머리 -->
    <path d="M110 44 q8 -10 16 -2 M120 40 q8 -8 14 0" fill="none" stroke="var(--ku-line)" stroke-width="3" stroke-linecap="round"/>
    <!-- 주둥이 -->
    <path d="M56 128 C 60 104, 180 104, 184 128 C 186 160, 150 178, 120 178 C 90 178, 54 160, 56 128 Z" fill="var(--ku-cream)" stroke="var(--ku-line)" stroke-width="4" stroke-linejoin="round"/>
    <path d="M100 130 q5 -6 10 0 M130 130 q5 -6 10 0" fill="none" stroke="var(--ku-line)" stroke-width="3.5" stroke-linecap="round"/>
    <!-- 입 (상태별) -->
    <path class="ku-mouth ku-mouth-smile" d="M104 150 q16 14 32 0" fill="none" stroke="var(--ku-line)" stroke-width="4" stroke-linecap="round"/>
    <path class="ku-mouth ku-mouth-big" d="M98 148 q22 24 44 0" fill="none" stroke="var(--ku-line)" stroke-width="4" stroke-linecap="round"/>
    <path class="ku-mouth ku-mouth-o" d="M112 152 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 z" fill="#B45B4A" stroke="var(--ku-line)" stroke-width="3.5"/>
    <path class="ku-mouth ku-mouth-open" d="M98 146 q22 30 44 0 z" fill="#B45B4A" stroke="var(--ku-line)" stroke-width="4" stroke-linejoin="round"/>
    <path class="ku-mouth ku-mouth-wavy" d="M104 152 q8 -6 16 0 t16 0" fill="none" stroke="var(--ku-line)" stroke-width="4" stroke-linecap="round"/>
    <!-- 볼 -->
    <ellipse class="ku-blush ku-blush-l" cx="72" cy="124" rx="9" ry="5" fill="#F09A7A" opacity=".45"/>
    <ellipse class="ku-blush ku-blush-r" cx="168" cy="124" rx="9" ry="5" fill="#F09A7A" opacity=".45"/>
    <!-- 눈 -->
    <g class="ku-eye ku-eye-l">
      <g class="ku-pupil">
        <ellipse cx="94" cy="98" rx="8" ry="10" fill="#3B2A1A"/>
        <circle cx="97" cy="94" r="3" fill="#fff"/>
      </g>
      <rect class="ku-lid" x="84" y="86" width="20" height="24" fill="var(--ku-body)"/>
      <path class="ku-eye-happy" d="M84 100 q10 -12 20 0" fill="none" stroke="var(--ku-line)" stroke-width="4" stroke-linecap="round"/>
    </g>
    <g class="ku-eye ku-eye-r">
      <g class="ku-pupil">
        <ellipse cx="146" cy="98" rx="8" ry="10" fill="#3B2A1A"/>
        <circle cx="149" cy="94" r="3" fill="#fff"/>
      </g>
      <rect class="ku-lid" x="136" y="86" width="20" height="24" fill="var(--ku-body)"/>
      <path class="ku-eye-happy" d="M136 100 q10 -12 20 0" fill="none" stroke="var(--ku-line)" stroke-width="4" stroke-linecap="round"/>
    </g>
    <!-- 눈썹 -->
    <path class="ku-brow ku-brow-l" d="M82 80 q12 -8 24 -2" fill="none" stroke="var(--ku-line)" stroke-width="3.5" stroke-linecap="round"/>
    <path class="ku-brow ku-brow-r" d="M158 80 q-12 -8 -24 -2" fill="none" stroke="var(--ku-line)" stroke-width="3.5" stroke-linecap="round"/>
  </g>

  <!-- 상태별 소품 -->
  <g class="ku-extra ku-extra-doubt">
    <text x="196" y="52" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="44" fill="var(--ku-accent)" stroke="var(--ku-line)" stroke-width="3" paint-order="stroke" text-anchor="middle">?</text>
    <path class="ku-sweat" d="M48 72 q-8 10 0 16 q8 -6 0 -16 z" fill="#8FD0F0" stroke="var(--ku-line)" stroke-width="2.5" stroke-linejoin="round"/>
  </g>
  <g class="ku-extra ku-extra-think">
    <circle class="ku-dot ku-dot-1" cx="190" cy="44" r="5" fill="var(--ku-line)"/>
    <circle class="ku-dot ku-dot-2" cx="206" cy="36" r="6" fill="var(--ku-line)"/>
    <circle class="ku-dot ku-dot-3" cx="224" cy="26" r="7" fill="var(--ku-line)"/>
  </g>
  <g class="ku-extra ku-extra-praise">
    <path class="ku-star ku-star-1" d="M36 40 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z" fill="var(--ku-accent)" stroke="var(--ku-line)" stroke-width="2"/>
    <path class="ku-star ku-star-2" d="M206 70 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z" fill="var(--ku-accent)" stroke="var(--ku-line)" stroke-width="2"/>
    <path class="ku-star ku-star-3" d="M200 20 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z" fill="#fff" stroke="var(--ku-line)" stroke-width="2"/>
  </g>
  <g class="ku-extra ku-extra-cheer">
    <rect class="ku-conf ku-conf-1" x="30" y="30" width="8" height="12" rx="2" fill="var(--ku-accent)"/>
    <rect class="ku-conf ku-conf-2" x="60" y="14" width="8" height="12" rx="2" fill="var(--ku-green)"/>
    <rect class="ku-conf ku-conf-3" x="100" y="8" width="8" height="12" rx="2" fill="#E07A6E"/>
    <rect class="ku-conf ku-conf-4" x="140" y="10" width="8" height="12" rx="2" fill="#8FD0F0"/>
    <rect class="ku-conf ku-conf-5" x="176" y="18" width="8" height="12" rx="2" fill="var(--ku-accent)"/>
    <rect class="ku-conf ku-conf-6" x="206" y="34" width="8" height="12" rx="2" fill="var(--ku-green)"/>
    <circle class="ku-conf ku-conf-7" cx="20" cy="80" r="5" fill="#E07A6E"/>
    <circle class="ku-conf ku-conf-8" cx="222" cy="90" r="5" fill="#8FD0F0"/>
  </g>
  <g class="ku-extra ku-extra-encourage">
    <path class="ku-heart" d="M204 62 c -6 -10, -20 -4, -14 8 c 4 8, 14 14, 14 14 c 0 0, 10 -6, 14 -14 c 6 -12, -8 -18, -14 -8 z" fill="#E07A6E" stroke="var(--ku-line)" stroke-width="2.5" stroke-linejoin="round"/>
  </g>
</g>
`;

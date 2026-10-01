/**
 * [③] 아바타 위에 겹치는 이펙트 SVG (물음표·땀·반짝·눈물·하트·음표·먹구름·학사모). 좌표는 0 0 240 300 (아바타 박스 기준).
 * junior.css 의 jr-mood-* 클래스가 보여줄 그룹을 고르고 애니메이션을 건다.
 */
export const FX_VIEWBOX = "0 0 240 300";
export const FX_SVG = `
<g class="fx fx-confused">
  <text class="fx-q" x="200" y="64" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="52" fill="#F4B942" stroke="#5A4420" stroke-width="3" paint-order="stroke" text-anchor="middle">?</text>
  <path class="fx-sweat" d="M46 74 q-9 12 0 18 q9 -7 0 -18 z" fill="#8FD0F0" stroke="#3A3540" stroke-width="2.5" stroke-linejoin="round"/>
</g>
<g class="fx fx-happy">
  <path class="fx-star fx-star-1" d="M30 60 l5 12 l12 5 l-12 5 l-5 12 l-5 -12 l-12 -5 l12 -5 z" fill="#F4B942" stroke="#5A4420" stroke-width="2"/>
  <path class="fx-star fx-star-2" d="M212 100 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" fill="#F4B942" stroke="#5A4420" stroke-width="2"/>
  <path class="fx-star fx-star-3" d="M204 36 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" fill="#fff" stroke="#5A4420" stroke-width="2"/>
  <path class="fx-heart fx-heart-1" d="M40 120 c -6 -10, -20 -4, -14 8 c 4 8, 14 14, 14 14 c 0 0, 10 -6, 14 -14 c 6 -12, -8 -18, -14 -8 z" fill="#E07A6E" stroke="#5A4420" stroke-width="2"/>
</g>
<g class="fx fx-sad">
  <path class="fx-tear" d="M150 128 q-7 10 0 16 q7 -6 0 -16 z" fill="#8FD0F0" stroke="#3A3540" stroke-width="2.5" stroke-linejoin="round"/>
  <g class="fx-cloud">
    <path d="M26 46 q10 -16 26 -4 q8 -16 24 -2 q14 -6 16 10 h-68 z" fill="#C9D0DA" stroke="#3A3540" stroke-width="2.5" stroke-linejoin="round"/>
    <path class="fx-rain fx-rain-1" d="M40 56 l-4 12" stroke="#8FD0F0" stroke-width="3" stroke-linecap="round"/>
    <path class="fx-rain fx-rain-2" d="M58 56 l-4 12" stroke="#8FD0F0" stroke-width="3" stroke-linecap="round"/>
    <path class="fx-rain fx-rain-3" d="M76 56 l-4 12" stroke="#8FD0F0" stroke-width="3" stroke-linecap="round"/>
  </g>
</g>
<g class="fx fx-think">
  <circle class="fx-dot fx-dot-1" cx="190" cy="58" r="5" fill="#3A3540"/>
  <circle class="fx-dot fx-dot-2" cx="206" cy="48" r="6" fill="#3A3540"/>
  <circle class="fx-dot fx-dot-3" cx="224" cy="36" r="7" fill="#3A3540"/>
</g>
<g class="fx fx-talk">
  <path class="fx-note fx-note-1" d="M200 60 v-26 l14 -4 v26 a5 5 0 1 1 -4 -5 v-14 l-6 2 v18 a5 5 0 1 1 -4 -5 z" fill="#1F6F5B"/>
  <path class="fx-note fx-note-2" d="M36 90 v-20 l10 -3 v20 a4 4 0 1 1 -3 -4 v-11 l-4 1 v14 a4 4 0 1 1 -3 -4 z" fill="#F4B942"/>
</g>
<g class="fx fx-angry">
  <path class="fx-vein" d="M196 50 q8 -8 16 0 M204 42 q0 10 0 16" fill="none" stroke="#C0392B" stroke-width="4" stroke-linecap="round"/>
</g>
<g class="fx fx-cap">
  <g class="fx-cap-body">
    <path d="M120 24 l66 20 l-66 20 l-66 -20 z" fill="#1E2233" stroke="#5A4420" stroke-width="3" stroke-linejoin="round"/>
    <path d="M86 46 v14 q34 16 68 0 v-14" fill="#1E2233" stroke="#5A4420" stroke-width="3" stroke-linejoin="round"/>
    <path d="M120 44 q30 0 32 30" fill="none" stroke="#F4B942" stroke-width="4" stroke-linecap="round"/>
    <circle cx="152" cy="74" r="5" fill="#F4B942"/>
  </g>
</g>
`;

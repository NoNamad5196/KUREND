# 캐릭터 이미지

`raw/` 는 팀이 받은 원본 시트, 나머지는 배경을 투명하게 자른 컷(높이 640px PNG).
컷은 `JuniorAvatar`(src/components/game)가 `/characters/{male|female|ku}/{view}.png` 규칙으로 읽는다.

| 캐릭터 | 컷 |
|---|---|
| male (남학생) | front · side · back · grad-front · grad-side · grad-back · soldiers-front/side/back(군복, 동료 포함 — GAME OVER 씬) |
| female (여학생) | front · side · back · grad-front · grad-side · grad-back · casual-front/side/back(베이지 니트) |
| ku (KU) | front · grad-front |

규칙: 소문자·하이픈, 투명 배경, 한 장 200~500KB. 교체할 때 파일명만 같으면 코드 수정 없음.

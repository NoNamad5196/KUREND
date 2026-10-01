"use client";
/** "자료 보기" → 착각 경고 모달 → 드로어 */
import { useState } from "react";
import { SourceDrawer } from "./SourceDrawer";
import { Button, Modal } from "./ui";

export function SourcePeekButton({ materialId, chapterId, className }: { materialId: string; chapterId: string; className?: string }) {
  const [ask, setAsk] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" className={className} onClick={() => setAsk(true)}>
        자료 보기
      </Button>
      <Modal open={ask} onClose={() => setAsk(false)} title="자료 보기">
        <p className="text-sm text-muted">자료를 보면서 설명하면 아는 것 같은 착각이 들기 쉽습니다. 막힐 때만 잠깐 보세요.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAsk(false)}>
            계속 설명
          </Button>
          <Button
            onClick={() => {
              setAsk(false);
              setOpen(true);
            }}
          >
            자료 보기
          </Button>
        </div>
      </Modal>
      <SourceDrawer open={open} onClose={() => setOpen(false)} materialId={materialId} chapterId={chapterId} />
    </>
  );
}

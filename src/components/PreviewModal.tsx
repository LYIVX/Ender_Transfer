import { Modal } from "@enderfall/ui";
import type { PreviewState } from "../types";

interface PreviewModalProps {
  previewState: PreviewState | null;
  previewSrc: string | null;
  onClose: () => void;
}

const PreviewModal = ({ previewState, previewSrc, onClose }: PreviewModalProps) => {
  if (!previewState) return null;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={previewState.name}
      size="wide"
      className="preview-modal"
    >
      <div className="preview-body">
        {previewSrc ? (
          previewState.isVideo ? (
            <video src={previewSrc} controls preload="metadata" />
          ) : (
            <img src={previewSrc} alt={previewState.name} />
          )
        ) : (
          <div className="empty-state">Preview unavailable.</div>
        )}
      </div>
    </Modal>
  );
};

export default PreviewModal;

import { Button, Input, Modal } from "@enderfall/ui";
import type { ModalState } from "../types";

interface AppModalsProps {
  modal: ModalState | null;
  modalValue: string;
  onModalValueChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

const AppModals = ({ modal, modalValue, onModalValueChange, onClose, onConfirm }: AppModalsProps) => {
  if (!modal || modal.type === "prefs") return null;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        modal.type === "delete"
          ? `Delete ${modal.scope} item`
          : "Save connection bookmark"
      }
    >
      {modal.type === "ftp-bookmark" && (
        <Input
          autoFocus
          value={modalValue}
          onChange={(event) => onModalValueChange(event.target.value)}
          placeholder="Enter a name"
        />
      )}
      {modal.type === "delete" && (
        <p>
          Delete <strong>{modal.targetName}</strong>? This cannot be undone.
        </p>
      )}
      <div className="modal-actions">
        <Button variant="ghost" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={modal.type === "delete" ? "delete" : "primary"}
          onClick={onConfirm}
        >
          {modal.type === "delete" ? "Delete" : "Confirm"}
        </Button>
      </div>
    </Modal>
  );
};

export default AppModals;

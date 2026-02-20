import { useState } from "react";
import type { HistoryAction } from "../types";

export function useHistory(addLog: (level: string, message: string) => void) {
  const [historyStack, setHistoryStack] = useState<HistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryAction[]>([]);

  const pushHistory = (action: HistoryAction) => {
    setHistoryStack((prev) => [action, ...prev].slice(0, 50));
    setRedoStack([]);
  };

  const undoLast = async () => {
    const action = historyStack[0];
    if (!action) return;
    try {
      await action.undo();
      setHistoryStack((prev) => prev.slice(1));
      setRedoStack((prev) => [action, ...prev]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
  };

  const redoLast = async () => {
    const action = redoStack[0];
    if (!action) return;
    try {
      await action.redo();
      setRedoStack((prev) => prev.slice(1));
      setHistoryStack((prev) => [action, ...prev]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog("error", message);
    }
  };

  return {
    historyStack,
    redoStack,
    pushHistory,
    undoLast,
    redoLast,
    canUndo: historyStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}

import { useState } from "react";

export interface HistoryState<T> {
  value: T;
  set: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (next: T) => void;
}

export function useHistoryState<T>(initial: T): HistoryState<T> {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);

  const set = (next: T): void => {
    setPast((prev) => [...prev, present]);
    setPresent(next);
    setFuture([]);
  };

  const undo = (): void => {
    setPast((prevPast) => {
      if (prevPast.length === 0) {
        return prevPast;
      }
      const previous = prevPast[prevPast.length - 1];
      setFuture((prevFuture) => [present, ...prevFuture]);
      setPresent(previous);
      return prevPast.slice(0, -1);
    });
  };

  const redo = (): void => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) {
        return prevFuture;
      }
      const [next, ...rest] = prevFuture;
      setPast((prevPast) => [...prevPast, present]);
      setPresent(next);
      return rest;
    });
  };

  const reset = (next: T): void => {
    setPast([]);
    setPresent(next);
    setFuture([]);
  };

  return {
    value: present,
    set,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    reset,
  };
}

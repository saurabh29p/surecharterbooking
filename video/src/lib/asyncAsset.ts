import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';

/**
 * Loads an asset inside a <ThreeCanvas>. The frame is held until the asset is loaded AND the scene
 * has been redrawn with it: ThreeCanvas only redraws when the frame number changes, so content that
 * mounts after an async load would otherwise miss the captured frame.
 */
export const useAsyncAsset = <T,>(label: string, load: () => Promise<T>, deps: unknown[] = []): T | null => {
  const [value, setValue] = useState<T | null>(null);
  const [handle] = useState(() => delayRender(label));
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    let alive = true;
    load().then((v) => alive && setValue(() => v));
    return () => { alive = false; };
  }, deps);
  useEffect(() => {
    if (value === null) return;
    // let React commit the new meshes, then redraw before releasing the frame
    requestAnimationFrame(() => {
      advance(performance.now());
      continueRender(handle);
    });
  }, [value]);
  return value;
};

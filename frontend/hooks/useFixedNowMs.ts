import { useState } from "react";

/** Stable “now” for age calculations during render (avoids impure Date.now() in render body). */
export function useFixedNowMs(): number {
  return useState(() => Date.now())[0];
}

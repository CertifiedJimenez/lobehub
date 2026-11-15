import { createContext, use } from 'react';

/** Portal target immediately above this composer; contains no media lifecycle. */
export const VoiceOverlayContext = createContext<HTMLDivElement | null>(null);
export const useVoiceOverlayTarget = () => use(VoiceOverlayContext);

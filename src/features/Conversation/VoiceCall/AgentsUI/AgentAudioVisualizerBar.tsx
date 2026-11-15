// Copyright LiveKit, Inc. SPDX-License-Identifier: Apache-2.0
// Adapted from https://github.com/livekit/components-js/blob/main/packages/shadcn/components/agents-ui/agent-audio-visualizer-bar.tsx
// Changes: StyleX styling, theme colors, and local microphone visualization while listening.
'use client';

import {
  type AgentState,
  type TrackReferenceOrPlaceholder,
  useMultibandTrackVolume,
} from '@livekit/components-react';
import { cx as cn } from '@lobehub/ui';
import * as stylex from '@stylexjs/stylex';
import { type LocalAudioTrack, type RemoteAudioTrack } from 'livekit-client';
import React, {
  Children,
  cloneElement,
  type ComponentProps,
  type CSSProperties,
  isValidElement,
  type ReactNode,
  useMemo,
} from 'react';

import { resolveVisualizerBands } from '../visualizerAudio';
import { useAgentAudioVisualizerBarAnimator } from './useAgentAudioVisualizerBar';

/**
 * Resizes an array of per-band volume values to exactly `count` entries.
 * Excess values are trimmed from the end; if there are too few, the last
 * value is duplicated to fill the remainder. An empty array is padded with 0s.
 */
export function normalizeVolumeBands(bands: number[], count: number): number[] {
  if (bands.length === count) return bands;
  if (bands.length > count) return bands.slice(0, count);
  const lastValue = bands.at(-1) ?? 0;
  return [...bands, ...Array.from({ length: count - bands.length }, () => lastValue)];
}

function cloneSingleChild(
  children: ReactNode | ReactNode[],
  props?: Record<string, unknown>,
  key?: unknown,
) {
  return Children.map(children, (child) => {
    // Checking isValidElement is the safe way and avoids a typescript error too.
    if (isValidElement(child) && Children.only(children)) {
      const childProps = child.props as Record<string, unknown>;
      if (childProps.className) {
        // make sure we retain classnames of both passed props and child
        props ??= {};
        props.className = cn(childProps.className as string, props.className as string);
        props.style = {
          ...(childProps.style as CSSProperties),
          ...(props.style as CSSProperties),
        };
      }
      return cloneElement(child, { ...props, key: key ? String(key) : undefined });
    }
    return child;
  });
}

// Agents UI sizes, mapped to the host app's StyleX styling instead of Tailwind.
const styles = stylex.create({
  root: { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  bar: {
    borderRadius: 9999,
    backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)',
    transitionProperty: 'background-color',
    transitionDuration: { 'default': '250ms', '@media (prefers-reduced-motion: reduce)': '0ms' },
    transitionTimingFunction: 'linear',
  },
  highlighted: { backgroundColor: 'currentColor' },
  icon: { height: 24, gap: 2 },
  sm: { height: 56, gap: 4 },
  md: { height: 112, gap: 8 },
  lg: { height: 224, gap: 16 },
  xl: { height: 448, gap: 32 },
  barIcon: { width: 4, minHeight: 4 },
  barSm: { width: 8, minHeight: 8 },
  barMd: { width: 16, minHeight: 16 },
  barLg: { width: 32, minHeight: 32 },
  barXl: { width: 64, minHeight: 64 },
});
const barStyles = {
  icon: styles.barIcon,
  sm: styles.barSm,
  md: styles.barMd,
  lg: styles.barLg,
  xl: styles.barXl,
};
export const AgentAudioVisualizerBarVariants = ({
  size = 'md',
}: {
  size?: keyof typeof barStyles;
}) => stylex.props(styles.root, styles[size]).className;
export const AgentAudioVisualizerBarElementVariants = ({
  size = 'md',
  highlighted = false,
}: {
  size?: keyof typeof barStyles;
  highlighted?: boolean;
}) => stylex.props(styles.bar, barStyles[size], highlighted && styles.highlighted).className;

/**
 * Props for the AgentAudioVisualizerBar component.
 */
export interface AgentAudioVisualizerBarProps {
  /**
   * The audio track to visualize. Can be a local/remote audio track or a track reference.
   */
  audioTrack?: LocalAudioTrack | RemoteAudioTrack | TrackReferenceOrPlaceholder;
  /**
   * The number of bars to display in the visualizer.
   * If not provided, defaults based on size: 3 for 'icon'/'sm', 5 for others.
   */
  barCount?: number;
  /**
   * Custom div element to render as grid cells. Each child receives data-lk-index,
   * data-lk-highlighted props and style props for height. Must be a single div element.
   */
  children?: ReactNode;
  /**
   * Additional CSS class names to apply to the container.
   */
  className?: string;
  /**
   * The color of the bars in hexidecimal format.
   */
  color?: `#${string}`;
  /**
   * The size of the visualizer.
   * @defaultValue 'md'
   */
  size?: 'icon' | 'sm' | 'md' | 'lg' | 'xl';
  /**
   * The current state of the agent. Determines the animation pattern.
   * @defaultValue 'connecting'
   */
  state?: AgentState;
  /**
   * Volume values (0-1) to use instead of the values computed from the audioTrack.
   * The volumeBands.length should match barCount.
   */
  volumeBands?: number[];
}

/**
 * A bar-style audio visualizer that responds to agent state and audio levels.
 * Displays animated bars that react to the current agent state (connecting, thinking, speaking, etc.)
 * and audio volume when speaking or listening to the local microphone.
 *
 * @extends ComponentProps<'div'>
 *
 * @example
 * ```tsx
 * <AgentAudioVisualizerBar
 *   size="md"
 *   state="speaking"
 *   audioTrack={agentAudioTrack}
 * />
 * ```
 */
export function AgentAudioVisualizerBar({
  size = 'md',
  state = 'connecting',
  color,
  barCount,
  audioTrack,
  volumeBands,
  className,
  children,
  style,
  ...props
}: AgentAudioVisualizerBarProps & ComponentProps<'div'>) {
  const _barCount = useMemo(() => {
    if (barCount) {
      return barCount;
    }
    switch (size) {
      case 'icon':
      case 'sm': {
        return 3;
      }
      default: {
        return 5;
      }
    }
  }, [barCount, size]);

  const multibandVolume = useMultibandTrackVolume(audioTrack, {
    bands: _barCount,
    // With the hook's 2048-point FFT, include speech fundamentals and harmonics.
    loPass: 4,
    hiPass: 170,
  });
  const resolvedVolumeBands = volumeBands
    ? normalizeVolumeBands(volumeBands, _barCount)
    : multibandVolume;

  const sequencerInterval = useMemo(() => {
    switch (state) {
      case 'connecting': {
        return 2000 / _barCount;
      }
      case 'initializing': {
        return 2000;
      }
      case 'listening': {
        return 500;
      }
      case 'thinking': {
        return 150;
      }
      default: {
        return 1000;
      }
    }
  }, [state, _barCount]);

  const highlightedIndices = useAgentAudioVisualizerBarAnimator(
    state,
    _barCount,
    sequencerInterval,
  );

  const bands = useMemo(
    () => resolveVisualizerBands(state, resolvedVolumeBands, _barCount),
    [state, resolvedVolumeBands, _barCount],
  );

  if (children && Array.isArray(children)) {
    throw new Error('AgentAudioVisualizerBar children must be a single element.');
  }

  return (
    <div
      className={cn(AgentAudioVisualizerBarVariants({ size }), className)}
      data-lk-state={state}
      style={{ ...style, color: color ?? style?.color } as CSSProperties}
      {...props}
    >
      {bands.map((band: number, idx: number) =>
        children ? (
          <React.Fragment key={idx}>
            {cloneSingleChild(children, {
              'data-lk-index': idx,
              'data-lk-highlighted':
                highlightedIndices.includes(idx) || (state === 'listening' && band > 0.01),
              'style': { height: `${band * 100}%` },
            })}
          </React.Fragment>
        ) : (
          <div
            data-lk-index={idx}
            key={idx}
            style={{ height: `${band * 100}%` }}
            className={cn(
              AgentAudioVisualizerBarElementVariants({
                size,
                highlighted:
                  highlightedIndices.includes(idx) || (state === 'listening' && band > 0.01),
              }),
            )}
            data-lk-highlighted={
              highlightedIndices.includes(idx) || (state === 'listening' && band > 0.01)
            }
          />
        ),
      )}
    </div>
  );
}

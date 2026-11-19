import React from 'react';
import { Composition, staticFile } from 'remotion';
import { VideoComposition } from './VideoComposition';
import { VideoCompositionProps } from './types';
import { resolveTimeline } from './timelineSync';

const DEFAULT_PROPS: VideoCompositionProps = {
  projectSlug: 'default-preview',
  mediaBaseUrl: '',
  editPlan: {
    version: '1.0.0',
    theme: 'obsidian-studio',
    videoMeta: {
      title: 'CooDance Studio Preview',
      subtitle: 'Code-as-Video 16:9 Automated Production',
      width: 1920,
      height: 1080,
      fps: 60,
    },
    subtitleStyle: {
      enabled: true,
      position: 'bottom',
      fontSize: 44,
      maxCharsPerLine: 22,
      highlightActive: true,
    },
    chapters: [{ id: 'ch-1', title: '开场预览', startSec: 0, endSec: 5 }],
    scenes: [
      {
        id: 'scene-default',
        type: 'title-card',
        label: '默认标题画面',
        startSec: 0,
        endSec: 5,
        transition: 'fade',
        props: {
          eyebrow: 'COODANCE STUDIO',
          heading: 'Code-as-Video 自动化视频管线',
          subheading: '执行 npm run sync -- <project-slug> 同步工程到 Remotion Studio',
          badge: '1920×1080 @ 60fps',
        },
      },
    ],
    overlays: [],
    sfxEvents: [],
  },
  timeline: null,
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CooDanceMain"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      component={VideoComposition as React.FC<any>}
      durationInFrames={300}
      fps={60}
      width={1920}
      height={1080}
      defaultProps={DEFAULT_PROPS}
      calculateMetadata={async ({ props }) => {
        let typed = props as unknown as VideoCompositionProps;
        if (!typed.mediaBaseUrl) {
          try {
            const res = await fetch(staticFile('project/active-project.json'));
            if (res.ok) {
              const synced = (await res.json()) as VideoCompositionProps;
              if (synced?.editPlan) {
                typed = {
                  ...synced,
                  mediaBaseUrl: staticFile('project').replace(/\/+$/, ''),
                };
              }
            }
          } catch {
            // Fall back to defaultProps when no project has been synced yet
          }
        }
        const fps = typed.editPlan?.videoMeta?.fps || 60;
        const width = typed.editPlan?.videoMeta?.width || 1920;
        const height = typed.editPlan?.videoMeta?.height || 1080;
        const resolved = resolveTimeline(
          typed.editPlan || DEFAULT_PROPS.editPlan,
          typed.timeline || null,
          fps,
        );
        return {
          durationInFrames: resolved.durationInFrames,
          fps,
          width,
          height,
          props: typed as unknown as Record<string, unknown>,
        };
      }}
    />
  );
};

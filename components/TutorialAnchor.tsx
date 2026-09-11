/**
 * Enveloppe un élément UI pour le spotlight du tutoriel (sans double bordure orange).
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle, type LayoutChangeEvent } from 'react-native';
import { useTutorial } from '@/context/TutorialContext';

type Props = {
  id: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function TutorialAnchor({ id, children, style }: Props) {
  const { active, step, registerTarget, unregisterTarget, setHighlight } = useTutorial();
  const ref = useRef<View>(null);
  const isTarget = active && step?.targetId === id;

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setHighlight({ x, y, width, height: Math.min(height, 140) });
      }
    });
  }, [setHighlight]);

  useEffect(() => {
    registerTarget(id, measure);
    return () => unregisterTarget(id);
  }, [id, measure, registerTarget, unregisterTarget]);

  useEffect(() => {
    if (isTarget) {
      const t = setTimeout(measure, 150);
      return () => clearTimeout(t);
    }
  }, [isTarget, measure]);

  const onLayout = (_e: LayoutChangeEvent) => {
    if (isTarget) measure();
  };

  return (
    <View ref={ref} onLayout={onLayout} collapsable={false} style={style}>
      {children}
    </View>
  );
}

import React from 'react';

interface WorkbenchCardProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'section' | 'article' | 'div' | 'aside';
  tone?: 'primary' | 'secondary' | 'flat';
}

const TONE_CLASS: Record<NonNullable<WorkbenchCardProps['tone']>, string> = {
  primary: 'bg-white/80 shadow-card',
  secondary: 'bg-white/60',
  flat: 'bg-white/35',
};

export const WorkbenchCard: React.FC<WorkbenchCardProps> = ({
  as: Element = 'section',
  tone = 'primary',
  className = '',
  ...props
}) => (
  <Element
    className={`rounded-card border border-card-border ${TONE_CLASS[tone]} ${className}`}
    {...props}
  />
);

export default WorkbenchCard;

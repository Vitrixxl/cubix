import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { LucideIcon, LucideProps } from 'lucide-react-native';
import { styled } from 'nativewind';
import * as React from 'react';

type IconProps = LucideProps & {
  as: LucideIcon;
} & React.RefAttributes<LucideIcon>;

function IconImpl({ as: IconComponent, ...props }: IconProps) {
  return <IconComponent {...props} />;
}

/**
 * NativeWind v5: the text colour of the classes becomes the icon's `color`. The size is the `size` prop, not a class.
 */
const StyledIcon = styled(IconImpl, {
  className: { target: false, nativeStyleMapping: { color: 'color', opacity: 'opacity' } },
} as never) as unknown as React.ComponentType<IconProps & { className?: string }>;

/**
 * A Lucide icon coloured with classes (`text-muted-foreground`), inheriting the text colour of the button or menu item
 * around it through `TextClassContext`, like React Native Reusables' Icon.
 *
 * @example
 * <Icon as={ArrowRight} className="text-primary" size={18} />
 */
function Icon({ as: IconComponent, className, size = 16, ...props }: IconProps & { className?: string }) {
  const textClass = React.useContext(TextClassContext);
  return (
    <StyledIcon
      as={IconComponent}
      className={cn('text-foreground', textClass, className)}
      size={size}
      {...props}
    />
  );
}

export { Icon };

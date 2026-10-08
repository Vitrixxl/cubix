import { CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { said } from '../../../../src/client/i18n';

/** The web's alert variants (desktop/renderer/components/ui/alert.tsx): a soft tint, its outline and its icon. */
const VARIANTS = {
  default: { box: 'border-border bg-card', glyph: 'text-muted-foreground', icon: Info },
  info: { box: 'border-primary/25 bg-primary/10', glyph: 'text-primary', icon: Info },
  warning: { box: 'border-warning/30 bg-warning/10', glyph: 'text-warning', icon: TriangleAlert },
  destructive: { box: 'border-destructive/25 bg-destructive/10', glyph: 'text-destructive', icon: CircleAlert },
} as const;

/**
 * A callout or an inline error: its icon, an optional title, the sentence (`children`) and an optional `action` on the
 * right (a Retry). Texts are translated (`said`): an error from the API comes in English.
 */
function Alert({ variant = 'default', icon, title, action, children, className }: {
  variant?: keyof typeof VARIANTS; icon?: LucideIcon; title?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string;
}) {
  const v = VARIANTS[variant];
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" className={cn('flex-row items-start gap-2.5 rounded-lg border px-3 py-2.5', v.box, className)}>
      <Icon as={icon ?? v.icon} size={16} className={cn('mt-0.5', v.glyph)} />
      <View className="min-w-0 flex-1 gap-0.5">
        {title ? <Text className="text-sm font-medium">{said(title)}</Text> : null}
        {typeof children === 'string' ? <Text className={cn('text-sm', title ? 'text-muted-foreground' : 'text-foreground')}>{said(children)}</Text> : children}
      </View>
      {action ? <View className="-my-1 self-center">{action}</View> : null}
    </View>
  );
}

export { Alert };

import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { styled } from "nativewind";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { BackHandler, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useColors } from "../theme";

/**
 * A sheet from the bottom (the web's `PhoneSheet`, a Base UI drawer there): a handle to swipe it away, its title,
 * then its content. By default it takes the height of its content; `tall` takes the screen's height (a dialog's worth
 * of content); `snapPoints` let it rest half open and be pulled up. The Android back button closes it.
 *
 * Content that scrolls uses `SheetScrollView` or `SheetFlatList`, text fields `SheetInput`, so dragging and the
 * keyboard cooperate with the sheet.
 */
export function Sheet({ open, onClose, title, description, right, tall = false, snapPoints, hideTitle = false, children, contentClassName, scroll = false, contentPanning = true }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Controls at the end of the title row. */
  right?: ReactNode;
  tall?: boolean;
  snapPoints?: (string | number)[];
  hideTitle?: boolean;
  children: ReactNode;
  /** Classes of the content column (padding, gap). */
  contentClassName?: string;
  /** Wrap the content in a scroll view. */
  scroll?: boolean;
  /** Whether dragging the content moves the sheet (off for content with its own drags, like reordering). */
  contentPanning?: boolean;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  // Only a presented sheet is dismissed: dismissing one that never opened leaves the modal "dismissing" for good.
  const presented = useRef(false);
  useEffect(() => {
    if (open) { presented.current = true; ref.current?.present(); }
    else if (presented.current) { presented.current = false; ref.current?.dismiss(); }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { ref.current?.dismiss(); return true; });
    return () => subscription.remove();
  }, [open]);
  const backdrop = useCallback((props: BottomSheetBackdropProps) =>
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.55} pressBehavior="close" />, []);
  const top = insets.top + 48;
  const points = snapPoints ?? (tall ? [height - top] : undefined);
  const head = !hideTitle && <View className="flex-row items-center gap-2 px-5 pt-1 pb-2">
    <View className="min-w-0 flex-1 gap-0.5">
      {typeof title === "string" ? <Text accessibilityRole="header" className="text-base font-semibold">{title}</Text> : title}
      {description ? <Text className="text-xs text-muted-foreground">{description}</Text> : null}
    </View>
    {right}
  </View>;
  const body = cn("gap-4 px-5 pt-2", contentClassName);
  return <BottomSheetModal ref={ref} onDismiss={() => { presented.current = false; latestClose.current(); }} backdropComponent={backdrop}
    snapPoints={points} enableDynamicSizing={!points} maxDynamicContentSize={height - top}
    enableContentPanningGesture={contentPanning}
    keyboardBehavior="interactive" keyboardBlurBehavior="restore" android_keyboardInputMode="adjustResize" enableBlurKeyboardOnGesture
    backgroundStyle={{ backgroundColor: colors.popover, borderTopLeftRadius: 18, borderTopRightRadius: 18 }}
    handleIndicatorStyle={{ backgroundColor: colors.mutedForeground, opacity: 0.5, width: 40 }}>
    {scroll
      ? <BottomSheetScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} keyboardShouldPersistTaps="handled">
        {head}
        <View className={body}>{children}</View>
      </BottomSheetScrollView>
      : <BottomSheetView style={points ? { flex: 1 } : undefined}>
        {head}
        <View className={cn(body, points && "min-h-0 flex-1")} style={{ paddingBottom: insets.bottom + 20 }}>{children}</View>
      </BottomSheetView>}
  </BottomSheetModal>;
}

/** A scroll view inside a sheet: dragging it down at the top pulls the sheet. */
export const SheetScrollView = styled(BottomSheetScrollView, { className: "style", contentContainerClassName: "contentContainerStyle" } as never) as unknown as typeof BottomSheetScrollView & React.ComponentType<{ className?: string; contentContainerClassName?: string }>;
/** A list inside a sheet. */
export const SheetFlatList = BottomSheetFlatList;

/** A text field inside a sheet, which the sheet lifts above the keyboard. */
const StyledSheetInput = styled(BottomSheetTextInput, { className: "style" } as never) as unknown as React.ComponentType<React.ComponentProps<typeof BottomSheetTextInput> & { className?: string }>;
export function SheetInput({ className, ...props }: React.ComponentProps<typeof BottomSheetTextInput> & { className?: string }) {
  const colors = useColors();
  return <StyledSheetInput placeholderTextColor={colors.mutedForeground} cursorColor={colors.primary} selectionColor={colors.primary + "55"}
    className={cn("min-h-11 rounded-lg border border-input bg-input/30 px-3 font-sans text-base text-foreground", className)} {...props} />;
}

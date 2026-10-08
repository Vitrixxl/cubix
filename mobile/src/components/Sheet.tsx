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
import { useCallback, useContext, useEffect, useMemo, useRef, type ComponentProps, type ReactNode } from "react";
import { BackHandler, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useColors } from "../theme";
import { said } from "../../../src/client/i18n";

/**
 * A sheet from the bottom (the web's `PhoneSheet`, a Base UI drawer there): a handle to swipe it away, its title,
 * then its content. It always takes the height of its content, up to the screen's (under the status bar), never a
 * fixed or minimum height. The Android back button closes it.
 *
 * Content that scrolls uses `SheetScrollView` or `SheetFlatList`, text fields `SheetInput`, so dragging and the
 * keyboard cooperate with the sheet; a list under a header shrinks to the room left once the sheet reaches its maximum.
 */
export function Sheet({ open, onClose, title, description, right, hideTitle = false, children, contentClassName, scroll = false, contentPanning = true }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Controls at the end of the title row. */
  right?: ReactNode;
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
  const max = height - insets.top - 48;
  const head = !hideTitle && <View className="flex-row items-center gap-2 px-5 pt-1 pb-2">
    <View className="min-w-0 flex-1 gap-0.5">
      {typeof title === "string" ? <Text accessibilityRole="header" className="text-base font-semibold">{said(title)}</Text> : title}
      {description ? <Text className="text-xs text-muted-foreground">{said(description)}</Text> : null}
    </View>
    {right}
  </View>;
  const body = cn("gap-4 px-5 pt-2", contentClassName);
  // A sheet opened from another (a choice in the settings, a confirmation over a solve) goes over it, the first kept.
  return <BottomSheetModal ref={ref} onDismiss={() => { presented.current = false; latestClose.current(); }} backdropComponent={backdrop}
    stackBehavior="push" enableDynamicSizing maxDynamicContentSize={max}
    enableContentPanningGesture={contentPanning}
    keyboardBehavior="interactive" keyboardBlurBehavior="restore" android_keyboardInputMode="adjustPan" enableBlurKeyboardOnGesture
    backgroundStyle={{ backgroundColor: colors.popover, borderTopLeftRadius: 18, borderTopRightRadius: 18 }}
    handleIndicatorStyle={{ backgroundColor: colors.mutedForeground, opacity: 0.5, width: 40 }}>
    {scroll
      ? <BottomSheetScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} keyboardShouldPersistTaps="handled">
        {head}
        <View className={body}>{children}</View>
      </BottomSheetScrollView>
      : <BottomSheetView style={{ maxHeight: max }}>
        {head}
        <View className={cn(body, "min-h-0 shrink")} style={{ paddingBottom: insets.bottom + 20 }}>{children}</View>
      </BottomSheetView>}
  </BottomSheetModal>;
}

// The sheet's internals, so a scrollable under a header can stop reporting its own height as the sheet's.
const { BottomSheetInternalContext } = require("@gorhom/bottom-sheet/src/contexts/internal") as { BottomSheetInternalContext: React.Context<{ enableDynamicSizing: boolean } | null> };
/**
 * A scrollable inside a sheet's content: the sheet measures the content around it (header included), not the scrolled
 * content alone, which is what the library's scrollables would report under dynamic sizing.
 */
function Nested({ children }: { children: ReactNode }) {
  const internal = useContext(BottomSheetInternalContext);
  const value = useMemo(() => internal && { ...internal, enableDynamicSizing: false }, [internal]);
  return <BottomSheetInternalContext.Provider value={value}>{children}</BottomSheetInternalContext.Provider>;
}
/** Takes the height of its content, and shrinks to the room left in a sheet at its maximum height. */
const FIT = { flexGrow: 0, flexShrink: 1 } as const;

/** A scroll view inside a sheet: dragging it down at the top pulls the sheet. */
const StyledSheetScrollView = styled(BottomSheetScrollView, { className: "style", contentContainerClassName: "contentContainerStyle" } as never) as unknown as React.ComponentType<ComponentProps<typeof BottomSheetScrollView> & { className?: string; contentContainerClassName?: string }>;
export function SheetScrollView({ style, ...props }: ComponentProps<typeof StyledSheetScrollView>) {
  return <Nested><StyledSheetScrollView style={[FIT, style]} {...props} /></Nested>;
}
/** A list inside a sheet. */
export function SheetFlatList<T>({ style, ...props }: ComponentProps<typeof BottomSheetFlatList<T>>) {
  return <Nested><BottomSheetFlatList<T> style={[FIT, style]} {...props} /></Nested>;
}

/** A text field inside a sheet, which the sheet lifts above the keyboard. */
const StyledSheetInput = styled(BottomSheetTextInput, { className: "style" } as never) as unknown as React.ComponentType<React.ComponentProps<typeof BottomSheetTextInput> & { className?: string }>;
export function SheetInput({ className, ...props }: React.ComponentProps<typeof BottomSheetTextInput> & { className?: string }) {
  const colors = useColors();
  return <StyledSheetInput placeholderTextColor={colors.mutedForeground} cursorColor={colors.primary} selectionColor={colors.primary + "55"}
    className={cn("min-h-11 rounded-lg border border-input bg-input/30 px-3 font-sans text-base text-foreground", className)} {...props} />;
}

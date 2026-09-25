import { afterEach, expect, mock, test } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState } from "react";

const announce = mock(() => {});
const scrollTo = mock(() => {});
mock.module("react-native", () => ({
  View: "View", Text: "Text", ScrollView: "ScrollView",
  Animated: { View: "AnimatedView", Value: class { value = 0; setValue(value: number) { this.value = value; } } },
  StyleSheet: { create: (styles: unknown) => styles },
  PanResponder: { create: (handlers: unknown) => ({ panHandlers: handlers }) },
  AccessibilityInfo: { announceForAccessibility: announce },
}));
const { LearningGroups } = await import("../src/components/LearningGroups");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
let saved: string[][];
let setDisabled: (disabled: boolean) => void;
const names = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"];
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); announce.mockClear(); scrollTo.mockClear(); });
async function mount() {
  saved = [];
  function Harness() {
    const [groups, setGroups] = useState(names);
    const [disabled, updateDisabled] = useState(false);
    setDisabled = updateDisabled;
    return <LearningGroups groups={groups} disabled={disabled} onReorder={next => { saved.push(next); setGroups(next); }} />;
  }
  await act(() => { renderer = create(<Harness />, { createNodeMock: element => element.type === "ScrollView" ? { scrollTo } : { measureInWindow: (cb: Function) => cb(0, 100, 360, 256) } }); });
  await act(() => renderer.root.findAllByType("View" as any).find(node => node.props.onLayout)!.props.onLayout());
}
const handle = (group: string) => renderer.root.findByProps({ accessibilityLabel: `Move ${group}` });
const scroll = () => renderer.root.findByType("ScrollView" as any);
const order = () => renderer.root.findByType(LearningGroups).props.groups;
async function start(group: string, pageY = 180) {
  expect(handle(group).props.onStartShouldSetPanResponder()).toBe(true);
  await act(() => handle(group).props.onPanResponderGrant({ nativeEvent: { pageY } }));
}
async function move(group: string, dy: number, moveY = 220) {
  await act(() => handle(group).props.onPanResponderMove({}, { dy, moveY }));
}

test("a handle previews a multi-row drag, saves only on drop and can move back up", async () => {
  await mount();
  await start("First");
  expect(scroll().props.scrollEnabled).toBe(false);
  await move("First", 192);
  expect(handle("First").props.accessibilityValue.now).toBe(4);
  expect(saved).toEqual([]);
  await act(() => handle("First").props.onPanResponderRelease());
  expect(order()).toEqual(["Second", "Third", "Fourth", "First", ...names.slice(4)]);
  expect(saved).toHaveLength(1);
  expect(scroll().props.scrollEnabled).toBe(true);
  await start("First");
  await move("First", -1000);
  await act(() => handle("First").props.onPanResponderRelease());
  expect(order()).toEqual(names);
  expect(announce).toHaveBeenCalledTimes(2);
});

test("interrupted drags and training locks never save a partial order", async () => {
  await mount();
  await start("Second");
  await move("Second", 128);
  await act(() => handle("Second").props.onPanResponderTerminate());
  expect(order()).toEqual(names);
  expect(scroll().props.scrollEnabled).toBe(true);
  await start("Second");
  await move("Second", 128);
  await act(() => setDisabled(true));
  await act(() => handle("Second").props.onPanResponderRelease());
  expect(handle("Second").props.onStartShouldSetPanResponder()).toBe(false);
  expect(saved).toEqual([]);
});

test("scroll offsets are included in the destination and screen readers can reorder", async () => {
  await mount();
  await act(() => scroll().props.onScroll({ nativeEvent: { contentOffset: { y: 64 } } }));
  await start("Second");
  await move("Second", 64);
  await act(() => scroll().props.onScroll({ nativeEvent: { contentOffset: { y: 192 } } }));
  expect(handle("Second").props.accessibilityValue.now).toBe(5);
  await act(() => handle("Second").props.onPanResponderRelease());
  expect(order()[4]).toBe("Second");
  await act(() => handle("Second").props.onAccessibilityAction({ nativeEvent: { actionName: "decrement" } }));
  expect(order()[3]).toBe("Second");
  await act(() => handle("First").props.onAccessibilityAction({ nativeEvent: { actionName: "decrement" } }));
  expect(saved).toHaveLength(2);
});

test("holding a dragged group at the bottom scrolls the list and stops after cancellation", async () => {
  await mount();
  await start("First");
  await move("First", 160, 355);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 160)); });
  expect(scrollTo).toHaveBeenCalled();
  expect(handle("First").props.accessibilityValue.now).toBeGreaterThan(3);
  await act(() => handle("First").props.onPanResponderTerminate());
  const calls = scrollTo.mock.calls.length;
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 70)); });
  expect(scrollTo.mock.calls.length).toBe(calls);
  expect(saved).toEqual([]);
});

test("holding a handle without moving does not scroll or change the order", async () => {
  await mount();
  await start("Fourth", 350);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });
  expect(scrollTo).not.toHaveBeenCalled();
  await act(() => handle("Fourth").props.onPanResponderRelease());
  expect(saved).toEqual([]);
  expect(scroll().props.scrollEnabled).toBe(true);
});

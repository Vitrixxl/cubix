/**
 * The coach's private notes on a student: a rich text editor kept as Markdown (underline as `++text++`). Bold,
 * italic, underline, strike, headings, lists, checklists, quotes and code, from the toolbar, the usual shortcuts
 * (Ctrl+B, Ctrl+U…) or by typing Markdown (`**bold**`, `# `, `- `, `[ ] `…). Saved a moment after typing stops and
 * when the editor is left.
 */
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { Bold, Code, Heading, Italic, List, ListChecks, ListOrdered, Quote, Strikethrough, Underline, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Tip } from "../ui";
import { coaching } from "./client";
import { cn } from "@/lib/utils";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";

/** How the notes read: Tailwind on the editor's own elements, there being no typography plugin. */
const PROSE = cn(
  "[&_.tiptap]:min-h-full [&_.tiptap]:px-3 [&_.tiptap]:py-2.5 [&_.tiptap]:leading-relaxed [&_.tiptap]:outline-none",
  "[&_.tiptap>*+*]:mt-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold",
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li>p]:my-0.5 [&_li::marker]:text-muted-foreground",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-primary/60 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_a]:text-primary [&_a]:underline [&_hr]:border-border",
  "[&_.task-item>label]:mt-[0.3rem] [&_.task-item>label>input]:accent-primary [&_.task-item>div]:flex-1",
  "[&_.task-item[data-checked=true]>div]:text-muted-foreground [&_.task-item[data-checked=true]>div]:line-through",
  "[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
);

/** The notes as kept: without the empty checklist items Markdown could not read back. */
const clean = (markdown: string) => markdown.replace(/^[ \t]*[-*] \[[ x]\][ \t]*$\n?/gm, "").trim();

type Tool = [label: string, keys: string, icon: LucideIcon, active: (e: Editor) => boolean, run: (e: Editor) => void];
const TOOLS: Tool[][] = [
  [
    ["Bold", "Ctrl+B", Bold, (e) => e.isActive("bold"), (e) => e.chain().focus().toggleBold().run()],
    ["Italic", "Ctrl+I", Italic, (e) => e.isActive("italic"), (e) => e.chain().focus().toggleItalic().run()],
    ["Underline", "Ctrl+U", Underline, (e) => e.isActive("underline"), (e) => e.chain().focus().toggleUnderline().run()],
    ["Strikethrough", "Ctrl+Shift+S", Strikethrough, (e) => e.isActive("strike"), (e) => e.chain().focus().toggleStrike().run()],
  ],
  [
    ["Heading", "## ", Heading, (e) => e.isActive("heading"), (e) => e.chain().focus().toggleHeading({ level: 2 }).run()],
    ["Bulleted list", "- ", List, (e) => e.isActive("bulletList"), (e) => e.chain().focus().toggleBulletList().run()],
    ["Numbered list", "1. ", ListOrdered, (e) => e.isActive("orderedList"), (e) => e.chain().focus().toggleOrderedList().run()],
    ["Checklist", "[ ] ", ListChecks, (e) => e.isActive("taskList"), (e) => e.chain().focus().toggleTaskList().run()],
  ],
  [
    ["Quote", "> ", Quote, (e) => e.isActive("blockquote"), (e) => e.chain().focus().toggleBlockquote().run()],
    ["Code", "`code`", Code, (e) => e.isActive("code"), (e) => e.chain().focus().toggleCode().run()],
  ],
];

/** The notes on the student of `conversation`, as the card that holds them; `className` sizes it. */
export function PrivateNotes({ conversation, note, className }: { conversation: number; note: string; className?: string }) {
  const saved = useRef(note),
    timer = useRef<ReturnType<typeof setTimeout>>(undefined),
    [state, setState] = useState<"saved" | "unsaved" | "saving">("saved");
  async function save(editor: Editor) {
    clearTimeout(timer.current);
    const markdown = clean(editor.getMarkdown());
    if (markdown === saved.current) return setState("saved");
    setState("saving");
    try {
      await coaching.saveNote(conversation, markdown);
      saved.current = markdown;
    } catch (e) {
      toast.error((e as Error).message);
    }
    setState(clean(editor.getMarkdown()) === saved.current ? "saved" : "unsaved");
  }
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TaskList.configure({ HTMLAttributes: { class: "list-none! pl-0.5!" } }),
      TaskItem.configure({ nested: true, HTMLAttributes: { class: "task-item flex items-start gap-2" } }),
      Markdown,
      Placeholder.configure({ placeholder: "Goals, weak points, homework…" }),
    ],
    content: note,
    contentType: "markdown",
    editorProps: { attributes: { "aria-label": "Private notes", "data-action": "student:note" } },
    onUpdate: ({ editor }) => {
      setState("unsaved");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(editor), 1500);
    },
    onBlur: ({ editor }) => void save(editor),
  });
  // Notes saved elsewhere (the student's file, the other panel) show here, unless they are being written here.
  useEffect(() => {
    if (!editor || editor.isFocused || note === saved.current) return;
    saved.current = note;
    editor.commands.setContent(note, { contentType: "markdown", emitUpdate: false });
  }, [editor, note]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border text-sm", className)} aria-label="Private notes" data-slot="private-notes">
      <div className="flex min-h-11 shrink-0 items-center justify-between gap-2 px-4 pt-1">
        <h3 className="font-medium">Private notes</h3>
        <span className="text-xs text-muted-foreground">{state === "saving" ? "Saving…" : state === "unsaved" ? "Unsaved" : "Only you see them"}</span>
      </div>
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className={cn(PROSE, "min-h-0 flex-1 cursor-text overflow-y-auto")} onClick={() => editor?.isFocused || editor?.commands.focus("end")} />
    </section>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({ editor, selector: ({ editor }) => TOOLS.flat().map(([, , , is]) => is(editor)) });
  let i = 0;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-y px-2 py-1" role="toolbar" aria-label="Formatting">
      {TOOLS.map((group, g) => (
        <div key={g} className="flex items-center gap-0.5">
          {g > 0 && <Separator orientation="vertical" className="mx-1 h-4!" />}
          {group.map(([label, keys, I, , run]) => {
            const on = active[i++];
            return (
              <Tip key={label} content={`${label} · ${keys}`}>
                <Toggle size="sm" className="px-1.5" pressed={on} onMouseDown={(e) => e.preventDefault()} onPressedChange={() => run(editor)} aria-label={label} data-action={"note:" + label.toLowerCase().replace(/ /g, "-")}>
                  <I />
                </Toggle>
              </Tip>
            );
          })}
        </div>
      ))}
    </div>
  );
}

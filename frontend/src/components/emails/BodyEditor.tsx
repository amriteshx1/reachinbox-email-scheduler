import type { ReactNode } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import "./compose-editor.css";

type Props = {
  value: string;
  onChange: (html: string) => void;
};

export function BodyEditor({ value, onChange }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2] },
        codeBlock: false,
      }),
      Placeholder.configure({ placeholder: "Body" }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "tiptap",
      },
    },
    onUpdate: ({ editor: next }) => {
      onChange(next.getHTML());
    },
  });

  if (!editor) {
    return (
      <div className="compose-body">
        <div className="mx-auto h-10 w-[272px] rounded-full bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)]" />
        <div className="mt-3 min-h-65" />
      </div>
    );
  }

  return (
    <div className="compose-body">
      <EditorToolbar editor={editor} />
      <div className="mt-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="mx-auto flex h-10 w-max items-center gap-3 rounded-full bg-white px-4 text-muted shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
      <ToolButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <ToolGlyph d="M7 8v8M7 8h4.5a2.5 2.5 0 0 1 0 5H7" />
      </ToolButton>
      <ToolButton
        label="Undo"
        active={false}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <ToolGlyph d="M4 12h6M14 12h6M8 8l-4 4 4 4M16 8l4 4-4 4" />
      </ToolButton>
      <ToolButton
        label="Heading"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <span className="text-xs font-semibold">Tt</span>
      </ToolButton>
      <ToolButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <span className="text-sm font-bold">B</span>
      </ToolButton>
      <ToolButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <span className="text-sm italic">I</span>
      </ToolButton>
      <ToolButton
        label="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="text-sm underline">U</span>
      </ToolButton>
      <ToolButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ToolGlyph d="M4 6h16M4 12h10M4 18h14" />
      </ToolButton>
      <ToolButton
        label="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <ToolGlyph d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
      </ToolButton>
      <ToolButton
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <ToolGlyph d="M8 8h12M8 16h12M4 8v8" />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex items-center justify-center ${
        active ? "text-brand" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ToolGlyph({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d={d} />
    </svg>
  );
}

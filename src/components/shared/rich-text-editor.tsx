"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import {
  Baseline,
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Type,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * What the academy asked for on top of the basics: "font size, H1 headings,
 * color highlights, font color, images options are nt there."
 */
const FONT_SIZES = [
  { label: "Small", value: "0.85rem" },
  { label: "Normal", value: "" },
  { label: "Large", value: "1.25rem" },
  { label: "Larger", value: "1.6rem" },
  { label: "Largest", value: "2rem" },
];

const TEXT_COLOURS = [
  { label: "Default", value: "" },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Green", value: "#16a34a" },
  { label: "Blue", value: "#2563eb" },
  { label: "Purple", value: "#7c3aed" },
  { label: "Grey", value: "#6b7280" },
];

const HIGHLIGHTS = [
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Orange", value: "#fed7aa" },
];

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  /** How tall the writing area may grow before it scrolls. */
  maxHeight?: string;
}

function ToolbarButton({
  icon: Icon,
  onClick,
  active,
  disabled,
  label,
}: {
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-40",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

/** A small menu of choices — sizes, colours — rather than five more buttons. */
function PickerMenu({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        title={label}
        className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 items-center justify-center rounded-md transition-colors"
      >
        <Icon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {children}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Toolbar({
  editor,
  onPickImage,
  uploading,
}: {
  editor: Editor;
  onPickImage: () => void;
  uploading: boolean;
}) {
  return (
    <div className="border-border/70 bg-muted/30 flex flex-wrap items-center gap-0.5 border-b p-1.5">
      <ToolbarButton label="Bold" icon={Bold} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton label="Italic" icon={Italic} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton label="Strikethrough" icon={Strikethrough} active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <span className="bg-border mx-1 h-5 w-px" />
      <ToolbarButton label="Heading 1" icon={Heading1} active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
      <ToolbarButton label="Heading 2" icon={Heading2} active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton label="Heading 3" icon={Heading3} active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
      <span className="bg-border mx-1 h-5 w-px" />
      <ToolbarButton label="Bullet list" icon={List} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarButton label="Numbered list" icon={ListOrdered} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolbarButton label="Quote" icon={Quote} active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <span className="bg-border mx-1 h-5 w-px" />

      <PickerMenu icon={Type} label="Text size">
        {FONT_SIZES.map((f) => (
          <DropdownMenuItem
            key={f.label}
            onClick={() =>
              f.value
                ? editor.chain().focus().setFontSize(f.value).run()
                : editor.chain().focus().unsetFontSize().run()
            }
          >
            <span style={f.value ? { fontSize: f.value } : undefined}>{f.label}</span>
          </DropdownMenuItem>
        ))}
      </PickerMenu>

      <PickerMenu icon={Baseline} label="Text colour">
        {TEXT_COLOURS.map((c) => (
          <DropdownMenuItem
            key={c.label}
            onClick={() =>
              c.value
                ? editor.chain().focus().setColor(c.value).run()
                : editor.chain().focus().unsetColor().run()
            }
          >
            <span
              className="size-3.5 rounded-full border"
              style={{ backgroundColor: c.value || "transparent" }}
            />
            {c.label}
          </DropdownMenuItem>
        ))}
      </PickerMenu>

      <PickerMenu icon={Highlighter} label="Highlight">
        {HIGHLIGHTS.map((h) => (
          <DropdownMenuItem
            key={h.label}
            onClick={() => editor.chain().focus().toggleHighlight({ color: h.value }).run()}
          >
            <span className="size-3.5 rounded border" style={{ backgroundColor: h.value }} />
            {h.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => editor.chain().focus().unsetHighlight().run()}>
          <RemoveFormatting className="size-3.5" /> None
        </DropdownMenuItem>
      </PickerMenu>

      <ToolbarButton
        label={uploading ? "Adding the image…" : "Add an image"}
        icon={uploading ? Loader2 : ImagePlus}
        disabled={uploading}
        onClick={onPickImage}
      />

      <span className="bg-border mx-1 h-5 w-px" />
      <ToolbarButton label="Undo" icon={Undo2} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
      <ToolbarButton label="Redo" icon={Redo2} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
    </div>
  );
}

/** Reusable TipTap rich-text editor. Emits HTML on change. SSR-safe. */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write something…",
  className,
  // A long reading — a whole anatomy chapter, say — used to stretch the box past
  // the bottom of the screen, taking Save with it: "content editor me scroller
  // lga do". The writing area now stops here and scrolls instead.
  maxHeight = "60vh",
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false, // required for Next SSR
    extensions: [
      StarterKit,
      // One package carries the colour and the size; highlight and image are
      // their own.
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          // `prose-blog` is the same stylesheet the published article uses, so
          // the editor shows what the post will look like.
          "prose-blog max-w-none min-h-[160px] px-4 py-3 text-[0.95rem] focus:outline-none",
          "[&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold",
          "[&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg",
          "[&_mark]:rounded [&_mark]:px-0.5",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        ),
        "data-placeholder": placeholder,
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  /**
   * Put an image in the text. It goes through the platform's own uploader, so
   * the picture is served from the academy's storage — pasting one in as
   * base64 would bloat every copy of the reading that is ever loaded.
   */
  async function addImage(file?: File) {
    if (!file || !editor) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message ?? "Upload failed.");
      }
      editor.chain().focus().setImage({ src: json.data.url as string }).run();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that image.");
    } finally {
      setUploading(false);
    }
  }

  /**
   * Follow the value when it is replaced from outside — opening a saved piece
   * for editing, say. Tiptap takes `content` once, on mount, so without this a
   * body that arrives after the first render never appears. Guarded on the
   * editor's own HTML so typing does not fight the sync.
   */
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  return (
    <div className={cn("border-input overflow-hidden rounded-lg border", className)}>
      {editor ? (
        <>
          {/* The toolbar stays put; only the text below it scrolls, so Bold
              and Undo are still reachable halfway down a long article. */}
          <Toolbar
            editor={editor}
            uploading={uploading}
            onPickImage={() => fileRef.current?.click()}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // so the same picture can be added twice
              void addImage(file);
            }}
          />
          <div className="overflow-y-auto" style={{ maxHeight }}>
            <EditorContent editor={editor} />
          </div>
        </>
      ) : (
        <div className="text-muted-foreground min-h-[200px] px-4 py-3 text-sm">
          Loading editor…
        </div>
      )}
    </div>
  );
}

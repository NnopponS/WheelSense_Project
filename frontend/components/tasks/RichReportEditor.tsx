"use client";

import { useEffect } from "react";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface RichReportEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minHeightClassName?: string;
  /** Larger typography and stronger list styling for formal report prose. */
  variant?: "default" | "formal";
}

export function RichReportEditor({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  minHeightClassName = "min-h-[120px]",
  variant = "default",
}: RichReportEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "",
      }),
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
    ],
    content: value || "<p></p>",
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          "prose dark:prose-invert max-w-none focus:outline-none px-3 py-2",
          variant === "formal"
            ? "prose-base sm:prose-lg [&_li]:leading-relaxed [&_li>p]:font-semibold [&_li>p]:text-foreground [&_ol>li>p]:font-semibold"
            : "prose-sm",
          minHeightClassName,
        ),
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor || disabled) return;
    const cur = editor.getHTML();
    if (value && value !== cur) {
      editor.commands.setContent(value, false);
    }
  }, [editor, value, disabled]);

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-xl border bg-muted/30 animate-pulse",
          minHeightClassName,
          className,
        )}
      />
    );
  }

  return (
    <div className={cn("rounded-xl border bg-background overflow-hidden", className)}>
      {!disabled ? (
        <div className="flex flex-wrap gap-1 border-b bg-muted/30 px-2 py-1">
          <Button
            type="button"
            variant={editor.isActive("bold") ? "secondary" : "ghost"}
            size="sm"
            className="h-11 w-11 p-0"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant={editor.isActive("italic") ? "secondary" : "ghost"}
            size="sm"
            className="h-11 w-11 p-0"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
            size="sm"
            className="h-11 w-11 p-0"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
            size="sm"
            className="h-11 w-11 p-0"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-5 w-5" />
          </Button>
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}

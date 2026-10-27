import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders letter Markdown. Raw HTML is not rendered (react-markdown's default), so it is safe. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-letter">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}

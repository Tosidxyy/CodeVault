import Markdown from 'react-markdown';

export function AnalysisMarkdown({ text }: { text: string }) {
  return <div className="markdown-preview"><Markdown skipHtml allowedElements={['h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'pre', 'blockquote', 'hr', 'br']} unwrapDisallowed>{text}</Markdown></div>;
}

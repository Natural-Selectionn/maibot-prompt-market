import { FileText } from "lucide-react";
import { templateFilesFor, type PromptItem } from "@/lib/prompts";

export function TemplateFileList({ item }: { item: PromptItem }) {
  const files = templateFilesFor(item);
  if (!files.some(file => file.name) && files.length <= 1) return null;
  const visibleFiles = files.slice(0, 3);
  const remaining = files.length - visibleFiles.length;
  return <span className="template-file-list">
    {files.length > 1 && <span className="template-file-count">共 {files.length} 个文件</span>}
    {visibleFiles.map((file, index) => {
      const name = file.name ? `${file.name}.prompt` : `提示词文件 ${index + 1}`;
      return (file.name || files.length > 1) && <span className="template-file" key={index}><FileText size={14}/><span className="template-file-info"><span className="template-file-label" title={name}>{name}</span>{file.locale && <small>{file.locale}</small>}</span></span>;
    })}
    {remaining > 0 && <span className="template-file-more">另有 {remaining} 个文件</span>}
  </span>;
}

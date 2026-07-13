// Extracts text from PDF/DOCX/TXT/MD files in the browser, returns image data URLs for images.
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";

// Use CDN worker to avoid bundler config
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjsLib as any).GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export type ParsedAttachment = {
  name: string;
  type: string;
  kind: "image" | "text";
  data: string; // image: data url, text: extracted text
  size: number;
};

const MAX_FILE_SIZE = 15 * 1024 * 1024;

export async function parseAttachment(file: File): Promise<ParsedAttachment> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`${file.name} exceeds 15MB limit`);
  }

  if (file.type.startsWith("image/")) {
    const data = await fileToDataUrl(file);
    return { name: file.name, type: file.type, kind: "image", data, size: file.size };
  }

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const text = await extractPdfText(file);
    return { name: file.name, type: "application/pdf", kind: "text", data: text, size: file.size };
  }

  if (
    file.name.toLowerCase().endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return { name: file.name, type: "docx", kind: "text", data: result.value, size: file.size };
  }

  // text-like fallback (txt, md, csv, json, code)
  const text = await file.text();
  return { name: file.name, type: file.type || "text/plain", kind: "text", data: text, size: file.size };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf = await (pdfjsLib as any).getDocument({ data: buf }).promise;
  const parts: string[] = [];
  const maxPages = Math.min(pdf.numPages, 50);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parts.push(content.items.map((it: any) => it.str).join(" "));
  }
  return parts.join("\n\n");
}

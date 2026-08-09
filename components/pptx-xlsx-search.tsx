import React, { useCallback, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AISearchChat from "@/components/ai-search-chat";
import JSZip from "jszip";
import { parseStringPromise } from "xml2js";
import * as XLSX from "xlsx";
import Tesseract from "tesseract.js";
import type { RagDocumentInput } from "@/lib/rag-types";

interface PPTXXLSXSearchProps {
  onBack?: () => void;
}

async function extractPptxTextForRag(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => Number(left.match(/slide(\d+)/)?.[1]) - Number(right.match(/slide(\d+)/)?.[1]));

  const slides: string[] = [];
  for (const [index, slideName] of slideNames.entries()) {
    const slideFile = zip.files[slideName];
    if (!slideFile) continue;
    const slide = await parseStringPromise(await slideFile.async("string"));
    const text: string[] = [];
    const collectText = (value: unknown): void => {
      if (typeof value === "string") text.push(value);
      else if (Array.isArray(value)) value.forEach(collectText);
      else if (value && typeof value === "object") Object.values(value).forEach(collectText);
    };
    collectText(slide["p:sld"]);
    if (text.join(" ").trim()) slides.push(`Slide ${index + 1}: ${text.join(" ")}`);
  }

  return slides.join("\n\n");
}

async function extractXlsxTextForRag(file: File): Promise<string> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return `Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet)}`;
  }).join("\n\n");
}

const PPTXXLSXSearch: React.FC<PPTXXLSXSearchProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      // Check for unsupported file formats
      const unsupported = Array.from(e.target.files).some(file => {
        const name = file.name.toLowerCase();
        return !(name.endsWith('.pptx') || name.endsWith('.xlsx'));
      });
      if (unsupported) {
        setError("Unsupported File Format");
        return;
      }
      setFiles(Array.from(e.target.files));
    }
  };

  const getRagDocuments = useCallback(async (): Promise<RagDocumentInput[]> => {
    const documents: RagDocumentInput[] = [];
    for (const file of files) {
      const extension = file.name.toLowerCase().split(".").pop();
      const content = extension === "pptx"
        ? await extractPptxTextForRag(file)
        : extension === "xlsx"
          ? await extractXlsxTextForRag(file)
          : "";
      if (content.trim()) {
        documents.push({
          id: `${file.name}-${file.lastModified}-${file.size}`,
          name: file.name,
          content,
        });
      }
    }
    return documents;
  }, [files]);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const pptxResults: any[] = [];
      const xlsxFiles: File[] = [];
      for (const file of files) {
        const fileName = file.name.toLowerCase();
        if (fileName.startsWith("~$")) {
          continue;
        }
        if (fileName.endsWith(".pptx")) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            // Extract text from slides
            const zip = await JSZip.loadAsync(arrayBuffer);
            let text = "";
            const slideRegex = /^ppt\/slides\/slide\d+\.xml$/;
            const slideFiles = Object.keys(zip.files).filter((name) => slideRegex.test(name));
            for (const slideName of slideFiles) {
              const slideXml = await zip.files[slideName].async("string");
              const slideObj = await parseStringPromise(slideXml);
              // Extract all text nodes
              const texts: string[] = [];
              function extractText(obj: any): void {
                if (typeof obj === "string") texts.push(obj);
                else if (typeof obj === "object")
                  for (const key in obj) extractText(obj[key]);
              }
              extractText(slideObj["p:sld"]);
              text += texts.join(" ") + "\n";
            }
            // Extract images and run OCR
            const images: string[] = [];
            let ocrText = "";
            const mediaFiles = Object.keys(zip.files).filter((name) => name.startsWith("ppt/media/"));
            for (const mediaName of mediaFiles) {
              const fileData = await zip.files[mediaName].async("base64");
              const ext = mediaName.split('.').pop()?.toLowerCase() || 'png';
              const dataUrl = `data:image/${ext};base64,${fileData}`;
              images.push(dataUrl);
              try {
                const result = await Tesseract.recognize(dataUrl, 'eng');
                if (result.data && result.data.text) {
                  ocrText += '\n' + result.data.text;
                }
              } catch (ocrErr) {
                console.warn('OCR failed for PPTX image', ocrErr);
              }
            }
            if (ocrText.trim().length > 0) {
              text += '\n' + ocrText;
            }
            // Search in combined text
            const regex = new RegExp(query, "i");
            if (regex.test(text)) {
              const matchIdx = text.search(regex);
              const snippet = text.substring(Math.max(0, matchIdx - 50), matchIdx + 50);
              pptxResults.push({ file: file.name, snippet });
            }
          } catch (pptxErr: any) {
            console.error('PPTX search error:', pptxErr);
            setError((prev) => (prev ? prev + '\n' : '') + `PPTX error in ${file.name}: ${pptxErr.message}`);
          }
        } else if (fileName.endsWith(".xlsx")) {
          xlsxFiles.push(file);
        }
      }
      // Handle XLSX files via API
      let xlsxResults: any[] = [];
      if (xlsxFiles.length > 0) {
      const formData = new FormData();
      formData.append("query", query);
        xlsxFiles.forEach((file) => {
        formData.append("files", file, file.name);
      });
      const res = await fetch("/api/search-pptx-xlsx", {
        method: "POST",
        body: formData,
      });
        if (res.ok) {
          const data = await res.json();
          xlsxResults = data.results || [];
        } else {
        const err = await res.json();
          setError((prev) => (prev ? prev + '\n' : '') + (err.error || "Unknown XLSX error"));
        }
      }
      setResults([...pptxResults, ...xlsxResults]);
    } catch (err: any) {
      setError(err.message || "Error searching files");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tabs defaultValue="search">
      <TabsList className="mb-4">
        <TabsTrigger value="search">Search</TabsTrigger>
        <TabsTrigger value="ai">AI Search</TabsTrigger>
      </TabsList>
      <TabsContent value="search">
        <div className="min-h-screen bg-background p-4">
          {onBack && (
            <div className="mb-4">
              <Button variant="ghost" size="sm" onClick={onBack}>
                 Back
              </Button>
            </div>
          )}
          <Card className="hover:shadow-lg transition-shadow flex flex-col h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <span role="img" aria-label="pptx-xlsx" className="text-purple-600 dark:text-purple-400 text-2xl">📊</span>
                </div>
                PPTX & XLSX Search
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
              <div>
                <p className="text-muted-foreground mb-3">
                  Search inside Microsoft PowerPoint and Excel files. Upload a folder of .pptx or .xlsx files and find content instantly. You can also ask questions in the AI tab.
                </p>
                <h4 className="font-medium mb-2">Supported Formats:</h4>
                <div className="flex flex-wrap gap-1 mb-2">
                  <Badge className="bg-purple-100 text-purple-800" variant="secondary">.pptx</Badge>
                  <Badge className="bg-green-100 text-green-800" variant="secondary">.xlsx</Badge>
                </div>
                <h4 className="font-medium mb-2">Features:</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Search inside individual slides and sheets</li>
                  <li>Upload and index entire folders</li>
                  <li>Extract and search text from charts and tables</li>
                  <li>Context snippets for matches</li>
                  <li>Fast, simple keyword search</li>
                </ul>
              </div>
              <div className="flex flex-col gap-2 mt-4">
                <div className="flex flex-col md:flex-row gap-2 items-center">
                  <input
                    type="file"
                    multiple
                    accept=".pptx,.xlsx"
                    onChange={handleFolderUpload}
                    className="mb-2 md:mb-0 md:mr-2 flex-1"
                    // @ts-ignore
                    webkitdirectory="true"
                    // @ts-ignore
                    directory="true"
                  />
                  <input
                    type="text"
                    placeholder="Search content..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    className="flex-1 border px-2 py-1 rounded"
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={loading || files.length === 0 || !query.trim()}
                    className="w-full md:w-auto"
                  >
                    {loading ? "Searching..." : "Search"}
                  </Button>
                </div>
                {error && <div className="text-red-600 font-bold text-center mb-2">{error}</div>}
                <div>
                  {results.length > 0 ? (
                    <ul>
                      {results.map((result, idx) => (
                        <li key={idx} className="mb-2 p-2 border rounded">
                          <div className="font-semibold">{result.file}</div>
                          <div className="text-xs text-gray-600 whitespace-pre-line">{result.snippet}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No results yet.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
      <TabsContent value="ai">
        <div className="h-[calc(100vh-300px)]">
          <AISearchChat getDocuments={getRagDocuments} hasDocuments={files.length > 0} />
        </div>
      </TabsContent>
    </Tabs>
  );
};

export default PPTXXLSXSearch;

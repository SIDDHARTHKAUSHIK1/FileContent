import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, ArrowLeft } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import Tesseract from "tesseract.js";
import { Badge } from "@/components/ui/badge";
import AISearchChat from "@/components/ai-search-chat";

// Use the local worker for offline support
if (typeof window !== "undefined" && "Worker" in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
}

interface PdfPage {
  fileName: string;
  pageNumber: number;
  text: string;
}

interface PdfSearchProps {
  onBack?: () => void;
}

const PdfSearch: React.FC<PdfSearchProps> = ({ onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [pdfPages, setPdfPages] = useState<PdfPage[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageImages, setPageImages] = useState<{ [key: string]: string[] }>({});

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const unsupported = Array.from(e.target.files).some(file => !file.name.toLowerCase().endsWith('.pdf'));
      if (unsupported) {
        setError("Unsupported File Format");
        return;
      }
      setFiles(Array.from(e.target.files));
      setError(null);
      setPdfPages([]);
      setResults([]);
      setLoading(true);
      setPageImages({});
      try {
        console.log("Starting PDF processing...");
        const allPages: PdfPage[] = [];
        const allImages: { [key: string]: string[] } = {};
        for (const file of Array.from(e.target.files)) {
          console.log(`Processing file: ${file.name}`);
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          for (let i = 1; i <= pdf.numPages; i++) {
            console.log(`Processing page ${i} of ${pdf.numPages} in file ${file.name}`);
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            let text = textContent.items.map((item: any) => item.str).join(" ");
            let ocrText = "";
            try {
              const viewport = page.getViewport({ scale: 2 });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                await page.render({ canvasContext: ctx, viewport }).promise;
                const dataUrl = canvas.toDataURL();
                try {
                  const result = await Tesseract.recognize(dataUrl, 'eng');
                  if (result.data && result.data.text) {
                    ocrText += '\n' + result.data.text;
                  }
                } catch (ocrErr) {
                  console.warn('OCR failed for full PDF page', ocrErr);
                }
              }
            } catch (ocrPageErr) {
              console.warn('Failed to render PDF page for OCR', ocrPageErr);
            }
            if (ocrText.trim().length > 0) {
              text += '\n' + ocrText;
            }
            allPages.push({ fileName: file.name, pageNumber: i, text });
          }
        }
        setPdfPages(allPages);
        setPageImages(allImages);
        console.log("PDF processing completed.");
      } catch (err: any) {
        console.error("Error during PDF processing:", err);
        setError("Failed to parse PDF(s): " + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSearch = () => {
    setError(null);
    setResults([]);
    if (!query.trim()) return;
    const q = query.trim().toLowerCase();
    const matches = pdfPages
      .map((page) => {
        const idx = page.text.toLowerCase().indexOf(q);
        if (idx !== -1) {
          const before = page.text.slice(Math.max(0, idx - 50), idx);
          const match = page.text.slice(idx, idx + q.length);
          const after = page.text.slice(idx + q.length, idx + q.length + 50);
          return {
            file: page.fileName,
            page: page.pageNumber,
            snippet: `${before}<mark>${match}</mark>${after}`,
            fullText: page.text,
          };
        }
        return null;
      })
      .filter(Boolean);
    setResults(matches);
  };

  const ragDocuments = pdfPages.map((page) => ({
    id: `${page.fileName}-${page.pageNumber}`,
    name: page.fileName,
    path: `Page ${page.pageNumber}`,
    content: page.text,
  }));

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-7xl">
        <Tabs defaultValue="search">
          <TabsList className="mb-4">
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-purple-500" />
              AI Search
            </TabsTrigger>
          </TabsList>
          <TabsContent value="search">
            {onBack && (
              <div className="mb-4">
                <Button variant="ghost" size="sm" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              </div>
            )}
            <Card className="hover:shadow-lg transition-shadow flex flex-col h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                    <span role="img" aria-label="pdf" className="text-red-600 dark:text-red-400 text-2xl">
                      📄
                    </span>
                  </div>
                  PDF Search
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-muted-foreground mb-3">
                    Upload PDF files or folders and search their content instantly.
                  </p>
                  <h4 className="font-medium mb-2">Supported Formats:</h4>
                  <div className="flex flex-wrap gap-1 mb-2">
                    <Badge className="bg-red-100 text-red-800" variant="secondary">.pdf</Badge>
                  </div>
                  <h4 className="font-medium mb-2">Features:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>OCR support for scanned PDFs</li>
                    <li>Accurate text and table extraction</li>
                    <li>Search document metadata</li>
                    <li>Analyze table of contents structure</li>
                    <li>Semantic search capabilities</li>
                  </ul>
                </div>
                <div className="flex flex-col gap-2 mt-4">
                  <div className="flex flex-col md:flex-row gap-2 items-center">
                    <input
                      type="file"
                      multiple
                      accept=".pdf"
                      onChange={handleFileUpload}
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
                      disabled={loading || pdfPages.length === 0}
                    />
                    <Button
                      onClick={handleSearch}
                      disabled={loading || pdfPages.length === 0 || !query.trim()}
                      className="w-full md:w-auto"
                    >
                      {loading ? "Processing..." : "Search"}
                    </Button>
                  </div>
                  {error && <div className="text-red-600 font-bold text-center mb-2">{error}</div>}
                  <div>
                    {results.length > 0 ? (
                      <ul>
                        {results.map((result, idx) => (
                          <li key={idx} className="mb-2 p-2 border rounded">
                            <div className="font-semibold">{result.file} <span className="text-xs text-gray-500">(Page {result.page})</span></div>
                            <div className="text-xs text-gray-600 whitespace-pre-line" dangerouslySetInnerHTML={{ __html: result.snippet }} />
                            {pageImages[`${result.file}-${result.page}`] && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {pageImages[`${result.file}-${result.page}`].map((img, i) => (
                                  <img key={i} src={img} alt={`Extracted from ${result.file} page ${result.page}`} style={{ maxWidth: 120, maxHeight: 120, border: '1px solid #ccc', borderRadius: 4 }} />
                                ))}
                              </div>
                            )}
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
          </TabsContent>
          <TabsContent value="ai">
            <div className="h-[calc(100vh-180px)]">
              <AISearchChat documents={ragDocuments} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PdfSearch;

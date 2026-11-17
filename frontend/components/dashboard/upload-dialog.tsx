"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  FileUp,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DocumentResponse, uploadDocument } from "@/lib/api";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (document: DocumentResponse) => void;
  defaultTopic?: string;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultTopic,
}: UploadDialogProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadedDoc, setUploadedDoc] = useState<DocumentResponse | null>(null);

  const resetState = useCallback(() => {
    setFile(null);
    setIsDragging(false);
    setUploadProgress(0);
    setStatus("idle");
    setErrorMessage(null);
    setUploadedDoc(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleClose = (newOpen: boolean) => {
    if (status === "uploading") {
      // Prevent accidental closing during in-flight upload
      return;
    }
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  const validateAndSelectFile = (selectedFile: File) => {
    setErrorMessage(null);

    // Validate extension and MIME
    const isPdfExt = selectedFile.name.toLowerCase().endsWith(".pdf");
    const isPdfMime =
      selectedFile.type === "application/pdf" || selectedFile.type === "";

    if (!isPdfExt || !isPdfMime) {
      setErrorMessage("Please select a valid PDF file (.pdf extension).");
      return;
    }

    // Validate size
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage(
        `File is too large (${formatFileSize(selectedFile.size)}). Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`
      );
      return;
    }

    if (selectedFile.size === 0) {
      setErrorMessage("Selected PDF file is empty (0 bytes).");
      return;
    }

    setFile(selectedFile);
    setStatus("idle");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSelectFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (status !== "uploading") {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (status === "uploading") return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSelectFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setStatus("uploading");
      setUploadProgress(0);
      setErrorMessage(null);

      const created = await uploadDocument(file, getToken, (percent) => {
        setUploadProgress(percent);
      });

      setUploadedDoc(created);
      setStatus("success");

      // Notify parent & dispatch global refresh event
      onSuccess?.(created);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("notemint:documents-changed", { detail: created })
        );
      }
    } catch (err: unknown) {
      setStatus("error");
      const message =
        err instanceof Error
          ? err.message
          : "Failed to upload PDF. Please check your connection and try again.";
      setErrorMessage(message);
    }
  };

  const handleOpenWorkspace = () => {
    if (uploadedDoc) {
      handleClose(false);
      router.push(`/dashboard/study/${uploadedDoc.id}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        {status === "success" && uploadedDoc ? (
          /* SUCCESS STATE */
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-primary">
              <CheckCircle2 className="size-8 stroke-[2.2]" />
            </div>

            <div className="flex flex-col gap-1.5">
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                Upload Complete
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Your study material is securely stored and ready in your workspace.
              </DialogDescription>
            </div>

            <div className="mt-2 flex w-full flex-col gap-2 rounded-xl border bg-muted/40 p-4 text-left">
              <div className="flex items-center gap-2.5">
                <FileText className="size-4 shrink-0 text-primary" />
                <span className="truncate text-sm font-semibold text-foreground">
                  {uploadedDoc.original_filename}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{formatFileSize(uploadedDoc.file_size_bytes)}</span>
                <span>•</span>
                <span className="capitalize">{uploadedDoc.status}</span>
                <span>•</span>
                <span>Ready for Phase 6 extraction</span>
              </div>
            </div>

            <DialogFooter className="mt-4 flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={resetState}
                className="w-full sm:w-auto"
              >
                Upload Another
              </Button>
              <Button
                size="sm"
                onClick={handleOpenWorkspace}
                className="w-full gap-1.5 sm:w-auto"
              >
                <span>Open Study Workspace</span>
                <ArrowRight className="size-3.5" />
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* UPLOAD / SELECT / PROGRESS STATE */
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-primary">
                <FileUp className="size-5" />
                <DialogTitle>Upload Your Study Material</DialogTitle>
              </div>
              <DialogDescription>
                {defaultTopic
                  ? `Upload a PDF for "${defaultTopic}" to create your personalized study workspace.`
                  : "Upload a PDF chapter, textbook, or lecture notes to create your study workspace."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-2">
              {/* Drag and Drop Box */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                  if (status !== "uploading") {
                    fileInputRef.current?.click();
                  }
                }}
                className={cn(
                  "group relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all",
                  isDragging
                    ? "border-primary bg-brand-soft/30 ring-4 ring-primary/10"
                    : "border-border/80 bg-card/40 hover:border-primary/50 hover:bg-card/70",
                  status === "uploading" && "pointer-events-none opacity-80"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  aria-label="Upload PDF file"
                  disabled={status === "uploading"}
                />

                <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary transition-transform group-hover:scale-105">
                  <UploadCloud className="size-6 stroke-[2]" />
                </div>

                <div className="mt-3 flex flex-col gap-1">
                  <p className="text-sm font-semibold text-foreground">
                    <span className="text-primary hover:underline">
                      Click to browse
                    </span>{" "}
                    or drag and drop your PDF
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF format only • Maximum file size {MAX_FILE_SIZE_MB} MB
                  </p>
                </div>
              </div>

              {/* Selected File Card */}
              {file && (
                <div className="flex items-center justify-between rounded-xl border bg-card p-3 shadow-2xs">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {file.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>

                  {status !== "uploading" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setErrorMessage(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Remove file"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              )}

              {/* Real Upload Progress Bar */}
              {status === "uploading" && (
                <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                      <span>Uploading to secure storage...</span>
                    </span>
                    <span className="font-mono font-semibold text-primary">
                      {uploadProgress}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error Message Alert */}
              {errorMessage && (
                <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
                  <div className="flex-1 leading-relaxed">
                    <p className="font-semibold">Upload failed</p>
                    <p className="mt-0.5 text-muted-foreground">{errorMessage}</p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="mt-2 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleClose(false)}
                disabled={status === "uploading"}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleUpload}
                disabled={!file || status === "uploading"}
                className="gap-1.5"
              >
                {status === "uploading" ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="size-3.5" />
                    <span>Upload Study PDF</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}


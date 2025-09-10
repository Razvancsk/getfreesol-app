import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Check } from "lucide-react";

interface ObjectUploaderProps {
  onUploadComplete?: (publicURL: string) => void;
  maxFileSize?: number;
  accept?: string;
  className?: string;
  disabled?: boolean;
  currentImageUrl?: string;
}

export function ObjectUploader({
  onUploadComplete,
  maxFileSize = 5 * 1024 * 1024, // 5MB default
  accept = "image/*",
  className = "",
  disabled = false,
  currentImageUrl
}: ObjectUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(async (file: File) => {
    if (file.size > maxFileSize) {
      setError(`File size must be less than ${Math.round(maxFileSize / (1024 * 1024))}MB`);
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Step 1: Get upload URL from backend
      const uploadResponse = await fetch('/api/objects/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadURL } = await uploadResponse.json();

      // Step 2: Upload file directly to cloud storage
      const uploadFileResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      });

      if (!uploadFileResponse.ok) {
        throw new Error('Failed to upload file');
      }

      // Step 3: Finalize upload and get public URL
      const finalizeResponse = await fetch('/api/objects/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadURL })
      });

      if (!finalizeResponse.ok) {
        throw new Error('Failed to finalize upload');
      }

      const { publicURL } = await finalizeResponse.json();
      
      setUploadedImageUrl(publicURL);
      onUploadComplete?.(publicURL);

    } catch (error) {
      console.error('Upload error:', error);
      setError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [maxFileSize, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled || isUploading) return;

    const files = Array.from(e.dataTransfer.files);
    const file = files[0];

    if (file && file.type.startsWith('image/')) {
      handleFileUpload(file);
    } else {
      setError('Please upload an image file');
    }
  }, [disabled, isUploading, handleFileUpload]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const currentImage = uploadedImageUrl || currentImageUrl;

  return (
    <div className="space-y-2">
      <div
        className={`
          relative border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer
          ${isDragging ? 'border-purple-400 bg-purple-50/10' : 'border-slate-600 hover:border-slate-500'}
          ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
          ${className}
        `}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !isUploading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || isUploading}
        />

        {currentImage ? (
          <div className="flex items-center justify-center space-x-4">
            <img 
              src={currentImage} 
              alt="Uploaded logo"
              className="w-16 h-16 rounded-lg object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="flex-1 text-center">
              <div className="text-green-400 mb-2 flex items-center justify-center space-x-2">
                <Check className="w-4 h-4" />
                <span className="text-sm">Image uploaded successfully</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled && !isUploading) fileInputRef.current?.click();
                }}
                disabled={disabled || isUploading}
              >
                Change Image
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="mx-auto w-12 h-12 mb-4 text-slate-400">
              <Upload className="w-full h-full" />
            </div>
            <div className="text-white mb-2">
              {isUploading ? 'Uploading...' : 'Select image or drag and drop it here'}
            </div>
            <div className="text-slate-400 text-sm">
              PNG, JPG, GIF up to {Math.round(maxFileSize / (1024 * 1024))}MB
            </div>
            {!isUploading && (
              <Button 
                type="button"
                variant="outline" 
                size="sm" 
                className="mt-3"
                disabled={disabled}
              >
                Select file
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="text-red-400 text-sm flex items-center space-x-2">
          <X className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Configuration
const TOTAL_FRAMES = 40;
const FRAME_PATH = "/frames/ezgif-frame-";
const FLASK_UPLOAD_URL = "http://localhost:5000/upload";
const FLASK_CHAT_URL = "http://localhost:5000/chat";
const ANIMATION_DURATION_MS = 4000; // Total animation duration in milliseconds
const FRAME_INTERVAL = ANIMATION_DURATION_MS / TOTAL_FRAMES;

export default function DocMindAutoPlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<HTMLImageElement[]>([]);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [animationComplete, setAnimationComplete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear error after 10 seconds
  useEffect(() => {
    if (uploadError) {
      const timer = setTimeout(() => setUploadError(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [uploadError]);

  // Generate frame paths
  const getFramePath = useCallback((index: number) => {
    const frameNumber = String(index + 1).padStart(3, "0");
    return `${FRAME_PATH}${frameNumber}.jpg`;
  }, []);

  // Preload all images
  useEffect(() => {
    const loadImages = async () => {
      const loadedImages: HTMLImageElement[] = [];
      let loadedCount = 0;

      const imagePromises = Array.from({ length: TOTAL_FRAMES }, (_, i) => {
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            loadedCount++;
            setLoadProgress((loadedCount / TOTAL_FRAMES) * 100);
            resolve(img);
          };
          img.onerror = reject;
          img.src = getFramePath(i);
        });
      });

      try {
        const results = await Promise.all(imagePromises);
        loadedImages.push(...results);
        setImages(loadedImages);
        setIsLoaded(true);
      } catch (error) {
        console.error("[DocMind] Error loading images:", error);
      }
    };

    loadImages();
  }, [getFramePath]);

  // Auto-play animation after images load
  useEffect(() => {
    if (!isLoaded || images.length === 0) return;

    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      if (frame >= TOTAL_FRAMES - 1) {
        setCurrentFrame(TOTAL_FRAMES - 1);
        setAnimationComplete(true);
        clearInterval(interval);
      } else {
        setCurrentFrame(frame);
      }
    }, FRAME_INTERVAL);

    return () => clearInterval(interval);
  }, [isLoaded, images.length]);

  // Draw frame on canvas whenever currentFrame changes
  useEffect(() => {
    if (!isLoaded || images.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = images[currentFrame];
    if (img) {
      // Set canvas dimensions to match image
      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      // Clear and draw
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    }
  }, [isLoaded, images, currentFrame]);

  // Calculate text opacity based on frame progress
  const progress = currentFrame / (TOTAL_FRAMES - 1);
  const heroOpacity = progress < 0.15 ? 1 : Math.max(0, 1 - (progress - 0.15) / 0.1);
  const section1Opacity = progress >= 0.2 && progress <= 0.5
    ? (progress < 0.3 ? (progress - 0.2) / 0.1 : progress > 0.4 ? 1 - (progress - 0.4) / 0.1 : 1)
    : 0;
  const section2Opacity = progress >= 0.5 && progress <= 0.8
    ? (progress < 0.6 ? (progress - 0.5) / 0.1 : progress > 0.7 ? 1 - (progress - 0.7) / 0.1 : 1)
    : 0;
  // Handle file upload
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log("[DocMind] Starting upload...");
    console.log("[DocMind] File:", file.name, "Size:", file.size, "Type:", file.type);
    console.log("[DocMind] Target URL:", FLASK_UPLOAD_URL);

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      console.log("[DocMind] Sending fetch request...");

      const response = await fetch(FLASK_UPLOAD_URL, {
        method: "POST",
        body: formData,
        redirect: "manual",
      });

      console.log("[DocMind] Response received:");
      console.log("[DocMind] - Status:", response.status);
      console.log("[DocMind] - Type:", response.type);

      // Flask returns a redirect, we need to follow it
      if (response.type === "opaqueredirect" || response.status === 302) {
        const location = response.headers.get("Location");
        console.log("[DocMind] Redirect detected, Location:", location);

        if (location) {
          window.location.href = location;
        } else {
          window.location.href = `${FLASK_CHAT_URL}`;
        }
      } else if (response.ok) {
        const data = await response.json();
        console.log("[DocMind] Success response data:", data);

        if (data.doc_id) {
          window.location.href = `${FLASK_CHAT_URL}/${data.doc_id}`;
        } else {
          setUploadError("Upload succeeded but no document ID returned.");
          setIsUploading(false);
        }
      } else {
        const errorText = await response.text();
        console.error("[DocMind] Upload failed:", response.status, errorText);
        setUploadError(`Upload failed: ${response.status} ${response.statusText}`);
        setIsUploading(false);
      }
    } catch (error) {
      console.error("[DocMind] ============ UPLOAD ERROR ============");
      console.error("[DocMind] Error:", error);

      if (error instanceof TypeError && error.message.includes("fetch")) {
        setUploadError("Cannot connect to backend. Make sure Flask server is running.");
        setIsUploading(false);
        return;
      }

      // Fallback form submission
      try {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = FLASK_UPLOAD_URL;
        form.enctype = "multipart/form-data";

        const input = document.createElement("input");
        input.type = "file";
        input.name = "file";
        input.files = event.target.files;
        form.appendChild(input);

        document.body.appendChild(form);
        form.submit();
      } catch (fallbackError) {
        console.error("[DocMind] Fallback failed:", fallbackError);
        setUploadError("Upload failed. Check browser console for details.");
        setIsUploading(false);
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      {/* Loading indicator */}
      {!isLoaded && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050505]">
          <div className="loading-progress-bar">
            <div
              className="loading-progress-fill"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
          <div className="loading-text">Loading experience</div>
        </div>
      )}

      {/* Error toast notification */}
      {uploadError && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-4 rounded-lg shadow-2xl max-w-lg text-center">
          <div className="font-semibold mb-1">Upload Error</div>
          <div className="text-sm opacity-90">{uploadError}</div>
          <button
            onClick={() => setUploadError(null)}
            className="mt-2 text-xs underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main container - no scroll needed */}
      <div className="fixed inset-0 bg-[#050505]">
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Canvas */}
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full object-contain"
            style={{ opacity: isLoaded ? 1 : 0 }}
          />

          {/* Hero text - start */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none"
            style={{ opacity: heroOpacity }}
          >
            <h1 className="text-6xl md:text-8xl font-bold text-white mb-4">DocMind</h1>
            <p className="text-xl md:text-2xl text-gray-300">Turn documents into decisions.</p>
          </motion.div>

          {/* Section 1 */}
          <motion.div
            className="absolute left-8 md:left-16 top-1/2 transform -translate-y-1/2 text-left pointer-events-none"
            style={{ opacity: section1Opacity }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-2">Documents are noisy.</h2>
            <p className="text-xl text-gray-300">Answers are buried.</p>
          </motion.div>

          {/* Section 2 */}
          <motion.div
            className="absolute right-8 md:right-16 top-1/2 transform -translate-y-1/2 text-right pointer-events-none"
            style={{ opacity: section2Opacity }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white">DocMind finds what matters.</h2>
          </motion.div>

          {/* CTA - Upload button (visible only after animation completes) */}
          <AnimatePresence>
            {animationComplete && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute bottom-20 md:bottom-32 left-1/2 transform -translate-x-1/2 text-center"
              >
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">One answer.</h2>
                <p className="text-lg text-gray-300 mb-8">Zero guesswork.</p>

                <label className="upload-label">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.docx,.txt,.csv,.md"
                    onChange={handleUpload}
                    className="hidden"
                    disabled={isUploading}
                  />
                  <button
                    type="button"
                    className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-full text-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 flex items-center gap-3 shadow-lg hover:shadow-xl"
                    onClick={triggerFileInput}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      "Uploading..."
                    ) : (
                      <>
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        Upload Document
                      </>
                    )}
                  </button>
                </label>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <footer className="absolute bottom-0 left-0 right-0 py-6">
          <div className="flex justify-center gap-8 text-gray-500 text-sm">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Processed locally</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>No cloud upload</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18" />
                <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
              </svg>
              <span>Designed for BFSI</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

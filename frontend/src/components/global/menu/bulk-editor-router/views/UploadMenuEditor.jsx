import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import useNotification from "@/store/hooks/useNotification";
import { FileUp, Loader2, CheckCircle2, AlertCircle, X, Image as ImageIcon } from "lucide-react";
import axios from "axios";
let pdfjsLib = null;
if (typeof window !== "undefined") {
    import("pdfjs-dist").then((lib) => {
        pdfjsLib = lib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    });
}

export default function UploadMenuEditor() {
    const { activeResId, activePlatform } = useSelector((state) => state.menu);
    const notification = useNotification();
    
    // UI States
    const [imagesToUpload, setImagesToUpload] = useState([]); // Array of { id, file, url }
    const [isProcessingLocalFiles, setIsProcessingLocalFiles] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState(null); // 'uploading', 'processing', 'completed', 'error'
    const [progress, setProgress] = useState(null);
    const [jobId, setJobId] = useState(null);

    // Polling logic
    useEffect(() => {
        let interval;
        if (uploadStatus === "processing" && jobId) {
            interval = setInterval(async () => {
                try {
                    const { data } = await axios.get(`/api/backend/menu/upload/${jobId}`);
                    if (data?.success && data?.data) {
                        const job = data.data;
                        if (job.status === "processing" || job.status === "queued") {
                            setUploadStatus("processing");
                            setProgress({
                                value: job.progress || 0,
                                step: job.step || "Initializing..."
                            });
                        } else if (job.status === "completed") {
                            setUploadStatus("completed");
                            clearInterval(interval);
                            notification.success("Menu parsing completed successfully!", { duration: 5000 });
                        } else if (job.status === "failed") {
                            setUploadStatus("error");
                            clearInterval(interval);
                            notification.error(job.error || "Menu parsing failed.", { duration: 5000 });
                        }
                    }
                } catch (error) {
                    console.error("Error fetching status:", error);
                }
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [uploadStatus, jobId, notification]);

    const processFiles = async (selectedFiles) => {
        setIsProcessingLocalFiles(true);
        const newImages = [];

        try {
            for (const file of selectedFiles) {
                if (file.type.startsWith("image/")) {
                    newImages.push({
                        id: Math.random().toString(36).substring(7),
                        file: file,
                        url: URL.createObjectURL(file)
                    });
                } else if (file.type === "application/pdf") {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    const numPages = pdf.numPages;

                    for (let i = 1; i <= numPages; i++) {
                        const page = await pdf.getPage(i);
                        const viewport = page.getViewport({ scale: 1.5 }); // High quality scale
                        
                        const canvas = document.createElement("canvas");
                        const ctx = canvas.getContext("2d");
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;

                        await page.render({ canvasContext: ctx, viewport }).promise;

                        // Convert canvas to blob
                        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
                        const imageFile = new File([blob], `page-${i}.jpg`, { type: "image/jpeg" });

                        newImages.push({
                            id: Math.random().toString(36).substring(7),
                            file: imageFile,
                            url: URL.createObjectURL(imageFile)
                        });
                    }
                }
            }
            
            if (newImages.length > 0) {
                setImagesToUpload(prev => [...prev, ...newImages]);
            }
        } catch (error) {
            console.error("Error processing local files:", error);
            notification.error("Failed to read the document. Ensure it is a valid PDF or Image.", { duration: 5000 });
        } finally {
            setIsProcessingLocalFiles(false);
        }
    };

    const handleFileChange = async (e) => {
        const selectedFiles = Array.from(e.target.files).filter(f => f.type === "application/pdf" || f.type.startsWith("image/"));
        if (selectedFiles.length < Array.from(e.target.files).length) {
            notification.error("Only PDF and Image files are supported.", { duration: 5000 });
        }
        await processFiles(selectedFiles);
        e.target.value = ""; // reset input
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf" || f.type.startsWith("image/"));
        if (droppedFiles.length < Array.from(e.dataTransfer.files).length) {
            notification.error("Only PDF and Image files are supported.", { duration: 5000 });
        }
        await processFiles(droppedFiles);
    };

    const handleRemoveImage = (idToRemove) => {
        setImagesToUpload(prev => prev.filter(img => img.id !== idToRemove));
    };

    const handleUpload = async () => {
        if (!imagesToUpload.length) return;
        if (!activeResId) {
            notification.error("Restaurant ID is missing.", { duration: 5000 });
            return;
        }

        setIsUploading(true);
        setUploadStatus("uploading");

        try {
            const formData = new FormData();
            formData.append("restaurant_id", activeResId);
            formData.append("platform", activePlatform || "zomato");
            imagesToUpload.forEach(img => formData.append("files", img.file));

            const { data } = await axios.post(`/api/backend/menu/upload`, formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });

            if (data.success && data.data?.job_id) {
                notification.success("Files uploaded. Processing started in background.", { duration: 5000 });
                setJobId(data.data.job_id);
                setUploadStatus("processing");
                setImagesToUpload([]); // Clear preview
            } else {
                throw new Error(data.message || "Upload failed");
            }
        } catch (error) {
            console.error("Upload error:", error);
            notification.error(error?.response?.data?.message || error.message || "Failed to queue files", { duration: 5000 });
            setUploadStatus("error");
        } finally {
            setIsUploading(false);
        }
    };



    return (
        <div className="flex-1 overflow-auto bg-gray-50/50 p-6 flex flex-col relative">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800">Upload Physical Menu</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Upload PDF or Images of your physical menu. Preview and cull the pages before sending them to the AI parser.
                </p>
            </div>

            {/* If we are actively processing the UI is locked to show progress */}
            {uploadStatus && uploadStatus !== "uploading" ? (
                <div className="w-full mx-auto mt-6 bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center text-center">
                    {uploadStatus === "processing" && (
                        <>
                            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                            <h3 className="text-lg font-bold text-gray-800">Extracting Menu Data...</h3>
                            <p className="text-sm text-gray-500 mt-1 mb-4">
                                Our AI is analyzing the menu pages. This might take a few minutes.
                            </p>
                            {progress && (
                                <div className="w-full max-w-md mt-4">
                                    <div className="flex justify-between text-xs font-semibold text-gray-600 mb-1">
                                        <span>{progress.step}</span>
                                        <span>{progress.value}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div 
                                            className="bg-primary h-2 rounded-full transition-all duration-500"
                                            style={{ width: `${progress.value}%` }}
                                        ></div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {uploadStatus === "completed" && (
                        <>
                            <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
                            <h3 className="text-lg font-bold text-gray-800">Extraction Complete!</h3>
                            <p className="text-sm text-gray-500 mt-1">
                                The items have been successfully extracted and merged into your active menu. 
                                Switch back to the Price Editor to review them.
                            </p>
                            <button 
                                onClick={() => setUploadStatus(null)} 
                                className="mt-6 px-4 py-2 border rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50"
                            >
                                Upload Another Menu
                            </button>
                        </>
                    )}

                    {uploadStatus === "error" && (
                        <>
                            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                            <h3 className="text-lg font-bold text-gray-800">Processing Failed</h3>
                            <p className="text-sm text-gray-500 mt-1">
                                An error occurred while queueing or parsing your files. Please try again.
                            </p>
                            <button 
                                onClick={() => setUploadStatus(null)} 
                                className="mt-6 px-4 py-2 border rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50"
                            >
                                Back to Upload
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <div className="flex flex-col flex-1 mx-auto w-full gap-6">
                    {/* Drag and Drop Zone */}
                    <div 
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        className={`w-full h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer relative transition-colors ${isProcessingLocalFiles ? "border-gray-200 bg-gray-50 opacity-75" : "border-gray-300 bg-white hover:bg-gray-50"}`}
                    >
                        <input 
                            type="file" 
                            multiple 
                            accept=".pdf, image/*" 
                            onChange={handleFileChange}
                            disabled={isProcessingLocalFiles || isUploading}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                        {isProcessingLocalFiles ? (
                            <>
                                <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
                                <p className="text-sm font-semibold text-gray-700">Converting PDF to Images...</p>
                            </>
                        ) : (
                            <>
                                <FileUp className="w-8 h-8 text-gray-400 mb-2" />
                                <p className="text-sm font-semibold text-gray-700">Drag and drop PDF or Images</p>
                            </>
                        )}
                    </div>

                    {/* Preview Grid */}
                    {imagesToUpload.length > 0 && (
                        <div className="w-full bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col flex-1">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-base font-bold text-gray-800">Pages to Process ({imagesToUpload.length})</h3>
                                    <p className="text-xs text-gray-500">Remove any unnecessary pages (e.g. covers, blank pages) before processing.</p>
                                </div>
                                <button
                                    onClick={handleUpload}
                                    disabled={isUploading}
                                    className="bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
                                >
                                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    {isUploading ? "Queueing..." : "Process Menu Pages"}
                                </button>
                            </div>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 overflow-y-auto pr-2 pb-2">
                                {imagesToUpload.map((img, index) => (
                                    <div key={img.id} className="group relative rounded-xl overflow-hidden border border-gray-200 shadow-sm aspect-[3/4] bg-gray-100 flex items-center justify-center">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={img.url} alt={`Page ${index + 1}`} className="w-full h-full object-cover" />
                                        
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-2">
                                            <button 
                                                onClick={() => handleRemoveImage(img.id)}
                                                className="bg-white text-red-600 p-1.5 rounded-full hover:bg-red-50 transition-colors shadow-sm"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                            <p className="text-white text-xs font-semibold truncate">Page {index + 1}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

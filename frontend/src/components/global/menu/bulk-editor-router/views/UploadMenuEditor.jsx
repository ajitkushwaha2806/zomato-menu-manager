import React, { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import useNotification from "@/store/hooks/useNotification";
import { insertFullCategory as dispatchInsertFullCategory } from "@/store/slice/menuSlice";
import { FileUp, Loader2, CheckCircle2, AlertCircle, X, Image as ImageIcon, Code2 } from "lucide-react";
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
    const dispatch = useDispatch();
    const notification = useNotification();
    
    // UI States
    const [inputType, setInputType] = useState("file"); // 'file', 'text', or 'json'
    const [jsonText, setJsonText] = useState("");
    const [jsonImportCount, setJsonImportCount] = useState(null);
    const [rawText, setRawText] = useState("");
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
        if (inputType === "file" && !imagesToUpload.length) return;
        if (inputType === "text" && !rawText.trim()) return;
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
            
            if (inputType === "file") {
                imagesToUpload.forEach(img => formData.append("files", img.file));
            } else {
                formData.append("raw_text", rawText);
            }

            const { data } = await axios.post(`/api/backend/menu/upload`, formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });

            if (data.success && data.data?.job_id) {
                notification.success("Menu uploaded. Processing started in background.", { duration: 5000 });
                setJobId(data.data.job_id);
                setUploadStatus("processing");
                setImagesToUpload([]); // Clear preview
                setRawText("");
            } else {
                throw new Error(data.message || "Upload failed");
            }
        } catch (error) {
            console.error("Upload error:", error);
            notification.error(error?.response?.data?.message || error.message || "Failed to queue menu", { duration: 5000 });
            setUploadStatus("error");
        } finally {
            setIsUploading(false);
        }
    };



    return (
        <div className="flex-1 overflow-auto bg-gray-50/50 p-6 flex flex-col relative">
            <div className="mb-6 flex justify-between items-start">
                <div>
                    <h2 className="text-xl font-bold text-gray-800">Upload Menu Data</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Upload PDF/Images or directly paste raw text of your physical menu to let our AI parse it.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <a
                        href="/jobs"
                        className="px-3.5 py-1.5 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5"
                    >
                        <span>View All Queues</span>
                        <span className="text-slate-400">→</span>
                    </a>
                    {!uploadStatus && (
                        <div className="flex bg-gray-200/50 p-1 rounded-lg border border-gray-200">
                            <button 
                                onClick={() => setInputType("file")}
                                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${inputType === "file" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                            >
                                Files
                            </button>
                            <button 
                                onClick={() => setInputType("text")}
                                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${inputType === "text" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                            >
                                Text
                            </button>
                            <button 
                                onClick={() => setInputType("json")}
                                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors flex items-center gap-1.5 ${inputType === "json" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                            >
                                <Code2 className="w-3.5 h-3.5" />
                                JSON
                            </button>
                        </div>
                    )}
                </div>
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
                    {inputType === "file" ? (
                        <>
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
                        </>
                    ) : inputType === "text" ? (
                        <div className="flex flex-col flex-1 h-full gap-4">
                            <textarea 
                                className="flex-1 w-full p-4 border border-gray-300 rounded-xl resize-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none bg-white text-sm"
                                placeholder="Paste your raw menu text here... Example:&#10;&#10;1. Margherita Pizza - $12&#10;2. Pepperoni Pizza - $15"
                                value={rawText}
                                onChange={(e) => setRawText(e.target.value)}
                                disabled={isUploading}
                            />
                            <div className="flex justify-end">
                                <button
                                    onClick={handleUpload}
                                    disabled={isUploading || !rawText.trim()}
                                    className="bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
                                >
                                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    {isUploading ? "Processing..." : "Process Text Menu"}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col flex-1 h-full gap-4 overflow-y-auto">
                            {/* Step 1: Copy Prompt */}
                            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">1</span>
                                        <h3 className="text-sm font-bold text-gray-800">Copy the AI Prompt</h3>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const prompt = `You are an expert restaurant menu parser. I will upload a restaurant menu (image or PDF).

Your task is to extract ALL items from the menu and return them as a JSON array of categories.

RULES:
1. Each category must have a "name" and a "sub_category" array.
2. Each sub_category must have a "name" and an "items" array.
3. If no clear sub-categories exist, set sub_category name same as category name.
4. Each item must have:
   - "name": Item name (proper title case, e.g. "Paneer Tikka" not "PANEER TIKKA")
   - "base_price": Number (e.g. 249). If item has variants, set base_price to the lowest variant price.
   - "description": Description if present, otherwise empty string ""
   - "is_veg": "VEG", "NON_VEG", or "EGG"
   - "variants": Array of variant groups. Only if the item has multiple sizes/portions.

5. VARIANT RULES:
   - Only create variants when an item has 2+ options (e.g. Half/Full, Small/Medium/Large, 2 Pcs/4 Pcs).
   - Each variant group must have "property_name" (e.g. "Portion", "Size") and "options" array.
   - Each option must have "name" and "price" (as number).
   - If an item has only ONE size (e.g. "6 Pcs 249"), do NOT create variants. Just put it in the item name like "Chicken Tikka - [6 Pcs]" with base_price 249.
   - For Momos: variants should only be based on pieces (2 pcs/4 pcs) or portion (half/full). Do NOT club fry/steam/tandoori as variants — keep them as separate items.

6. CATEGORY RULES:
   - Use categories exactly as printed on the menu.
   - If the menu lacks clear category headers (just a flat list), group the items into logical standard categories (e.g., "Starters", "Main Course", "Breads", "Beverages", "Desserts").
   - DO NOT group everything under a single generic category like "Menu" or "Food".
   - Never use item names as category names.
   - "Combo 1", "Combo 2" etc. are ITEMS under a "Combos" category, not separate categories.

7. Chaap items (Soya Chaap, Malai Chaap, Afghani Chaap) are always "VEG".
8. Never confuse item serial numbers, codes, or calorie counts with prices.
9. Preserve natural dish name order: "Shahi Paneer" not "Paneer Shahi", "Butter Chicken" not "Chicken Butter".

RETURN ONLY a valid JSON array. No explanation, no markdown. Example:

[
  {
    "name": "Starters",
    "sub_category": [
      {
        "name": "Veg Starters",
        "items": [
          {
            "name": "Paneer Tikka",
            "base_price": 249,
            "description": "Cottage cheese marinated in spices",
            "is_veg": "VEG",
            "variants": []
          },
          {
            "name": "Hara Bhara Kebab",
            "base_price": 120,
            "description": "",
            "is_veg": "VEG",
            "variants": [
              {
                "property_name": "Portion",
                "options": [
                  { "name": "Half", "price": 120 },
                  { "name": "Full", "price": 220 }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
]`;
                                            navigator.clipboard.writeText(prompt);
                                            notification.success("Prompt copied to clipboard!");
                                        }}
                                        className="px-3 py-1.5 text-xs font-bold rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors flex items-center gap-1.5"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                        Copy Prompt
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500">
                                    Click "Copy Prompt" to copy a pre-built prompt that tells Gemini exactly how to format the menu JSON. The prompt includes all rules for categories, items, variants, pricing, and veg/non-veg classification.
                                </p>
                            </div>

                            {/* Step 2: Open Gemini */}
                            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">2</span>
                                        <h3 className="text-sm font-bold text-gray-800">Upload menu to Gemini</h3>
                                    </div>
                                    <button
                                        onClick={() => window.open("https://gemini.google.com/app", "_blank")}
                                        className="px-3 py-1.5 text-xs font-bold rounded-lg border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                        Open Gemini
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    Paste the prompt in Gemini, upload your menu image/PDF, and let it generate the JSON. Then copy the JSON output.
                                </p>
                            </div>

                            {/* Step 3: Paste JSON */}
                            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col flex-1 gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">3</span>
                                    <h3 className="text-sm font-bold text-gray-800">Paste the JSON output</h3>
                                </div>
                                <textarea 
                                    className="flex-1 w-full p-3 border border-gray-300 rounded-xl resize-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none bg-gray-50 text-xs font-mono min-h-[120px]"
                                    placeholder="Paste the JSON output from Gemini here..."
                                    value={jsonText}
                                    onChange={(e) => setJsonText(e.target.value)}
                                />
                            {jsonImportCount !== null && (
                                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700 flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>Successfully imported <strong>{jsonImportCount.categories}</strong> categories with <strong>{jsonImportCount.items}</strong> items into your menu.</span>
                                </div>
                            )}
                            <div className="flex justify-end">
                                <button
                                    onClick={() => {
                                        if (!jsonText.trim()) {
                                            notification.error("Please paste JSON content first.");
                                            return;
                                        }

                                        try {
                                            let json = JSON.parse(jsonText);
                                            let categories = [];

                                            // Parse various JSON formats into a normalized category array
                                            if (Array.isArray(json)) {
                                                if (json.length > 0 && (json[0].sub_category || json[0].items)) {
                                                    // Already a category array
                                                    categories = json;
                                                } else {
                                                    // Flat items array — group by category
                                                    const catMap = {};
                                                    json.forEach((item) => {
                                                        const catName = item.category || "Uncategorized";
                                                        const subName = item.sub_category || catName;
                                                        if (!catMap[catName]) catMap[catName] = {};
                                                        if (!catMap[catName][subName]) catMap[catName][subName] = [];
                                                        catMap[catName][subName].push(item);
                                                    });
                                                    categories = Object.entries(catMap).map(([catName, subs]) => ({
                                                        name: catName,
                                                        sub_category: Object.entries(subs).map(([subName, items]) => ({
                                                            name: subName,
                                                            items: items
                                                        }))
                                                    }));
                                                }
                                            } else if (json.menu && Array.isArray(json.menu)) {
                                                categories = json.menu;
                                            } else if (json.categories && Array.isArray(json.categories)) {
                                                categories = json.categories;
                                            } else if (json.items && Array.isArray(json.items)) {
                                                // Flat items in an object
                                                const catMap = {};
                                                json.items.forEach((item) => {
                                                    const catName = item.category || "Uncategorized";
                                                    const subName = item.sub_category || catName;
                                                    if (!catMap[catName]) catMap[catName] = {};
                                                    if (!catMap[catName][subName]) catMap[catName][subName] = [];
                                                    catMap[catName][subName].push(item);
                                                });
                                                categories = Object.entries(catMap).map(([catName, subs]) => ({
                                                    name: catName,
                                                    sub_category: Object.entries(subs).map(([subName, items]) => ({
                                                        name: subName,
                                                        items: items
                                                    }))
                                                }));
                                            } else if (json.chain_outputs?.normalized_menu?.category) {
                                                categories = json.chain_outputs.normalized_menu.category;
                                            }

                                            if (categories.length === 0) {
                                                notification.error("No categories/items found in the JSON. Check the format.");
                                                return;
                                            }

                                            // Generate temp IDs for everything and insert into store
                                            let totalItems = 0;
                                            const genId = () => `temp-${crypto.randomUUID()}`;

                                            categories.forEach((cat) => {
                                                const mappedCat = {
                                                    ...cat,
                                                    id: genId(),
                                                    sub_category: (cat.sub_category || []).map((sub) => {
                                                        const mappedSub = {
                                                            ...sub,
                                                            id: genId(),
                                                            items: (sub.items || []).map((item) => {
                                                                totalItems++;
                                                                return {
                                                                    ...item,
                                                                    id: genId(),
                                                                    base_price: item.base_price ?? item.price ?? 0,
                                                                    is_veg: item.is_veg || "VEG",
                                                                    description: item.description || "",
                                                                    variants: (item.variants || []).map((v) => ({
                                                                        ...v,
                                                                        property_id: genId(),
                                                                        options: (v.options || []).map((opt) => ({
                                                                            ...opt,
                                                                            option_name: opt.option_name || opt.name || "",
                                                                            option_id: genId(),
                                                                            variant_id: genId(),
                                                                            price: opt.price ?? 0
                                                                        }))
                                                                    })),
                                                                    addons: item.addons || [],
                                                                    media: item.media || [],
                                                                    packing_charges: item.packing_charges ?? 0
                                                                };
                                                            })
                                                        };
                                                        return mappedSub;
                                                    })
                                                };
                                                dispatch(dispatchInsertFullCategory(mappedCat));
                                            });

                                            setJsonImportCount({ categories: categories.length, items: totalItems });
                                            notification.success(`Imported ${categories.length} categories with ${totalItems} items.`);
                                            setJsonText("");
                                        } catch (err) {
                                            console.error("JSON parse error:", err);
                                            notification.error("Invalid JSON. Please check the format and try again.");
                                        }
                                    }}
                                    disabled={!jsonText.trim()}
                                    className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
                                >
                                    <Code2 className="w-4 h-4" />
                                    Import JSON to Menu
                                </button>
                            </div>
                        </div>
                    </div>
                    )}
                </div>
            )}
        </div>
    );
}

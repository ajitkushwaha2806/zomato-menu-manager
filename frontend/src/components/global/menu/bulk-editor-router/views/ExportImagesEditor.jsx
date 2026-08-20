import { useState, useMemo } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import { Cloud, Loader2, ExternalLink, Image as ImageIcon, AlertCircle } from "lucide-react";
import useNotification from "@/store/hooks/useNotification";
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';

function ExportImagesContent({ allItems }) {
    const [isExporting, setIsExporting] = useState(false);
    const [driveLink, setDriveLink] = useState(null);
    const { activeResId } = useSelector((state) => state.menu);
    const notification = useNotification();

    const itemsWithImages = useMemo(() => {
        return allItems.filter(item => {
            const imgUrl = item?.media?.[0]?.url || item?.media?.[0]?.thumbUrl || item.image_url || (typeof item.image === 'string' ? item.image : item.image?.url);
            return !!imgUrl;
        });
    }, [allItems]);

    const performExport = async (accessToken) => {
        setIsExporting(true);
        setDriveLink(null);

        try {
            const { data } = await axios.post(`/api/menu/${activeResId}/bulk-editor/export-drive`, {
                accessToken,
                items: itemsWithImages.map(item => {
                    const imgUrl = item?.media?.[0]?.url || item?.media?.[0]?.thumbUrl || item.image_url || (typeof item.image === 'string' ? item.image : item.image?.url);
                    return {
                        id: item.id,
                        name: item.name,
                        url: imgUrl,
                        category: item._parentCategoryName,
                        subcategory: item._parentSubCategoryName
                    };
                })
            });

            if (data.success && data.link) {
                setDriveLink(data.link);
                notification.success("Export successful!");
            } else {
                throw new Error(data.message || "Failed to get drive link");
            }
        } catch (error) {
            console.error("Export to Drive failed:", error);
            notification.error(error?.response?.data?.message || error.message || "Failed to export images to Google Drive.");
        } finally {
            setIsExporting(false);
        }
    };

    const login = useGoogleLogin({
        onSuccess: (tokenResponse) => {
            performExport(tokenResponse.access_token);
        },
        onError: () => notification.error('Google Login Failed'),
        scope: 'https://www.googleapis.com/auth/drive.file'
    });

    const handleExportClick = () => {
        if (!activeResId) {
            notification.error("Restaurant ID is missing.");
            return;
        }
        if (itemsWithImages.length === 0) {
            notification.error("No images available to export.");
            return;
        }

        login(); // Trigger Google Login popup
    };

    return (
        <div className="flex-1 flex overflow-hidden relative bg-neutral-50/40">
            <div className="flex-1 overflow-y-auto p-6 transition-all duration-300 ease-in-out w-full">
                <div className="mx-auto space-y-6">
                    <div className="border-b border-neutral-200/60 pb-4">
                        <h2 className="text-xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
                            <Cloud className="w-6 h-6 text-primary" /> Export Images to Google Drive
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Securely transfer all your menu item images directly to a folder in your personal Google Drive.
                        </p>
                    </div>

                    <div className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
                        <div className="flex items-center gap-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
                            <div className="p-3 bg-primary/10 rounded-full text-primary">
                                <ImageIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-neutral-800">
                                    {itemsWithImages.length} Images Ready
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Out of {allItems.length} total items, {itemsWithImages.length} have images available for export.
                                </p>
                            </div>
                        </div>

                        {!driveLink ? (
                            <div className="flex flex-col gap-4">
                                <button
                                    onClick={handleExportClick}
                                    disabled={isExporting || itemsWithImages.length === 0}
                                    className="w-full flex items-center justify-center gap-3 bg-[#4285F4] hover:bg-[#3367D6] text-white py-3 px-4 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                                >
                                    {isExporting ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Uploading to your Google Drive...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5 bg-white rounded-full p-0.5" viewBox="0 0 48 48">
                                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                                                <path fill="none" d="M0 0h48v48H0z"></path>
                                            </svg>
                                            Sign in with Google to Export
                                        </>
                                    )}
                                </button>
                                {isExporting && (
                                    <p className="text-sm text-center text-muted-foreground animate-pulse">
                                        This might take a few minutes depending on the number of images. Please do not close this tab.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex gap-3 text-green-800">
                                    <div className="mt-0.5">
                                        <Cloud className="w-5 h-5 text-green-600" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold mb-1">Export Completed Successfully!</h4>
                                        <p className="text-sm text-green-700/80 mb-3">
                                            All {itemsWithImages.length} images have been uploaded to a new folder in your Google Drive.
                                        </p>
                                        <a
                                            href={driveLink}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-md border border-green-300 text-green-700 font-medium hover:bg-green-50 transition-colors shadow-sm"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                            Open Google Drive Folder
                                        </a>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setDriveLink(null)}
                                    className="text-sm text-muted-foreground hover:text-neutral-900 underline underline-offset-4"
                                >
                                    Start a new export
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3 text-blue-800">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-semibold mb-1">Secure Export</p>
                            <p className="text-blue-700/80">
                                By signing in with Google, you authorize this app to create a folder and upload images directly to your personal Google Drive, avoiding any strict storage quotas. The app will only have access to files it creates.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ExportImagesEditor({ allItems }) {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!clientId) {
        return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p>Google Client ID is missing. Please configure NEXT_PUBLIC_GOOGLE_CLIENT_ID in your .env file.</p>
            </div>
        );
    }

    return (
        <GoogleOAuthProvider clientId={clientId}>
            <ExportImagesContent allItems={allItems} />
        </GoogleOAuthProvider>
    );
}

import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useMenu } from "@/store/hooks/useMenu";
import { X, ExternalLink } from "lucide-react";

export default function PetpoojaHTMLModal() {
    const { petpoojaHtml, clearPetpoojaHtml } = useMenu();
    const iframeRef = useRef(null);

    useEffect(() => {
        if (petpoojaHtml && iframeRef.current) {
            const doc = iframeRef.current.contentWindow.document;
            doc.open();
            // Inject a base tag so relative CSS/JS from Petpooja load correctly
            const htmlWithBase = petpoojaHtml.replace(
                '<head>', 
                '<head><base href="https://menu.petpooja.com/" />'
            );
            // If there's no <head> tag, prepend it
            const finalHtml = htmlWithBase.includes('<base') 
                ? htmlWithBase 
                : `<head><base href="https://menu.petpooja.com/" /></head>${petpoojaHtml}`;
                
            doc.write(finalHtml);
            doc.close();
        }
    }, [petpoojaHtml]);

    if (!petpoojaHtml) return null;

    const handleOpenInNewTab = () => {
        const newWindow = window.open();
        newWindow.document.write(petpoojaHtml);
        newWindow.document.close();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden w-full max-w-7xl h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50/80">
                    <div className="flex flex-col">
                        <h2 className="text-xl font-semibold text-gray-900">Petpooja Menu Response</h2>
                        <p className="text-sm text-gray-500">Preview of the raw HTML received from the Petpooja dashboard.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={handleOpenInNewTab}
                        >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Open in new tab
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="hover:bg-red-50 text-gray-500 hover:text-red-600"
                            onClick={clearPetpoojaHtml}
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
                
                <div className="flex-1 bg-gray-100 overflow-hidden relative">
                    <iframe 
                        ref={iframeRef}
                        className="w-full h-full border-none bg-white"
                        title="Petpooja HTML"
                        sandbox="allow-same-origin allow-scripts"
                    />
                </div>
            </div>
        </div>
    );
}

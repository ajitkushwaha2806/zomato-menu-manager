"use client";

import React, { useState, useEffect } from "react";
import { Lock, Eye, EyeOff, KeyRound, ArrowRight, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CookieStorage from "@/services/cookie";

export default function AppPasswordGate({ children }) {
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [hasCheckedStatus, setHasCheckedStatus] = useState(false);
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        const unlocked = CookieStorage.isAppUnlocked();
        setIsUnlocked(unlocked);
        setHasCheckedStatus(true);
    }, []);

    const handleUnlock = async (e) => {
        if (e) e.preventDefault();
        if (!password.trim()) {
            setErrorMessage("Please enter the application password.");
            return;
        }

        setIsLoading(true);
        setErrorMessage("");

        try {
            const res = await fetch("/api/auth/verify-app-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: password.trim() }),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                setErrorMessage(data.message || "Incorrect password. Please try again.");
                setIsLoading(false);
                return;
            }

            CookieStorage.setAppUnlocked();
            setIsUnlocked(true);
        } catch (err) {
            console.error("Unlock error:", err);
            setErrorMessage("An unexpected error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    // Prevent screen flash while checking localStorage/cookie
    if (!hasCheckedStatus) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-7 w-7 animate-spin text-primary opacity-60" />
                </div>
            </div>
        );
    }

    if (!isUnlocked) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-background via-muted/30 to-background relative overflow-hidden select-none">
                {/* Subtle Ambient Background Gradients */}
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="w-full max-w-md z-10 animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-card/90 backdrop-blur-xl border border-border/70 rounded-3xl p-8 shadow-2xl space-y-6 relative">
                        {/* Lock Icon Header */}
                        <div className="flex flex-col items-center text-center space-y-3">
                            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                                <Lock className="h-7 w-7" />
                            </div>
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Protected Application
                            </div>
                            <h2 className="text-2xl font-bold tracking-tight text-foreground">
                                Enter Password
                            </h2>
                            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                                Enter the master password to access Menufy and manage connected outlets.
                            </p>
                        </div>

                        {/* Error Notification */}
                        {errorMessage && (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs animate-in fade-in duration-150">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span className="font-medium">{errorMessage}</span>
                            </div>
                        )}

                        {/* Password Form */}
                        <form onSubmit={handleUnlock} className="space-y-4">
                            <div className="space-y-2">
                                <div className="relative">
                                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value);
                                            if (errorMessage) setErrorMessage("");
                                        }}
                                        placeholder="Master password..."
                                        autoFocus
                                        className="pl-10 pr-10 h-12 rounded-xl text-sm bg-background/50 border-border/80 focus-visible:ring-primary shadow-xs"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                        title={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={isLoading || !password.trim()}
                                className="w-full h-12 rounded-xl text-sm font-semibold shadow-md bg-primary hover:bg-primary/90 text-primary-foreground transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Verifying...
                                    </>
                                ) : (
                                    <>
                                        Unlock Application
                                        <ArrowRight className="h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </form>

                        <div className="pt-2 border-t border-border/50 text-center">
                            <p className="text-[11px] text-muted-foreground/70">
                                Default master key is configured via <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">APP_PASSWORD</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return children;
}


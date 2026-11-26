"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Mail, Loader2, CheckCircle2, ShieldCheck, ArrowLeft, AlertCircle } from "lucide-react";
import useNotification from "@/store/hooks/useNotification";
import useUser from "@/store/hooks/useUser";

export default function PetpoojaUnlockModal({
    isOpen,
    onClose,
    restaurant,
    onSuccess,
    onSwitchToOther,
}) {
    const { user } = useUser();
    const notify = useNotification();
    const [authMode, setAuthMode] = useState("task"); // 'task' | 'otp'
    const [taskId, setTaskId] = useState("");
    const [isValidatingTask, setIsValidatingTask] = useState(false);
    const [taskError, setTaskError] = useState("");

    const [otpInput, setOtpInput] = useState("");
    const [otpSent, setOtpSent] = useState(false);
    const [isSendingOtp, setIsSendingOtp] = useState(false);
    const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
    const [otpError, setOtpError] = useState("");

    if (!restaurant) return null;

    const resId = String(restaurant.id || restaurant._id || "");
    const resName = restaurant.name || restaurant.restaurant_name || "Petpooja Restaurant";

    const handleSendOtp = async () => {
        setOtpError("");
        try {
            setIsSendingOtp(true);
            const res = await fetch(`/api/menu/${resId}/otp/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resName,
                    userName: user?.name || "Petpooja User",
                    userEmail: user?.email || "",
                }),
            });
            const data = await res.json();
            if (data.success) {
                setOtpSent(true);
                notify.success("OTP sent to vishalkushwaha@magicscale.in");
            } else {
                setOtpError(data.message || "Failed to send OTP.");
                notify.error(data.message || "Failed to send OTP.");
            }
        } catch (err) {
            console.error("Failed to send OTP:", err);
            setOtpError(err?.message || "Failed to send OTP.");
            notify.error(err?.message || "Failed to send OTP.");
        } finally {
            setIsSendingOtp(false);
        }
    };

    const handleVerifyOtp = async () => {
        setOtpError("");
        const cleanOtp = otpInput.trim();
        if (!cleanOtp) {
            setOtpError("Please enter the 6-digit OTP.");
            notify.error("Please enter the 6-digit OTP.");
            return;
        }

        try {
            setIsVerifyingOtp(true);
            const res = await fetch(`/api/menu/${resId}/otp/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    otp: cleanOtp,
                    resName,
                }),
            });
            const data = await res.json();
            if (data.success) {
                if (typeof window !== "undefined") {
                    localStorage.setItem(`otp_verified_${resId}`, "true");
                }
                notify.success("Petpooja outlet unlocked successfully!");
                onSuccess?.(resId);
                onClose?.();
            } else {
                const errMsg = data.message || "Invalid OTP. Please check and try again.";
                setOtpError(errMsg);
                notify.error(errMsg);
            }
        } catch (err) {
            console.error("Failed to verify OTP:", err);
            setOtpError(err?.message || "Failed to verify OTP.");
            notify.error(err?.message || "Failed to verify OTP.");
        } finally {
            setIsVerifyingOtp(false);
        }
    };

    const handleValidateTask = async () => {
        setTaskError("");
        const cleanTaskId = taskId.trim();
        if (!cleanTaskId) {
            setTaskError("Please enter a CRM Task ID.");
            notify.error("Please enter a CRM Task ID.");
            return;
        }

        try {
            setIsValidatingTask(true);
            const validationRes = await fetch(`/api/validate-task?taskId=${cleanTaskId}`);
            if (!validationRes.ok) {
                const errMsg = "Invalid Task ID: Unable to validate this task in CRM.";
                setTaskError(errMsg);
                notify.error(errMsg);
                return;
            }
            const result = await validationRes.json();
            if (!result.success || !result.data) {
                const errMsg = result.message || "Invalid Task ID: Not found in CRM.";
                setTaskError(errMsg);
                notify.error(errMsg);
                return;
            }

            const restIds = result.data.restIds || [];
            if (!result.isSecretKey && !result.data?.isSecretKey && !restIds.includes(resId) && !restIds.includes(Number(resId))) {
                const errMsg = `This Task ID is not assigned to restaurant #${resId}.`;
                setTaskError(errMsg);
                notify.error(errMsg);
                return;
            }

            // Persist verified state
            await fetch(`/api/menu/${resId}/otp/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    taskId: cleanTaskId,
                    resName,
                }),
            }).catch(() => {});

            if (typeof window !== "undefined") {
                localStorage.setItem(`otp_verified_${resId}`, "true");
                localStorage.setItem(`task_id_${resId}`, cleanTaskId);
            }

            notify.success("Task ID validated! Petpooja outlet unlocked.");
            onSuccess?.(resId);
            onClose?.();
        } catch (err) {
            console.error("Task ID validation error:", err);
            const errMsg = err?.message || "Failed to validate Task ID.";
            setTaskError(errMsg);
            notify.error(errMsg);
        } finally {
            setIsValidatingTask(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
            <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-200">
                {/* Header Banner */}
                <div className="bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 p-5 text-white">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl">
                                <Lock className="size-5 text-white" />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                                Petpooja Authorization
                            </span>
                        </div>
                        <span className="text-[11px] font-mono opacity-80">#{resId}</span>
                    </div>
                    <DialogTitle className="text-lg font-bold text-white leading-tight">
                        {resName}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-purple-100 mt-1">
                        Opening this Petpooja outlet requires authorization via CRM Task ID or Admin OTP to prevent unauthorized changes or triggers.
                    </DialogDescription>
                </div>

                <div className="p-5 space-y-4">
                    {/* Tab Switcher */}
                    <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                        <button
                            type="button"
                            onClick={() => setAuthMode("task")}
                            className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                                authMode === "task"
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-900"
                            }`}
                        >
                            CRM Task ID
                        </button>
                        <button
                            type="button"
                            onClick={() => setAuthMode("otp")}
                            className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                                authMode === "otp"
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-900"
                            }`}
                        >
                            Admin OTP
                        </button>
                    </div>

                    {/* Task ID Tab Content */}
                    {authMode === "task" ? (
                        <div className="space-y-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="petpoojaUnlockTaskId" className="text-xs font-semibold text-slate-700">
                                    CRM Task ID <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="petpoojaUnlockTaskId"
                                    placeholder="Enter CRM Task ID (e.g. 64f1...)"
                                    value={taskId}
                                    onChange={(e) => {
                                        setTaskId(e.target.value);
                                        setTaskError("");
                                    }}
                                    autoFocus
                                    className={`h-10 text-xs ${taskError ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleValidateTask();
                                    }}
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Enter the active CRM task assigned to restaurant ID #{resId}.
                                </p>
                            </div>

                            {taskError && (
                                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2 animate-in fade-in duration-200">
                                    <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-600" />
                                    <span className="leading-snug font-medium">{taskError}</span>
                                </div>
                            )}

                            <Button
                                type="button"
                                onClick={handleValidateTask}
                                disabled={!taskId.trim() || isValidatingTask}
                                className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
                            >
                                {isValidatingTask ? (
                                    <>
                                        <Loader2 className="mr-2 size-4 animate-spin" />
                                        Validating with CRM...
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="mr-2 size-4" />
                                        Verify & Open Outlet
                                    </>
                                )}
                            </Button>
                        </div>
                    ) : (
                        /* Admin OTP Tab Content */
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 text-xs leading-relaxed">
                                OTP will be emailed to:
                                <div className="font-semibold text-purple-900 mt-0.5 text-xs">
                                    vishalkushwaha@magicscale.in
                                </div>
                            </div>

                            {otpError && (
                                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2 animate-in fade-in duration-200">
                                    <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-600" />
                                    <span className="leading-snug font-medium">{otpError}</span>
                                </div>
                            )}

                            {!otpSent ? (
                                <Button
                                    type="button"
                                    onClick={handleSendOtp}
                                    disabled={isSendingOtp}
                                    className="w-full h-10 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold"
                                >
                                    {isSendingOtp ? (
                                        <>
                                            <Loader2 className="mr-2 size-4 animate-spin" />
                                            Sending OTP...
                                        </>
                                    ) : (
                                        <>
                                            <Mail className="mr-2 size-4" />
                                            Send OTP to Admin
                                        </>
                                    )}
                                </Button>
                            ) : (
                                <div className="space-y-3 animate-in fade-in duration-200">
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="petpoojaUnlockOtp" className="text-xs font-semibold text-slate-700">
                                            Enter 6-Digit OTP
                                        </Label>
                                        <Input
                                            id="petpoojaUnlockOtp"
                                            placeholder="000000"
                                            maxLength={6}
                                            value={otpInput}
                                            onChange={(e) => {
                                                setOtpInput(e.target.value.replace(/\D/g, ""));
                                                setOtpError("");
                                            }}
                                            className="text-center font-mono tracking-widest text-lg font-bold h-11"
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && otpInput.length === 6) handleVerifyOtp();
                                            }}
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={handleSendOtp}
                                            disabled={isSendingOtp}
                                            className="flex-1 h-9 text-xs"
                                        >
                                            {isSendingOtp ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                                            Resend
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={handleVerifyOtp}
                                            disabled={otpInput.length < 6 || isVerifyingOtp}
                                            className="flex-1 h-9 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                                        >
                                            {isVerifyingOtp ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                                            Verify & Open Outlet
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Bottom Action for switching back */}
                    {onSwitchToOther && (
                        <div className="pt-2 border-t border-slate-100 flex justify-center">
                            <button
                                type="button"
                                onClick={onSwitchToOther}
                                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <ArrowLeft className="size-3.5" />
                                Choose another restaurant
                            </button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}


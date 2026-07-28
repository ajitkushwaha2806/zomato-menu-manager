import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import api from "@/lib/api/axios";
import useNotification from "@/store/hooks/useNotification";

export default function SwiggyLoginPopover({ isOpen, onClose, onSuccess }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const notification = useNotification();

    const handleLogin = async (e) => {
        e.preventDefault();
        
        if (!username || !password) {
            notification.error("Please enter both username and password");
            return;
        }

        try {
            setIsLoading(true);
            const response = await api.post("/api/auth/swiggy/login", {
                username,
                password
            });

            if (response.data?.success) {
                notification.success("Successfully logged in to Swiggy!");
                onSuccess();
                onClose();
            } else {
                throw new Error("Login failed");
            }
        } catch (error) {
            console.error("Login error:", error);
            notification.error(
                error.response?.data?.message || "Failed to log in to Swiggy. Check credentials."
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Swiggy Authentication Required</DialogTitle>
                    <DialogDescription>
                        Please enter your Swiggy Partner credentials. These will be saved for future use.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleLogin} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="username">Username / Mobile / ID</Label>
                        <Input
                            id="username"
                            placeholder="e.g. 9876543210"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Logging in...
                                </>
                            ) : (
                                "Login to Swiggy"
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

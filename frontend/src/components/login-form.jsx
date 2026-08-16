"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Trash2, User, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import CookieStorage from "@/services/cookie";
import useNotification from "@/store/hooks/useNotification";

export function LoginForm({ className, ...props }) {
  const router = useRouter();
  
  // Zomato State
  const [zomatoAccounts, setZomatoAccounts] = useState([]);
  const [selectedZomatoName, setSelectedZomatoName] = useState("");
  const [newZomatoName, setNewZomatoName] = useState("");
  const [zomatoCookie, setZomatoCookie] = useState("");
  const [showZomatoForm, setShowZomatoForm] = useState(false);

  // Swiggy State
  const [swiggyAccounts, setSwiggyAccounts] = useState([]);
  const [selectedSwiggyName, setSelectedSwiggyName] = useState("");
  const [newSwiggyName, setNewSwiggyName] = useState("");
  const [swiggyUsername, setSwiggyUsername] = useState("");
  const [swiggyPassword, setSwiggyPassword] = useState("");
  const [showSwiggyForm, setShowSwiggyForm] = useState(false);
    // Petpooja State
    const [petpoojaAccounts, setPetpoojaAccounts] = useState([]);
    const [selectedPetpoojaName, setSelectedPetpoojaName] = useState("");
    const [newPetpoojaName, setNewPetpoojaName] = useState("");
    const [petpoojaCookie, setPetpoojaCookie] = useState("");
    const [showPetpoojaForm, setShowPetpoojaForm] = useState(false);

  const notify = useNotification();
  const [isLoading, setIsLoading] = useState(false);

  const fetchAccounts = async () => {
    try {
      const [zomRes, swigRes, petRes] = await Promise.all([
      fetch("/api/accounts/zomato"),
      fetch("/api/accounts/swiggy"),
      fetch("/api/accounts/petpooja")
    ]);

    const zomData = await zomRes.json();
    const swigData = await swigRes.json();
    const petData = await petRes.json();

    if (zomData.success) setZomatoAccounts(zomData.accounts);
    if (swigData.success) setSwiggyAccounts(swigData.accounts);
    if (petData.success) setPetpoojaAccounts(petData.accounts);
    } catch (e) {
      console.error("Failed to fetch accounts:", e);
    }
  };

  useEffect(() => {
    // If both are already set, redirect
    if (CookieStorage.has()) {
      router.replace("/");
    }
    fetchAccounts();
  }, [router]);

  const removeZomato = async (e, name) => {
    e.stopPropagation();
    try {
      await fetch(`/api/accounts/zomato?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      setZomatoAccounts(prev => prev.filter(a => a.name !== name));
      if (selectedZomatoName === name) setSelectedZomatoName("");
    } catch (e) {
      console.error("Failed to remove zomato account:", e);
    }
  };

  const removeSwiggy = async (e, name) => {
    e.stopPropagation();
    try {
      await fetch(`/api/accounts/swiggy?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      setSwiggyAccounts(prev => prev.filter(a => a.name !== name));
      if (selectedSwiggyName === name) setSelectedSwiggyName("");
    } catch (e) {
      console.error("Failed to remove swiggy account:", e);
    }
  };

  const [savingZomato, setSavingZomato] = useState(false);
  const handleSaveZomato = async () => {
    if (!newZomatoName || !zomatoCookie) return notify.error("Please provide Zomato name and cookie.");
    setSavingZomato(true);
    try {
      const res = await fetch("/api/accounts/zomato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newZomatoName.trim(), cookie: zomatoCookie.trim() })
      });
      if (!res.ok) throw new Error("Failed to save Zomato account");
      notify.success("Zomato account saved!");
      await fetchAccounts();
      setSelectedZomatoName(newZomatoName.trim());
      setShowZomatoForm(false);
      setNewZomatoName("");
      setZomatoCookie("");
    } catch (e) {
      notify.error(e.message || "Failed to save Zomato account.");
    } finally {
      setSavingZomato(false);
    }
  };

  const [savingPetpooja, setSavingPetpooja] = useState(false);
  const handleSavePetpooja = async () => {
    if (!newPetpoojaName || !petpoojaCookie) return notify.error("Please provide Petpooja name and cookie.");
    setSavingPetpooja(true);
    try {
      const res = await fetch("/api/accounts/petpooja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPetpoojaName.trim(), cookie: petpoojaCookie.trim() })
      });
      if (!res.ok) throw new Error("Failed to save Petpooja account");
      notify.success("Petpooja account saved!");
      await fetchAccounts();
      setSelectedPetpoojaName(newPetpoojaName.trim());
      setShowPetpoojaForm(false);
      setNewPetpoojaName("");
      setPetpoojaCookie("");
    } catch (e) {
      notify.error(e.message || "Failed to save Petpooja account.");
    } finally {
      setSavingPetpooja(false);
    }
  };

const handleSaveSwiggy = async () => {
    if (!newSwiggyName || !swiggyUsername || !swiggyPassword) return notify.error("Please provide Swiggy credentials.");
    setSavingSwiggy(true);
    try {
      const res = await fetch("/api/accounts/swiggy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: newSwiggyName.trim(), 
          username: swiggyUsername.trim(), 
          password: swiggyPassword.trim() 
        })
      });
      if (!res.ok) throw new Error("Failed to save Swiggy account");
      notify.success("Swiggy account saved!");
      await fetchAccounts();
      setSelectedSwiggyName(newSwiggyName.trim());
      setShowSwiggyForm(false);
      setNewSwiggyName("");
      setSwiggyUsername("");
      setSwiggyPassword("");
    } catch (e) {
      notify.error(e.message || "Failed to save Swiggy account.");
    } finally {
      setSavingSwiggy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (showZomatoForm || showSwiggyForm || showPetpoojaForm) {
      return notify.error("Please save your new accounts first.");
    }

    if (!selectedZomatoName) return notify.error("Please select a Zomato account.");
    if (!selectedSwiggyName) return notify.error("Please select a Swiggy account.");
    if (!selectedPetpoojaName) return notify.error("Please select a Petpooja account.");

    setIsLoading(true);

    try {
      const existingZ = zomatoAccounts.find(a => a.name === selectedZomatoName);
      if (!existingZ) throw new Error("Selected Zomato account not found.");

      const existingP = petpoojaAccounts.find(a => a.name === selectedPetpoojaName);
      if (!existingP) throw new Error("Selected Petpooja account not found.");

      CookieStorage.set(existingZ.cookie);
      CookieStorage.setSwiggyAccount(selectedSwiggyName);
      CookieStorage.setPetpoojaCookie(existingP.cookie);

      notify.success("Logged In Successfully ...!", { duration: 5000 });
      router.replace("/");
    } catch (e) {
      console.error("Login failed:", e);
      notify.error("Login failed, check console.");
      setIsLoading(false);
    }
  };

  const isFormValid = !showZomatoForm && !showSwiggyForm && !showPetpoojaForm && selectedZomatoName && selectedSwiggyName && selectedPetpoojaName;

  return (
    <div className={cn("relative flex w-full max-w-6xl mx-auto flex-col gap-6 p-6 md:p-10", className)} {...props}>
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold tracking-tight">Connect Your Accounts</h1>
        <p className="text-muted-foreground mt-2">Select or add your Zomato, Swiggy, and Petpooja accounts to continue.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        <div className="grid md:grid-cols-2 gap-6">
          {/* ZOMATO SECTION */}
          <Card className="relative overflow-hidden rounded-3xl border-red-500/20 bg-background/80 shadow-md">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-red-500" />
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="text-red-600 font-bold uppercase">Zomato</span>
                {!showZomatoForm && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowZomatoForm(true)} className="h-8 text-xs">
                    <Plus className="w-4 h-4 mr-1" /> Add New
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!showZomatoForm ? (
                <div className="space-y-3">
                  {zomatoAccounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No Zomato accounts found.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {zomatoAccounts.map(acc => (
                        <div
                          key={acc.name}
                          onClick={() => setSelectedZomatoName(acc.name)}
                          className={cn(
                            "group flex items-center justify-between border rounded-xl px-4 py-3 cursor-pointer transition-all",
                            selectedZomatoName === acc.name ? "border-red-500 bg-red-500/5 ring-1 ring-red-500" : "hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <User className={cn("w-4 h-4", selectedZomatoName === acc.name ? "text-red-500" : "text-muted-foreground")} />
                            <span className="text-sm font-medium">{acc.name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                            onClick={(e) => removeZomato(e, acc.name)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {zomatoAccounts.length === 0 && (
                    <Button type="button" variant="outline" className="w-full mt-2" onClick={() => setShowZomatoForm(true)}>
                      Add Zomato Account
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in zoom-in-95">
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Account Name</label>
                    <Input placeholder="e.g. Primary Zomato" value={newZomatoName} onChange={e => setNewZomatoName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Cookie Header</label>
                    <Textarea rows={4} placeholder="Paste cookie here..." value={zomatoCookie} onChange={e => setZomatoCookie(e.target.value)} className="resize-none font-mono text-xs" />
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    {zomatoAccounts.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowZomatoForm(false)}>Cancel</Button>
                    )}
                    <Button type="button" size="sm" onClick={handleSaveZomato} disabled={savingZomato}>
                      {savingZomato ? "Saving..." : "Save Account"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SWIGGY SECTION */}
          <Card className="relative overflow-hidden rounded-3xl border-orange-500/20 bg-background/80 shadow-md">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-orange-500" />
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="text-orange-600 font-bold uppercase">Swiggy</span>
                {!showSwiggyForm && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowSwiggyForm(true)} className="h-8 text-xs">
                    <Plus className="w-4 h-4 mr-1" /> Add New
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!showSwiggyForm ? (
                <div className="space-y-3">
                  {swiggyAccounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No Swiggy accounts found.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {swiggyAccounts.map(acc => (
                        <div
                          key={acc.name}
                          onClick={() => setSelectedSwiggyName(acc.name)}
                          className={cn(
                            "group flex items-center justify-between border rounded-xl px-4 py-3 cursor-pointer transition-all",
                            selectedSwiggyName === acc.name ? "border-orange-500 bg-orange-500/5 ring-1 ring-orange-500" : "hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <User className={cn("w-4 h-4", selectedSwiggyName === acc.name ? "text-orange-500" : "text-muted-foreground")} />
                            <span className="text-sm font-medium">{acc.name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                            onClick={(e) => removeSwiggy(e, acc.name)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {swiggyAccounts.length === 0 && (
                    <Button type="button" variant="outline" className="w-full mt-2" onClick={() => setShowSwiggyForm(true)}>
                      Add Swiggy Account
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in zoom-in-95">
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Account Name</label>
                    <Input placeholder="e.g. Primary Swiggy" value={newSwiggyName} onChange={e => setNewSwiggyName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Username</label>
                    <Input placeholder="Swiggy Username" value={swiggyUsername} onChange={e => setSwiggyUsername(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Password</label>
                    <Input type="password" placeholder="Swiggy Password" value={swiggyPassword} onChange={e => setSwiggyPassword(e.target.value)} />
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    {swiggyAccounts.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowSwiggyForm(false)}>Cancel</Button>
                    )}
                    <Button type="button" size="sm" onClick={handleSaveSwiggy} disabled={savingSwiggy}>
                      {savingSwiggy ? "Saving..." : "Save Account"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          {/* PETPOOJA SECTION */}
          <Card className="relative overflow-hidden rounded-3xl border-purple-500/20 bg-background/80 shadow-md">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-purple-500" />
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="text-purple-600 font-bold uppercase">Petpooja</span>
                {!showPetpoojaForm && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowPetpoojaForm(true)} className="h-8 text-xs">
                    <Plus className="w-4 h-4 mr-1" /> Add New
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!showPetpoojaForm ? (
                <div className="space-y-3">
                  {petpoojaAccounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No Petpooja accounts found.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {petpoojaAccounts.map(acc => (
                        <div key={acc.name} onClick={() => setSelectedPetpoojaName(acc.name)} className={cn(
                          "group flex items-center justify-between border rounded-xl px-4 py-3 cursor-pointer transition-all",
                          selectedPetpoojaName === acc.name ? "border-purple-500 bg-purple-500/5 ring-1 ring-purple-500" : "hover:bg-muted/50"
                        )}>
                          <div className="flex items-center gap-3">
                            <User className={cn("w-4 h-4", selectedPetpoojaName === acc.name ? "text-purple-500" : "text-muted-foreground")} />
                            <span className="text-sm font-medium">{acc.name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {petpoojaAccounts.length === 0 && (
                    <Button type="button" variant="outline" className="w-full mt-2" onClick={() => setShowPetpoojaForm(true)}>Add Petpooja Account</Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in zoom-in-95">
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Account Name</label>
                    <Input placeholder="e.g. Primary Petpooja" value={newPetpoojaName} onChange={e => setNewPetpoojaName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Cookie Header</label>
                    <Textarea rows={4} placeholder="Paste cookie here..." value={petpoojaCookie} onChange={e => setPetpoojaCookie(e.target.value)} className="resize-none font-mono text-xs" />
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    {petpoojaAccounts.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowPetpoojaForm(false)}>Cancel</Button>
                    )}
                    <Button type="button" size="sm" onClick={handleSavePetpooja} disabled={savingPetpooja}>{savingPetpooja ? "Saving..." : "Save Account"}</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center mt-2">
          <Button
            type="submit"
            size="lg"
            disabled={!isFormValid || isLoading}
            className="group h-14 w-full md:w-96 rounded-full text-base font-semibold shadow-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all"
          >
            {isLoading ? "Connecting..." : "Connect Session"}
            <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </form>
    </div>
  );
}
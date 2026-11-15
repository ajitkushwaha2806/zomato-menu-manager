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
  
  // Selection State: One selected account per platform (Zomato, Swiggy, Petpooja, Ownly)
  const [selectedAccounts, setSelectedAccounts] = useState({
    zomato: "",
    swiggy: "",
    petpooja: "",
    ownly: "",
  });

  const handleSelectAccount = (platform, name) => {
    setSelectedAccounts(prev => ({
      ...prev,
      [platform]: prev[platform] === name ? "" : name,
    }));
  };

  // Zomato State
  const [zomatoAccounts, setZomatoAccounts] = useState([]);
  const [newZomatoName, setNewZomatoName] = useState("");
  const [zomatoCookie, setZomatoCookie] = useState("");
  const [showZomatoForm, setShowZomatoForm] = useState(false);
  const [savingZomato, setSavingZomato] = useState(false);

  // Swiggy State
  const [swiggyAccounts, setSwiggyAccounts] = useState([]);
  const [newSwiggyName, setNewSwiggyName] = useState("");
  const [swiggyUsername, setSwiggyUsername] = useState("");
  const [swiggyPassword, setSwiggyPassword] = useState("");
  const [showSwiggyForm, setShowSwiggyForm] = useState(false);
  const [savingSwiggy, setSavingSwiggy] = useState(false);

  // Petpooja State
  const [petpoojaAccounts, setPetpoojaAccounts] = useState([]);
  const [newPetpoojaName, setNewPetpoojaName] = useState("");
  const [petpoojaCookie, setPetpoojaCookie] = useState("");
  const [showPetpoojaForm, setShowPetpoojaForm] = useState(false);
  const [savingPetpooja, setSavingPetpooja] = useState(false);

  // Ownly State
  const [ownlyAccounts, setOwnlyAccounts] = useState([]);
  const [newOwnlyName, setNewOwnlyName] = useState("");
  const [ownlyCookie, setOwnlyCookie] = useState("");
  const [showOwnlyForm, setShowOwnlyForm] = useState(false);
  const [savingOwnly, setSavingOwnly] = useState(false);

  const notify = useNotification();
  const [isLoading, setIsLoading] = useState(false);

  const fetchAccounts = async () => {
    try {
      const [zomRes, swigRes, petRes, ownlyRes] = await Promise.all([
        fetch("/api/accounts/zomato"),
        fetch("/api/accounts/swiggy"),
        fetch("/api/accounts/petpooja"),
        fetch("/api/accounts/ownly")
      ]);

      const zomData = await zomRes.json();
      const swigData = await swigRes.json();
      const petData = await petRes.json();
      const ownlyData = await ownlyRes.json();

      if (zomData.success) setZomatoAccounts(zomData.accounts);
      if (swigData.success) setSwiggyAccounts(swigData.accounts);
      if (petData.success) setPetpoojaAccounts(petData.accounts);
      if (ownlyData.success) setOwnlyAccounts(ownlyData.accounts);
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
      if (selectedAccounts.zomato === name) {
        setSelectedAccounts(prev => ({ ...prev, zomato: "" }));
      }
      notify.success("Zomato account deleted.");
    } catch (e) {
      console.error("Failed to remove zomato account:", e);
      notify.error("Failed to delete Zomato account.");
    }
  };

  const removeSwiggy = async (e, name) => {
    e.stopPropagation();
    try {
      await fetch(`/api/accounts/swiggy?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      setSwiggyAccounts(prev => prev.filter(a => a.name !== name));
      if (selectedAccounts.swiggy === name) {
        setSelectedAccounts(prev => ({ ...prev, swiggy: "" }));
      }
      notify.success("Swiggy account deleted.");
    } catch (e) {
      console.error("Failed to remove swiggy account:", e);
      notify.error("Failed to delete Swiggy account.");
    }
  };

  const removePetpooja = async (e, name) => {
    e.stopPropagation();
    try {
      await fetch(`/api/accounts/petpooja?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      setPetpoojaAccounts(prev => prev.filter(a => a.name !== name));
      if (selectedAccounts.petpooja === name) {
        setSelectedAccounts(prev => ({ ...prev, petpooja: "" }));
      }
      notify.success("Petpooja account deleted.");
    } catch (e) {
      console.error("Failed to remove petpooja account:", e);
      notify.error("Failed to delete Petpooja account.");
    }
  };

  const removeOwnly = async (e, name) => {
    e.stopPropagation();
    try {
      await fetch(`/api/accounts/ownly?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      setOwnlyAccounts(prev => prev.filter(a => a.name !== name));
      if (selectedAccounts.ownly === name) {
        setSelectedAccounts(prev => ({ ...prev, ownly: "" }));
      }
      notify.success("Ownly account deleted.");
    } catch (e) {
      console.error("Failed to remove ownly account:", e);
      notify.error("Failed to delete Ownly account.");
    }
  };

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
      handleSelectAccount("zomato", newZomatoName.trim());
      setShowZomatoForm(false);
      setNewZomatoName("");
      setZomatoCookie("");
    } catch (e) {
      notify.error(e.message || "Failed to save Zomato account.");
    } finally {
      setSavingZomato(false);
    }
  };

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
      handleSelectAccount("petpooja", newPetpoojaName.trim());
      setShowPetpoojaForm(false);
      setNewPetpoojaName("");
      setPetpoojaCookie("");
    } catch (e) {
      notify.error(e.message || "Failed to save Petpooja account.");
    } finally {
      setSavingPetpooja(false);
    }
  };

  const handleSaveOwnly = async () => {
    if (!newOwnlyName || !ownlyCookie) return notify.error("Please provide Ownly name and cookie.");
    setSavingOwnly(true);
    try {
      const res = await fetch("/api/accounts/ownly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOwnlyName.trim(), cookie: ownlyCookie.trim() })
      });
      if (!res.ok) throw new Error("Failed to save Ownly account");
      notify.success("Ownly account saved!");
      await fetchAccounts();
      handleSelectAccount("ownly", newOwnlyName.trim());
      setShowOwnlyForm(false);
      setNewOwnlyName("");
      setOwnlyCookie("");
    } catch (e) {
      notify.error(e.message || "Failed to save Ownly account.");
    } finally {
      setSavingOwnly(false);
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
      handleSelectAccount("swiggy", newSwiggyName.trim());
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

  const hasAtLeastOneSelected = Boolean(
    selectedAccounts.zomato ||
    selectedAccounts.swiggy ||
    selectedAccounts.petpooja ||
    selectedAccounts.ownly
  );

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (showZomatoForm || showSwiggyForm || showPetpoojaForm || showOwnlyForm) {
      return notify.error("Please save your new account first.");
    }

    if (!hasAtLeastOneSelected) {
      return notify.error("Please select at least one account to continue.");
    }

    setIsLoading(true);

    try {
      // Clear previous platform sessions to prevent mixing
      CookieStorage.clear();

      let firstSelectedPlatform = null;
      let firstAccountName = null;

      if (selectedAccounts.zomato) {
        const existingZ = zomatoAccounts.find(a => a.name === selectedAccounts.zomato);
        if (!existingZ) throw new Error("Selected Zomato account not found.");
        CookieStorage.set(existingZ.cookie);
        CookieStorage.setZomatoAccount(selectedAccounts.zomato);
        if (!firstSelectedPlatform) {
          firstSelectedPlatform = "zomato";
          firstAccountName = selectedAccounts.zomato;
        }
      }

      if (selectedAccounts.swiggy) {
        CookieStorage.setSwiggyAccount(selectedAccounts.swiggy);
        if (!firstSelectedPlatform) {
          firstSelectedPlatform = "swiggy";
          firstAccountName = selectedAccounts.swiggy;
        }
      }

      if (selectedAccounts.petpooja) {
        const existingP = petpoojaAccounts.find(a => a.name === selectedAccounts.petpooja);
        if (!existingP) throw new Error("Selected Petpooja account not found.");
        CookieStorage.setPetpoojaCookie(existingP.cookie);
        CookieStorage.setPetpoojaAccount(selectedAccounts.petpooja);
        if (!firstSelectedPlatform) {
          firstSelectedPlatform = "petpooja";
          firstAccountName = selectedAccounts.petpooja;
        }
      }

      if (selectedAccounts.ownly) {
        const existingO = ownlyAccounts.find(a => a.name === selectedAccounts.ownly);
        if (!existingO) throw new Error("Selected Ownly account not found.");
        CookieStorage.setOwnlyCookie(existingO.cookie);
        CookieStorage.setOwnlyAccount(selectedAccounts.ownly);
        if (!firstSelectedPlatform) {
          firstSelectedPlatform = "ownly";
          firstAccountName = selectedAccounts.ownly;
        }
      }

      if (firstSelectedPlatform) {
        CookieStorage.setActivePlatform(firstSelectedPlatform);
        CookieStorage.setAccountName(firstAccountName || "");
      }

      notify.success("Connected Accounts Successfully!", { duration: 5000 });
      router.replace("/");
    } catch (e) {
      console.error("Login failed:", e);
      notify.error(e.message || "Login failed, check console.");
      setIsLoading(false);
    }
  };

  const isFormValid =
    !showZomatoForm &&
    !showSwiggyForm &&
    !showPetpoojaForm &&
    !showOwnlyForm &&
    hasAtLeastOneSelected;

  return (
    <div className={cn("relative flex w-full max-w-6xl mx-auto flex-col gap-6 p-6 md:p-10", className)} {...props}>
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold tracking-tight">Connect Your Accounts</h1>
        <p className="text-muted-foreground mt-2">Select one account per platform (Zomato, Swiggy, Petpooja, Ownly) to continue.</p>
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
                          onClick={() => handleSelectAccount("zomato", acc.name)}
                          className={cn(
                            "group flex items-center justify-between border rounded-xl px-4 py-3 cursor-pointer transition-all",
                            selectedAccounts.zomato === acc.name ? "border-red-500 bg-red-500/5 ring-1 ring-red-500" : "hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <User className={cn("w-4 h-4", selectedAccounts.zomato === acc.name ? "text-red-500" : "text-muted-foreground")} />
                            <span className="text-sm font-medium">{acc.name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-all"
                            onClick={(e) => removeZomato(e, acc.name)}
                            title={`Delete ${acc.name}`}
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
                          onClick={() => handleSelectAccount("swiggy", acc.name)}
                          className={cn(
                            "group flex items-center justify-between border rounded-xl px-4 py-3 cursor-pointer transition-all",
                            selectedAccounts.swiggy === acc.name ? "border-orange-500 bg-orange-500/5 ring-1 ring-orange-500" : "hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <User className={cn("w-4 h-4", selectedAccounts.swiggy === acc.name ? "text-orange-500" : "text-muted-foreground")} />
                            <span className="text-sm font-medium">{acc.name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-all"
                            onClick={(e) => removeSwiggy(e, acc.name)}
                            title={`Delete ${acc.name}`}
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
                        <div key={acc.name} onClick={() => handleSelectAccount("petpooja", acc.name)} className={cn(
                          "group flex items-center justify-between border rounded-xl px-4 py-3 cursor-pointer transition-all",
                          selectedAccounts.petpooja === acc.name ? "border-purple-500 bg-purple-500/5 ring-1 ring-purple-500" : "hover:bg-muted/50"
                        )}>
                          <div className="flex items-center gap-3">
                            <User className={cn("w-4 h-4", selectedAccounts.petpooja === acc.name ? "text-purple-500" : "text-muted-foreground")} />
                            <span className="text-sm font-medium">{acc.name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-all"
                            onClick={(e) => removePetpooja(e, acc.name)}
                            title={`Delete ${acc.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
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

          {/* OWNLY SECTION */}
          <Card className="relative overflow-hidden rounded-3xl border-blue-500/20 bg-background/80 shadow-md">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-500" />
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="text-blue-600 font-bold uppercase">Ownly</span>
                {!showOwnlyForm && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowOwnlyForm(true)} className="h-8 text-xs">
                    <Plus className="w-4 h-4 mr-1" /> Add New
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!showOwnlyForm ? (
                <div className="space-y-3">
                  {ownlyAccounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No Ownly accounts found.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {ownlyAccounts.map(acc => (
                        <div
                          key={acc.name}
                          onClick={() => handleSelectAccount("ownly", acc.name)}
                          className={cn(
                            "group flex items-center justify-between border rounded-xl px-4 py-3 cursor-pointer transition-all",
                            selectedAccounts.ownly === acc.name ? "border-blue-500 bg-blue-500/5 ring-1 ring-blue-500" : "hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <User className={cn("w-4 h-4", selectedAccounts.ownly === acc.name ? "text-blue-500" : "text-muted-foreground")} />
                            <span className="text-sm font-medium">{acc.name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-all"
                            onClick={(e) => removeOwnly(e, acc.name)}
                            title={`Delete ${acc.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {ownlyAccounts.length === 0 && (
                    <Button type="button" variant="outline" className="w-full mt-2" onClick={() => setShowOwnlyForm(true)}>
                      Add Ownly Account
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in zoom-in-95">
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Account Name</label>
                    <Input placeholder="e.g. Primary Ownly" value={newOwnlyName} onChange={e => setNewOwnlyName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Cookie Header</label>
                    <Textarea rows={4} placeholder="Paste cookie here..." value={ownlyCookie} onChange={e => setOwnlyCookie(e.target.value)} className="resize-none font-mono text-xs" />
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    {ownlyAccounts.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowOwnlyForm(false)}>Cancel</Button>
                    )}
                    <Button type="button" size="sm" onClick={handleSaveOwnly} disabled={savingOwnly}>
                      {savingOwnly ? "Saving..." : "Save Account"}
                    </Button>
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
            {isLoading ? "Connecting..." : "Connect Selected Accounts"}
            <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </form>
    </div>
  );
}
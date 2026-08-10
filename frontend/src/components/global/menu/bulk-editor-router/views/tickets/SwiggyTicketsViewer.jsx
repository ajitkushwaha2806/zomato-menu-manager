"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useDispatch } from "react-redux";
import api from "@/lib/api/axios";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, TicketX, ListPlus } from "lucide-react";
import TicketCard from "./TicketCard";
import { addItem } from "@/store/slice/menuSlice";
import { toast } from "sonner";

export default function SwiggyTicketsViewer({ resId }) {
  const dispatch = useDispatch();
  const [activeTab, setActiveTab] = useState("REJECTED");
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState(new Set());

  const handleToggleSelect = useCallback((ticketId) => {
    setSelectedTicketIds(prev => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  }, []);

  const observerTarget = useRef(null);
  // Map of ticket_id → TicketCard imperative handle ref
  const cardRefs = useRef({});

  const fetchTickets = useCallback(
    async (token = null, isNewTab = false) => {
      if (loading) return;
      if (!isNewTab && !hasMore && !token) return;

      setLoading(true);
      try {
        const url = new URL(`/api/menu/${resId}/swiggy/items/ticket`, window.location.origin);
        url.searchParams.append("action", activeTab);
        if (token) url.searchParams.append("next_page_token", token);

        const { data } = await api.get(url.toString());

        if (data.success) {
          const fetchedTickets = data.data?.search_data?.item_tickets || [];
          const newNextToken = data.data?.pageable?.next_page_token;
          setTickets((prev) => (isNewTab ? fetchedTickets : [...prev, ...fetchedTickets]));
          setNextPageToken(newNextToken);
          setHasMore(!!newNextToken);
        } else {
          toast.error("Failed to fetch tickets");
        }
      } catch (error) {
        toast.error(error.response?.data?.message || "Failed to fetch tickets");
      } finally {
        setLoading(false);
      }
    },
    [activeTab, resId, hasMore]
  );

  useEffect(() => {
    setTickets([]);
    setNextPageToken(null);
    setHasMore(true);
    cardRefs.current = {};
    setSelectedTicketIds(new Set());
    fetchTickets(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, resId]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && nextPageToken) {
          fetchTickets(nextPageToken, false);
        }
      },
      { threshold: 0.1 }
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => { if (observerTarget.current) observer.unobserve(observerTarget.current); };
  }, [hasMore, loading, nextPageToken, fetchTickets]);

  const handleQueueAction = () => {
    setQueueing(true);
    let queued = 0;
    let skipped = 0;

    const ticketsToQueue = selectedTicketIds.size > 0 
      ? tickets.filter(t => selectedTicketIds.has(t.ticket_id))
      : tickets;

    for (const ticket of ticketsToQueue) {
      if (ticket.ticket_status !== "REJECTED") continue;
      const cardRef = cardRefs.current[ticket.ticket_id];
      if (!cardRef) continue;
      const payload = cardRef.getPayload?.();
      if (!payload) { skipped++; continue; }
      
      // ONLY queue items that were updated
      if (!payload.isUpdated) {
        skipped++;
        continue;
      }
      
      // Remove isUpdated flag before dispatching
      const { isUpdated, ...finalPayload } = payload;
      dispatch(addItem(finalPayload));
      queued++;
    }

    setQueueing(false);
    if (queued > 0) toast.success(`${queued} item${queued > 1 ? "s" : ""} queued successfully!`);
    if (skipped > 0) toast.warning(`${skipped} item${skipped > 1 ? "s" : ""} skipped (no subcategory selected or not updated).`);
    if (queued === 0 && skipped === 0) toast.info("No rejected items to queue.");
    
    setSelectedTicketIds(new Set());
  };

  return (
    <div className="flex-1 flex w-full flex-col h-full bg-background/50 backdrop-blur-xl border-x overflow-hidden">
      <div className="p-4 border-b bg-white/50 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">Swiggy Tickets</h2>
          {activeTab === "REJECTED" && tickets.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                  checked={tickets.filter(t => t.ticket_status === "REJECTED").length > 0 && selectedTicketIds.size === tickets.filter(t => t.ticket_status === "REJECTED").length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedTicketIds(new Set(tickets.filter(t => t.ticket_status === "REJECTED").map(t => t.ticket_id)));
                    } else {
                      setSelectedTicketIds(new Set());
                    }
                  }}
                />
                Select All
              </label>
              <button
                onClick={handleQueueAction}
                disabled={queueing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {queueing ? <Loader2 size={13} className="animate-spin" /> : <ListPlus size={13} />}
                {selectedTicketIds.size > 0 ? `Queue Selected (${selectedTicketIds.size})` : "Queue All Rejected"}
              </button>
            </div>
          )}
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
            <TabsTrigger value="PENDING_APPROVAL">Pending</TabsTrigger>
            <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4 relative">
        {tickets.length === 0 && !loading ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
            <TicketX className="w-12 h-12 text-gray-300" />
            <p>No tickets found for {activeTab.replace("_", " ")}.</p>
          </div>
        ) : (
          <div className="mx-auto space-y-4">
            {tickets.map((ticket, index) => (
              <TicketCard
                key={ticket.ticket_id || index}
                ticket={ticket}
                isSelected={selectedTicketIds.has(ticket.ticket_id)}
                onToggleSelect={() => handleToggleSelect(ticket.ticket_id)}
                ref={(el) => {
                  if (el) cardRefs.current[ticket.ticket_id] = el;
                  else delete cardRefs.current[ticket.ticket_id];
                }}
              />
            ))}

            <div ref={observerTarget} className="py-4 flex justify-center">
              {loading && (
                <div className="flex items-center gap-2 text-primary">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm font-medium">Loading tickets...</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import axios from "axios";

// In-memory cache for search results
// Key format: `${source}:${normalizedQuery}:${page}`
const searchCache = new Map();

// In-flight promises to avoid duplicate simultaneous requests
const inFlightMap = new Map();

// Maximum number of cached queries to keep in memory to prevent memory bloat
const MAX_CACHE_ENTRIES = 250;

// Cache expiration: 15 minutes
const CACHE_TTL_MS = 15 * 60 * 1000;

// Concurrency control for background prefetching
const MAX_CONCURRENT_REQUESTS = 2; // Polite concurrency to prevent network congestion or 429 rate limits
const DELAY_BETWEEN_REQUESTS_MS = 200; // Small delay between requests to keep the browser responsive

let activeRequests = 0;
const queue = [];
let isQueuePaused = false;
let currentTimerId = null;

// Normalize search query for consistent cache hits
export function normalizeQuery(query) {
    if (!query) return "";
    return query
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

export function getCacheKey(query, page = 1, source = "dataset", options = {}) {
    const resPart = options?.resIds ? `:${options.resIds}` : "";
    return `${source}:${normalizeQuery(query)}:${page}${resPart}`;
}

export function getCachedResult(query, page = 1, source = "dataset", options = {}) {
    const key = getCacheKey(query, page, source, options);
    const entry = searchCache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        searchCache.delete(key);
        return null;
    }

    return entry;
}

export function setCachedResult(query, page = 1, source = "dataset", data, hasMore, options = {}) {
    const key = getCacheKey(query, page, source, options);

    // Evict oldest entries if capacity is reached
    if (searchCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = searchCache.keys().next().value;
        if (oldestKey) searchCache.delete(oldestKey);
    }

    searchCache.set(key, {
        data: Array.isArray(data) ? data : [],
        hasMore: Boolean(hasMore),
        timestamp: Date.now()
    });
}

function getEndpoint(query, page = 1, source = "dataset", limit = 48, options = {}) {
    const encoded = encodeURIComponent(query.trim());
    if (source === "outlet" || source === "internal") {
        const resIdsPart = options?.resIds ? `&resIds=${encodeURIComponent(options.resIds)}` : "";
        return `/api/image/internal-search?q=${encoded}&page=${page}&limit=${limit}${resIdsPart}`;
    }
    if (source === "instagram") {
        return `/api/instagram/posts?q=${encoded}&page=${page}&limit=${limit}`;
    }
    if (source === "foodsnap") {
        return `/api/image/foodsnap-search?query=${encoded}&page=${page}&limit=${limit}`;
    }
    if (source === "swiggy") {
        return `/api/image/swiggy-search?q=${encoded}&page=${page}&limit=${limit}`;
    }
    return `/api/image/search?q=${encoded}&page=${page}&limit=${limit}`;
}

// Pre-warm browser image cache for top thumbnails without blocking execution
function prewarmThumbnails(images = []) {
    if (typeof window === "undefined") return;
    const topImages = images.slice(0, 3);
    topImages.forEach(img => {
        const url = img?.image_url || img?.url;
        if (url && typeof url === "string" && !url.startsWith("data:")) {
            const preloader = new Image();
            preloader.src = url;
        }
    });
}

// Process the request queue with polite concurrency and rate limiting
function processQueue() {
    if (isQueuePaused) return;
    if (activeRequests >= MAX_CONCURRENT_REQUESTS) return;
    if (queue.length === 0) return;

    // Sort queue: highest priority first
    queue.sort((a, b) => b.priority - a.priority);

    const task = queue.shift();
    if (!task) return;

    // Check if item was cached while sitting in queue
    const cached = getCachedResult(task.query, task.page, task.source, task.options);
    if (cached) {
        task.resolve({ ...cached, fromCache: true });
        // Immediately try next item
        processQueue();
        return;
    }

    activeRequests++;

    const endpoint = getEndpoint(task.query, task.page, task.source, task.limit, task.options);
    const inFlightKey = getCacheKey(task.query, task.page, task.source, task.options);

    const promise = axios
        .get(endpoint, { signal: task.abortController?.signal })
        .then(res => {
            if (res.data?.success) {
                const fetchedData = res.data.data || res.data.posts || [];
                const hasMore = Boolean(res.data.hasMore);
                setCachedResult(task.query, task.page, task.source, fetchedData, hasMore, task.options);

                // Silently preload top 3 image thumbnails in the browser
                prewarmThumbnails(fetchedData);

                task.resolve({ data: fetchedData, hasMore, fromCache: false });
            } else {
                task.resolve({ data: [], hasMore: false, fromCache: false });
            }
        })
        .catch(err => {
            if (axios.isCancel(err) || err.name === "CanceledError") {
                task.reject(err);
            } else {
                console.warn(`[ImageCache] Error fetching images for "${task.query}":`, err?.message || err);
                task.resolve({ data: [], hasMore: false, fromCache: false, error: err });
            }
        })
        .finally(() => {
            activeRequests--;
            inFlightMap.delete(inFlightKey);

            // Polite delay before starting next item to prevent network bombardment
            currentTimerId = setTimeout(() => {
                processQueue();
            }, DELAY_BETWEEN_REQUESTS_MS);
        });

    inFlightMap.set(inFlightKey, promise);
}

/**
 * Fetch image search results.
 * Returns cached result immediately (0ms delay) if available.
 * If in-flight, returns existing promise.
 * Otherwise, schedules execution with priority.
 * 
 * @param {string} query - Dish name or search string
 * @param {number} page - Page number (defaults to 1)
 * @param {string} source - 'dataset' | 'foodsnap' | 'swiggy'
 * @param {object} options - { urgent: boolean, priority: number }
 */
export function fetchImagesWithCache(query, page = 1, source = "dataset", options = {}) {
    if (!query || !query.trim()) {
        return Promise.resolve({ data: [], hasMore: false, fromCache: true });
    }

    const norm = normalizeQuery(query);
    if (norm.length < 2) {
        return Promise.resolve({ data: [], hasMore: false, fromCache: true });
    }

    // 1. Check in-memory cache
    const cached = getCachedResult(norm, page, source, options);
    if (cached) {
        return Promise.resolve({ ...cached, fromCache: true });
    }

    // 2. Check in-flight requests
    const inFlightKey = getCacheKey(norm, page, source, options);
    if (inFlightMap.has(inFlightKey)) {
        return inFlightMap.get(inFlightKey);
    }

    // 3. Check if already in queue: if urgent, bump priority to top
    const existingIndex = queue.findIndex(
        q => normalizeQuery(q.query) === norm && q.page === page && q.source === source && q.options?.resIds === options?.resIds
    );

    const isUrgent = options.urgent || false;
    const priority = options.priority !== undefined ? options.priority : isUrgent ? 100 : 10;

    if (existingIndex !== -1) {
        if (priority > queue[existingIndex].priority) {
            queue[existingIndex].priority = priority;
            queue.sort((a, b) => b.priority - a.priority);
        }
        return new Promise((resolve, reject) => {
            const originalResolve = queue[existingIndex].resolve;
            queue[existingIndex].resolve = (val) => {
                originalResolve(val);
                resolve(val);
            };
        });
    }

    // 4. Enqueue new task
    return new Promise((resolve, reject) => {
        const abortController = new AbortController();
        queue.push({
            query: norm,
            page,
            source,
            limit: options.limit || 48,
            priority,
            abortController,
            resolve,
            reject,
            options
        });

        // Trigger queue runner
        processQueue();
    });
}

/**
 * Intelligent background prefetcher.
 * Automatically scans dishes in the menu:
 * 1. Prioritizes items WITHOUT media first (user is most likely looking for photos for these!).
 * 2. Prioritizes items WITH media second.
 * 3. Enqueues requests smoothly in the background without freezing the UI or flooding network.
 */
let currentPrefetchToken = 0;

export function startMenuImagePrefetch(allItems = [], source = "dataset") {
    if (!Array.isArray(allItems) || allItems.length === 0) return;

    currentPrefetchToken++;
    const token = currentPrefetchToken;
    isQueuePaused = false;

    // Filter distinct item names
    const seenNames = new Set();
    const noMediaItems = [];
    const hasMediaItems = [];

    allItems.forEach(item => {
        if (!item?.name) return;
        const norm = normalizeQuery(item.name);
        if (norm.length < 2 || seenNames.has(norm)) return;
        seenNames.add(norm);

        const hasMedia = Array.isArray(item.media) && item.media.length > 0;
        if (!hasMedia) {
            noMediaItems.push(item.name);
        } else {
            hasMediaItems.push(item.name);
        }
    });

    // Schedule: missing image items first (priority 50), existing image items next (priority 10)
    // We limit background queue to top 60 dishes to be light on memory and network
    const priorityItems = [...noMediaItems, ...hasMediaItems].slice(0, 60);

    // Stagger enqueueing slightly so initial UI render finishes cleanly
    setTimeout(() => {
        if (token !== currentPrefetchToken) return;

        priorityItems.forEach((dishName, idx) => {
            const isNoMedia = noMediaItems.includes(dishName);
            // Decrement priority slightly as list progresses so earlier items fetch first
            const priority = isNoMedia ? 50 - Math.min(30, idx) : 20 - Math.min(15, idx);

            fetchImagesWithCache(dishName, 1, source, {
                urgent: false,
                priority
            }).catch(() => {});
        });
    }, 300);
}

/**
 * Prefetch an individual item (e.g. on mouse hover)
 * Immediately jumps to urgent priority so it starts loading before the user even clicks!
 */
export function prefetchDishOnHover(dishName, source = "dataset") {
    if (!dishName) return;
    fetchImagesWithCache(dishName, 1, source, { urgent: true, priority: 90 }).catch(() => {});
}

/**
 * Pause background processing (e.g. when user navigates away from Image Editor)
 */
export function pausePrefetchQueue() {
    isQueuePaused = true;
    if (currentTimerId) {
        clearTimeout(currentTimerId);
        currentTimerId = null;
    }
}

/**
 * Resume background processing
 */
export function resumePrefetchQueue() {
    isQueuePaused = false;
    processQueue();
}

/**
 * Clear queue of non-urgent background tasks
 */
export function clearPrefetchQueue() {
    // Only keep urgent tasks
    const urgentTasks = queue.filter(q => q.priority >= 90);
    queue.length = 0;
    queue.push(...urgentTasks);
}


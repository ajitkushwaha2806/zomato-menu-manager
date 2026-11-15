// Helper: Levenshtein distance
export const levenshteinDistance = (s1, s2) => {
    const m = s1.length;
    const n = s2.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (s1[i - 1] === s2[j - 1]) dp[i][j] = dp[i - 1][j - 1];
            else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
};

export const normalizeTitle = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str
        .toLowerCase()
        .trim()
        .replace(/['"’]/g, '')
        .replace(/[^a-z0-9]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

export const cleanTitle = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/\s*\[[^\]]*\]/g, '')
        .trim();
};

export const cleanDriveFileName = (fileName) => {
    if (!fileName || typeof fileName !== 'string') return '';
    // Strip extension
    let name = fileName.replace(/\.[^/.]+$/, '');
    // Strip camera or numeric prefixes like 01_, 1., IMG_1234_, DSC_
    name = name.replace(/^(\d+[\s._-]+)+/i, '');
    name = name.replace(/^(IMG|DSC|PXL|PHOTO|PIC|IMAGE|WP|FILE)[\s._-]*\d*[\s._-]*/i, '');
    // Strip trailing qualifiers like _final, -hd, _copy, (1), -2, _2
    name = name.replace(/[\s._-]*(final|edit|edited|hd|4k|raw|web|compressed|copy|\(\d+\)|[_\-]\d+)$/i, '');
    return name.trim();
};

const singularize = (word) => {
    if (!word) return '';
    let w = word.toLowerCase().trim().replace(/['"’]/g, "");
    if (w === "alu") return "aloo";
    if (w === "shyapta") return "shapta";
    if (w === "chow") return "chowmein";
    if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.endsWith('es') && !w.endsWith('ses') && !w.endsWith('ches') && !w.endsWith('shes')) return w.slice(0, -2);
    if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
};

// Check for cross-contamination of conflicting food categories
const hasFoodConflict = (itemTokens, fileTokens, isVeg) => {
    const nonVegKeywords = ['chicken', 'mutton', 'fish', 'prawn', 'egg', 'pork', 'beef', 'lamb', 'shrimp', 'crab'];
    const vegKeywords = ['veg', 'paneer', 'mushroom', 'soya', 'tofu', 'dal', 'aloo', 'gobi'];

    // 1. If dish is marked Veg or explicitly has 'veg', file must not be non-veg
    if (isVeg === 'VEG' || itemTokens.includes('veg')) {
        if (fileTokens.some(t => nonVegKeywords.includes(t))) return true;
    }

    // 2. Paneer should never match chicken/mutton/fish
    if (itemTokens.includes('paneer') && fileTokens.some(t => ['chicken', 'mutton', 'fish', 'prawn', 'egg'].includes(t))) {
        return true;
    }

    // 3. Chicken should not match paneer, mutton, fish, or strictly veg dishes
    if (itemTokens.includes('chicken') && fileTokens.some(t => ['paneer', 'mutton', 'fish', 'prawn', 'veg'].includes(t))) {
        return true;
    }

    // 4. Mutton should not match chicken or fish
    if (itemTokens.includes('mutton') && fileTokens.some(t => ['chicken', 'fish', 'paneer'].includes(t))) {
        return true;
    }

    return false;
};

/**
 * Computes match score (0 to 1.0) between a menu item and a Google Drive file.
 */
export const computeDriveMatchScore = (item, driveFile) => {
    const itemName = item?.name || '';
    const fileName = driveFile?.name || '';
    const isVeg = item?.is_veg;

    if (!itemName || !fileName) return { score: 0, matchType: 'none' };

    const rawFile = cleanDriveFileName(fileName);
    const normItem = normalizeTitle(itemName);
    const normFile = normalizeTitle(rawFile);

    if (!normItem || !normFile) return { score: 0, matchType: 'none' };

    // 1. Exact normalized match: 100%
    if (normItem === normFile) {
        return { score: 1.0, matchType: 'exact' };
    }

    // 2. Clean match without parentheses/portions: 98%
    const cleanItem = normalizeTitle(cleanTitle(itemName));
    const cleanFile = normalizeTitle(cleanTitle(rawFile));
    if (cleanItem && cleanFile && cleanItem === cleanFile) {
        return { score: 0.98, matchType: 'clean_exact' };
    }

    const itemTokens = normItem.split(' ').filter(Boolean).map(singularize);
    const fileTokens = normFile.split(' ').filter(Boolean).map(singularize);

    // Conflict check
    if (hasFoodConflict(itemTokens, fileTokens, isVeg)) {
        return { score: 0, matchType: 'conflict' };
    }

    // 3. Token order independence & anagram match (e.g. "Dum Aloo" vs "Alu Dum")
    const itemSet = new Set(itemTokens);
    const fileSet = new Set(fileTokens);

    if (itemSet.size === fileSet.size && [...itemSet].every(t => fileSet.has(t))) {
        return { score: 0.98, matchType: 'clean_exact' };
    }

    // Core tokens ignoring generic dish types like "noodles", "gravy", "dish", "bowl"
    const genericDescriptors = new Set(["noodle", "dish", "special", "fresh", "hot", "gravy", "dry", "bowl", "plate", "pcs", "piece"]);
    const coreItemTokens = itemTokens.filter(t => !genericDescriptors.has(t));
    const coreFileTokens = fileTokens.filter(t => !genericDescriptors.has(t));
    const coreItemSet = new Set(coreItemTokens);
    const coreFileSet = new Set(coreFileTokens);

    if (coreItemSet.size > 0 && coreItemSet.size === coreFileSet.size && [...coreItemSet].every(t => coreFileSet.has(t))) {
        return { score: 0.96, matchType: 'token_match' };
    }

    let matchCount = 0;
    for (const t of coreItemSet.size > 0 ? coreItemSet : itemSet) {
        if ((coreFileSet.size > 0 ? coreFileSet : fileSet).has(t)) matchCount++;
    }

    const baseItemSize = coreItemSet.size > 0 ? coreItemSet.size : itemSet.size;
    const baseFileSize = coreFileSet.size > 0 ? coreFileSet.size : fileSet.size;

    const itemCoverage = matchCount / Math.max(1, baseItemSize);
    const fileCoverage = matchCount / Math.max(1, baseFileSize);

    if (itemCoverage === 1.0 && fileCoverage >= 0.6) {
        return { score: 0.94, matchType: 'token_match' };
    }
    if (fileCoverage === 1.0 && itemCoverage >= 0.6) {
        return { score: 0.92, matchType: 'token_match' };
    }

    // 4. Fuzzy Levenshtein on clean strings
    const targetA = cleanItem || normItem;
    const targetB = cleanFile || normFile;
    const maxLen = Math.max(targetA.length, targetB.length);
    if (maxLen === 0) return { score: 0, matchType: 'none' };

    const dist = levenshteinDistance(targetA, targetB);
    const sim = (maxLen - dist) / maxLen;

    if (sim >= 0.75) {
        return {
            score: Number(sim.toFixed(2)),
            matchType: sim >= 0.90 ? 'high_fuzzy' : 'fuzzy'
        };
    }

    return { score: 0, matchType: 'none' };
};

/**
 * Matches an array of menu items against Google Drive files.
 */
export const matchMenuWithDriveFiles = (items, driveFiles, threshold = 0.85) => {
    const matched = [];
    const unmatched = [];
    const usedFileIds = new Set();

    // Map each item to candidate files that pass the threshold
    const itemCandidates = items.map(item => {
        const candidates = [];
        for (const file of driveFiles) {
            const result = computeDriveMatchScore(item, file);
            if (result.score >= threshold) {
                candidates.push({
                    file,
                    score: result.score,
                    matchType: result.matchType
                });
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        return { item, candidates };
    });

    // Sort items by highest match confidence first so best matches claim files
    itemCandidates.sort((a, b) => {
        const bestScoreA = a.candidates[0]?.score || 0;
        const bestScoreB = b.candidates[0]?.score || 0;
        return bestScoreB - bestScoreA;
    });

    for (const { item, candidates } of itemCandidates) {
        if (!candidates.length) {
            unmatched.push(item);
            continue;
        }

        // Pick highest scoring candidate that hasn't already been used, or best candidate if all used
        let chosen = candidates.find(c => !usedFileIds.has(c.file.id)) || candidates[0];
        usedFileIds.add(chosen.file.id);

        matched.push({
            item,
            bestFile: chosen.file,
            score: chosen.score,
            matchType: chosen.matchType,
            allCandidates: candidates.map(c => ({
                file: c.file,
                score: c.score,
                matchType: c.matchType
            }))
        });
    }

    // Preserve original item order for matched results
    matched.sort((a, b) => {
        const indexA = items.findIndex(i => i.id === a.item.id);
        const indexB = items.findIndex(i => i.id === b.item.id);
        return indexA - indexB;
    });

    return {
        matched,
        unmatched,
        totalItems: items.length,
        totalDriveFiles: driveFiles.length
    };
};

/**
 * Downloads a file from the authenticated Drive proxy and returns a File object.
 */
export const fetchDriveFileAsFile = async (activeResId, fileId, accessToken, desiredFileName = 'food.jpg') => {
    const proxyUrl = `/api/menu/${activeResId}/bulk-editor/drive-file?fileId=${fileId}&accessToken=${encodeURIComponent(accessToken)}&format=jpeg`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
        throw new Error(`Failed to download drive file (${response.statusText})`);
    }
    const blob = await response.blob();
    const cleanName = desiredFileName.endsWith('.jpg') ? desiredFileName : `${desiredFileName}.jpg`;
    return new File([blob], cleanName, { type: 'image/jpeg', lastModified: Date.now() });
};

/**
 * Returns a proxy thumbnail URL for instant preview without downloading full image.
 */
export const getDriveThumbnailUrl = (activeResId, fileId, accessToken) => {
    return `/api/menu/${activeResId}/bulk-editor/drive-file?fileId=${fileId}&accessToken=${encodeURIComponent(accessToken)}&thumb=1`;
};


-- ============================================================
-- D365 Edge Helper — Export display menu items
-- ============================================================
-- Produces a JSON array you can import directly via
--   Settings > Menu items > Import
--
-- Run against: AxDB (business database)
-- Access via:  LCS > Environment details > Database Accounts
--              or SSMS with the T-SQL endpoint
--
-- Two options below — use whichever your environment supports.
-- ============================================================


-- ── Option A: Business database only (AxDB) ─────────────────
--
-- Uses SECURITYPUBLISHEDENTRYPOINT, which is available in all
-- D365 F&O environments. Label is the flat translated name —
-- you will not get the full "Module > Area > Page" path here.
-- Edit the label column manually for the entries you care about.
--
-- OBJECTTYPE values:
--   1 = MenuItemDisplay  (use this for navigation pages)
--   2 = MenuItemAction
--   3 = MenuItemOutput

SELECT
    CONCAT(
        '  { "label": "',
        REPLACE(COALESCE(NULLIF(TRIM(ep.LABEL), ''), ep.OBJECTNAME), '"', '\"'),
        '", "mi": "',
        ep.OBJECTNAME,
        '" }'
    ) AS json_line
FROM SECURITYPUBLISHEDENTRYPOINT ep
WHERE ep.OBJECTTYPE = 1
  AND ep.OBJECTNAME IS NOT NULL
  AND LEN(ep.OBJECTNAME) > 0
ORDER BY ep.LABEL, ep.OBJECTNAME;

-- Copy the output rows, wrap in [ ] and save as a .json file:
--
-- [
--   { "label": "All customers",      "mi": "CustTableListPage" },
--   { "label": "All vendors",        "mi": "VendTableListPage" },
--   ...
-- ]


-- ── Option B: Model database (AxDB_model) ───────────────────
--
-- Available on self-hosted / Tier-2+ sandboxes where you have
-- access to the model database. Gives you the full AOT path so
-- you can build "Module > Area > Page" labels accurately.
--
-- If AxDB_model is not accessible, skip this query.

/*
SELECT
    CONCAT(
        '  { "label": "',
        -- Build path by walking up ParentId — adjust depth as needed
        COALESCE(grandparent.Name + ' > ', '') +
        COALESCE(parent.Name     + ' > ', '') +
        child.Name,
        '", "mi": "',
        child.Name,
        '" }'
    ) AS json_line
FROM AxDB_model.dbo.ModelElement child
LEFT JOIN AxDB_model.dbo.ModelElement parent
       ON parent.ElementId = child.ParentId
LEFT JOIN AxDB_model.dbo.ModelElement grandparent
       ON grandparent.ElementId = parent.ParentId
WHERE child.ElementType = 75          -- 75 = MenuItemDisplay in the AOT
  AND child.Name IS NOT NULL
ORDER BY grandparent.Name, parent.Name, child.Name;
*/


-- ── Default items (already seeded by the extension) ─────────
--
-- These ship in defaults/menu-items.json and are automatically
-- added to storage when the extension is installed or updated.
-- They will appear in any export from Settings > Menu items.
--
-- [
--   { "label": "General ledger > Journal entries > General journals",  "mi": "LedgerJournalTable3" },
--   { "label": "General ledger > Inquiries & reports > Trial balance", "mi": "LedgerTrialBalanceListPage" }
-- ]


-- ── Notes ────────────────────────────────────────────────────
--
-- * The extension uses `mi` as the ?mi= query parameter — it
--   must match the AOT name exactly (case-insensitive in D365).
--
-- * Extended menu items added by ISVs or customisations are
--   included in both queries automatically.
--
-- * For the "label" field, the recommended format is:
--     "Module > Area > Page name"
--   e.g. "General ledger > Journal entries > General journals"
--   You can post-process the Option A output with a formula in
--   Excel to prepend the module/area if you know the mapping.

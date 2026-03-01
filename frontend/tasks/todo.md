# Sidebar Task

## Plan

1. [x] Analyze `openclaw` sidebar structure and styles. <!-- id: 0 -->
2. [x] Identify all pages in `RushDino/frontend/src/pages/` and map them to sidebar items. <!-- id: 1 -->
3. [x] Create a new `Sidebar` component in `RushDino/frontend/src/components/sidebar/app-sidebar.tsx`. <!-- id: 2 -->
   - Port the grouped navigation layout from `openclaw`.
   - Use Lucide icons (already available in `RushDino`).
   - Support "collapsed" state if requested (as in `openclaw`).
4. [x] Define the navigation structure/types in a shared file if necessary. <!-- id: 3 -->
5. [x] Update `App.tsx` to: <!-- id: 4 -->
   - Include the new `AppSidebar`.
   - Handle navigation state for all tabs (overview, chat, agents, etc.).
   - Render the corresponding `Lit` template or React component based on the active tab.
6. [x] Port necessary CSS/Tailwind styles for the sidebar. <!-- id: 5 -->
7. [x] Verify that clicking sidebar items correctly switches views. <!-- id: 6 -->

## Review

- [x] Sidebar looks and feels premium like `openclaw`.
- [x] Navigation is smooth.
- [x] All pages are accessible (placeholders provided for views yet to be migrated to React).

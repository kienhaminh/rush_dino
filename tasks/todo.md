# Tasks: Fix Broken Imports in Lit Pages

The project has broken imports in several Lit-based pages in `frontend/src/pages/`. These pages were likely copied from Openclaw but the directory structure was changed, resulting in missing files at `../format.ts`, `../presenter.ts`, and `../types.ts`. These files are actually located in `../components/common/`.

## Progress

- [ ] Fix imports in `frontend/src/pages/agents-panels-status-files.ts`
- [ ] Identify and fix other broken imports in `frontend/src/pages/`
- [ ] Verify correctness by checking if files now resolve

## Plan

1. Update `agents-panels-status-files.ts` to use `../components/common/` for the missing modules.
2. Search for all occurrences of the broken imports in `src/pages/` and update them accordingly.
3. Check for any other missing dependencies that might cause issues.

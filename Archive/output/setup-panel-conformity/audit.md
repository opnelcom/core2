# Setup edit panel conformity audit

Checked 2026-10-05 against docs/erp/grid-edit-panel-standards.md.

## Findings

All seven requested editors retain stacked captions/controls and static action footers, rather than the documented caption-left/control-right convention and sticky, right-aligned footer. All have a close control after runtime installation. No requested editor is registered in the shared resize installer; the current guide names only record/report editors for that registration, so this is a capability gap rather than a proven mandatory violation for each of these setup screens.

| Screen | Placement/list | Additional findings |
| --- | --- | --- |
| Organisation | Right-anchored editor, full-width list | Runtime Definition and AI tabs use a bespoke organisation installer. AI and SVG fields also retain stacked captions. Long content scrolls the main action footer out of view. |
| Division | Right-anchored editor, full-width list | Stacked fields and static footer. No tabs; no supported module allocation identified, so Scope should not be invented. |
| Fiscal year | Right-anchored editor stack, full-width list | Stacked fields and static footer. Year/period stack is an existing workflow variation; the same field/footer pattern is present in the adjacent fiscal period editor by source inspection. |
| Countries | Right-anchored editor, full-width list | Long stacked form and static footer. |
| Currencies | Right-anchored editor, full-width list | Stacked format settings; preview remains outside a field row; static footer. |
| Tax types | Full-width list; wrongly anchored editor | view-taxtypes is missing from the position:relative view group. The absolute editor anchors outside its view; at narrow width its top overlaps the page header. |
| Resource roles | Desktop list occupies about 54.45% of split | Missing full-width split override. Modal placement is explicitly documented as an existing exception; retain or change deliberately. Definition/Scope tabs and module checklist exist, but ordinary fields are stacked and footer is static. |

## Evidence and limits

Ran `node Tools/ERP-Acceptance/test/setup-panel-conformity.browser.js` with system Edge. The read-only fixture loads production HTML/CSS plus actual required-marker, close-button and organisation-tab installers. Inspected whole-screen screenshots with each editor closed/open at 1440x900 and 390x900. Measurements are in audit.json; screenshots and overview images are alongside this report.

Scope: layout audit and source inspection. Fixture lists are unpopulated. Save, failed Save, API persistence, context request races, populated-grid row interaction and the deployed application were not exercised. Resource role event handlers and fiscal opening/reset/save paths were inspected in app.js. This report does not establish complete runtime conformity or database behaviour. No application behaviour was changed.

## Recommended correction

Extend a shared field-row/caption convention to these setup editors, reuse a shared sticky action footer and repair Tax Types' containing block and Resource Roles' split width. Preserve the fiscal workflow and supported tabs/module capabilities. Treat Resource Roles' modal-versus-overlay choice as a separate deliberate standard decision.
